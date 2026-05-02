// ontology/core/BuildEngine.js
// Orchestrates pipeline builds. Phase 3: catalog + fingerprint + hybrid
// staleness. Skip-if-unchanged, event-based downstream invalidation, and
// branch-discard cleanup added here. SQL + JS execution paths unchanged.
//
// SQL execution model:
// - Each input dataset is registered as a DuckDB view named after the dataset.
//   For DuckDBAdapter inputs, the view already exists (the adapter created it
//   at load). For JSONAdapter inputs, we lazily call provider.registerJSON()
//   to surface the raw JSON inside DuckDB.
// - The transform body runs against those views.
// - The output is written to a persistent DuckDB table `<output>__<branch>`,
//   then read back as plain rows and handed to Dataset.setDerivedRows().
//
// JS execution model:
// - Inputs are resolved as plain row arrays (via _resolveInputs) once before
//   fingerprinting; those same resolved rows are forwarded to the worker.
// - The body function is sent as a source string to workers/builder.js.
// - The worker reconstitutes it via new Function, runs it, returns rows.
// - 10s timeout: if the worker doesn't respond in time, _failAllPending
//   rejects every pending build and the worker is recreated.

import { DuckDBProvider } from './DuckDBProvider.js';
import { BuildCatalog } from './BuildCatalog.js';
import { hashDataset, hashCombined } from './Fingerprint.js';
import { validateLineageReferences } from './Transform.js';

export class BuildEngine {
  constructor(ontology) {
    this.ontology = ontology;
    this.catalog = new BuildCatalog();
    this._registeredJsonInputs = new Set();
    this._worker = null;
    this._pendingByTransform = new Map(); // transformName -> { resolve, reject, timer }
    this._inFlight = null;               // serialize concurrent build() calls
    this._lineageValidated = new Set();
    this._wireEventInvalidation();
  }

  // Subscribe to ontology events and branch changes so stale hints stay current.
  _wireEventInvalidation() {
    const ont = this.ontology;
    ont.on('action', (cs) => this._invalidateDownstream(cs?.objectType));
    ont.on('undo',   (cs) => this._invalidateDownstream(cs?.objectType));
    ont.on('loaded', () => this._invalidateAll());
    ont.branches?.onChange?.((kind, branch) => {
      if (kind === 'switch') this._invalidateAll();
      if (kind === 'discard') this._purgeBranch(branch);
    });
  }

  // Mark all transforms on the active branch stale (e.g., after loaded / switch).
  _invalidateAll() {
    const branch = this.ontology.branches?.currentBranch || 'main';
    for (const [name] of this.ontology.transforms) {
      this.catalog.setStaleHint(name, branch, true);
    }
  }

  // Mark every transform whose input chain reaches objectType as stale.
  _invalidateDownstream(objectType) {
    if (!objectType) return;
    const branch = this.ontology.branches?.currentBranch || 'main';
    const txByOutput = this.ontology.transformsByOutput();
    this.catalog.markDownstreamStale(objectType, this.ontology.lineage, branch, txByOutput);
  }

  // Drop every artifact + catalog entry for a discarded branch.
  // SQL artifacts: best-effort DROP TABLE. JS artifacts: catalog cleared;
  // the in-memory rows for a non-active branch are harmless.
  async _purgeBranch(branch) {
    if (!branch || branch === 'main') return;
    // Wait for any in-flight build to settle so we don't race against a build
    // that might append a catalog record after we clear the keys.
    if (this._inFlight) {
      try { await this._inFlight; } catch { /* ignore prior failure */ }
    }
    // Delegate catalog teardown to the public purge API.
    this.catalog.purge(branch);
    const provider = DuckDBProvider.shared();
    for (const [, spec] of this.ontology.transforms) {
      // Drop SQL artifact table if it exists.
      if (spec.kind === 'sql') {
        try {
          await provider.query(`DROP TABLE IF EXISTS "${spec.output}__${branch}"`);
        } catch (e) {
          console.warn(`[build] could not drop ${spec.output}__${branch}:`, e.message);
        }
      }
    }
  }

  // Build every registered transform once, in topo order.
  async buildAll(context = null) {
    const topo = this.ontology.lineage.topo();
    for (const datasetName of topo) {
      const transformName = this._transformProducing(datasetName);
      if (transformName) await this.build(transformName, context);
    }
  }

  // Serialize concurrent build() calls so they don't race on the shared
  // DuckDB connection or the single JS worker.
  async build(transformName, context = null) {
    while (this._inFlight) {
      try { await this._inFlight; } catch { /* prior build's error doesn't block this one */ }
    }
    this._inFlight = this._buildInternal(transformName, context);
    try {
      return await this._inFlight;
    } finally {
      this._inFlight = null;
    }
  }

  async _buildInternal(transformName, context) {
    const spec = this.ontology.transforms.get(transformName);
    if (!spec) throw new Error(`Unknown transform "${transformName}"`);

    // Build any upstream derived inputs first. Call _buildInternal directly
    // (not build()) because we are already inside the serialization lock;
    // calling build() here would deadlock waiting on this._inFlight.
    for (const inp of spec.inputs) {
      const inputDs = this.ontology.datasets.get(inp);
      if (inputDs && inputDs.source.kind === 'derived') {
        await this._buildInternal(inputDs.source.transform, context);
      }
    }

    // Validate lineage column references AFTER upstream recursion. Lazy validation needs
    // every input dataset's rows() to be populated; derived inputs only have rows after
    // their build completes.
    if (!this._lineageValidated.has(transformName)) {
      validateLineageReferences(spec, this.ontology.datasets);
      this._lineageValidated.add(transformName);
    }

    const branch = this.ontology.branches?.currentBranch || 'main';
    const startedAt = new Date().toISOString();
    const id = `b_${Math.random().toString(16).slice(2, 8)}`;

    console.info(`[build] ${transformName} on branch=${branch}`);

    // ── Emit build:start so UI can show 'building' state ─────────────────
    // The entire post-emit path is wrapped in one try/catch so that EVERY
    // throw — including those from _resolveInputs, fingerprinting, or the
    // skip-path appendRecord — produces a 'build:failed' event and a failed
    // catalog record.  This preserves the invariant: exactly one of
    // 'build', 'build:skipped', 'build:failed' fires after every 'build:start'.
    this.ontology.emit('build:start', { transform: transformName, branch });

    // Accumulate fingerprint state here so the catch block can reference it
    // even if we only got partway through fingerprinting before an error.
    let perInput = {};
    let combined = null;

    try {
      // ── Fingerprint inputs ──────────────────────────────────────────────
      const inputRows = await this._resolveInputs(spec, branch, context);
      for (const [name, rows] of Object.entries(inputRows)) {
        const ds = this.ontology.datasets.get(name);
        perInput[name] = hashDataset(rows, ds.pk);
      }
      combined = hashCombined(perInput);

      // ── Skip-if-unchanged ───────────────────────────────────────────────
      const last = this.catalog.latestSuccessful(transformName, branch);
      if (last && last.fingerprint?.combined === combined) {
        const record = {
          id,
          transform: transformName,
          branch,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          status: 'skipped',
          skippedReason: 'inputs-unchanged',
          fingerprint: { inputs: perInput, combined },
          rowCount: last.rowCount,
          error: null,
          asOfTx: context?.asOfTx ?? null,
          asOfValid: context?.asOfValid ?? null,
        };
        this.catalog.appendRecord(record);
        this.catalog.setStaleHint(transformName, branch, false);
        this.ontology.emit('build:skipped', record);
        return record;
      }

      // ── Execute ─────────────────────────────────────────────────────────
      let rows;
      if (spec.kind === 'sql') {
        rows = await this._executeSql(spec, branch);
      } else {
        rows = await this._executeJsWithRows(spec, inputRows);
      }

      const finishedAt = new Date().toISOString();
      const outDs = this.ontology.datasets.get(spec.output);
      outDs.setDerivedRows(rows);

      const record = {
        id,
        transform: transformName,
        branch,
        startedAt,
        finishedAt,
        durationMs: new Date(finishedAt) - new Date(startedAt),
        status: 'ok',
        skippedReason: null,
        fingerprint: { inputs: perInput, combined },
        rowCount: rows.length,
        error: null,
        asOfTx: context?.asOfTx ?? null,
        asOfValid: context?.asOfValid ?? null,
      };
      this.catalog.appendRecord(record);
      this.catalog.setStaleHint(transformName, branch, false);
      this._invalidateDownstream(spec.output);
      this.ontology.emit('build', record);
      return record;
    } catch (err) {
      const finishedAt = new Date().toISOString();
      const record = {
        id,
        transform: transformName,
        branch,
        startedAt,
        finishedAt,
        durationMs: new Date(finishedAt) - new Date(startedAt),
        status: 'failed',
        skippedReason: null,
        // perInput / combined may be partially populated if the error was thrown
        // mid-fingerprint; include whatever we have for diagnostic value.
        fingerprint: { inputs: perInput, combined },
        rowCount: 0,
        error: err.message,
        asOfTx: context?.asOfTx ?? null,
        asOfValid: context?.asOfValid ?? null,
      };
      this.catalog.appendRecord(record);
      // Do NOT clear the stale hint; do NOT invalidate downstream.
      this.ontology.emit('build:failed', record);
      throw err;
    }
  }

  // Resolve all inputs for a transform into plain row arrays.
  // For raw datasets: uses ontology.all() so kinetic edits and bi-temporal
  // context flow through. For derived inputs: uses Dataset.rows() directly.
  async _resolveInputs(spec, _branch, context) {
    const out = {};
    for (const inp of spec.inputs) {
      const ds = this.ontology.datasets.get(inp);
      if (ds.source.kind === 'raw') {
        // ontology.all() returns ObjectProxy instances; snapshot to plain rows.
        const objs = this.ontology.all(inp, context);
        out[inp] = objs.map((o) => (o.snapshot ? o.snapshot() : { ...o }));
      } else {
        out[inp] = ds.rows();
      }
    }
    return out;
  }

  _transformProducing(datasetName) {
    for (const [tName, spec] of this.ontology.transforms) {
      if (spec.output === datasetName) return tName;
    }
    return null;
  }

  async _executeSql(spec, branch) {
    const provider = DuckDBProvider.shared();
    await provider.init();

    // Make each input visible inside DuckDB under its dataset name.
    for (const inp of spec.inputs) {
      await this._materializeInputView(inp, branch, provider);
    }

    const outTable = `${spec.output}__${branch}`;
    // CREATE OR REPLACE TABLE ... AS <body> — DuckDB can do this in one statement.
    const sql = `CREATE OR REPLACE TABLE "${outTable}" AS ${spec.body}`;
    await provider.query(sql);

    const rows = await provider.query(`SELECT * FROM "${outTable}"`);
    return rows;
  }

  // Ensure dataset `inp` is queryable as a view named `inp` in DuckDB.
  async _materializeInputView(inp, branch, provider) {
    // Note: the input view name is the bare dataset name (e.g., "Flight"),
    // not branch-qualified. This means concurrent builds across different
    // branches WOULD clobber each other's input views — the second one to
    // run would replace the first's view. Phase 2-3 only build on the
    // active branch sequentially, so this is acceptable. Branch-aware
    // concurrent builds would need branch-qualified input view names too.
    const ds = this.ontology.datasets.get(inp);
    if (!ds) throw new Error(`BuildEngine: input dataset "${inp}" not registered`);

    if (ds.source.kind === 'derived') {
      // Derived inputs live in `<inp>__<branch>` after their build. Alias as `inp`.
      await provider.query(
        `CREATE OR REPLACE VIEW "${inp}" AS SELECT * FROM "${inp}__${branch}"`,
      );
      return;
    }

    // Raw input. Adapter dictates how it gets into DuckDB.
    if (ds.source.adapter === 'duckdb') {
      // DuckDBAdapter already created a view named after `<typeName.toLowerCase()>s`
      // (e.g., `flights`). Alias it as `inp` (the dataset/typeName, e.g., `Flight`).
      const tableName = `${inp.toLowerCase()}s`;
      await provider.query(
        `CREATE OR REPLACE VIEW "${inp}" AS SELECT * FROM "${tableName}"`,
      );
      return;
    }

    // adapter === 'json'. Register the JSON file lazily.
    if (this._registeredJsonInputs.has(inp)) {
      // Already registered earlier — but the view name was `inp` directly.
      return;
    }
    await provider.registerJSON(inp, ds.source.backingData);
    // provider.registerJSON creates `CREATE OR REPLACE VIEW <name> AS ...`,
    // so a view named `inp` now exists. Track to avoid re-registering.
    this._registeredJsonInputs.add(inp);
  }

  // Execute a JS transform body in the Web Worker with pre-resolved input rows.
  // Inputs are resolved once (in _buildInternal) for fingerprinting; we reuse
  // them here to avoid a second snapshot that could differ mid-execution.
  async _executeJsWithRows(spec, inputRows) {
    if (!this._worker) this._worker = this._spawnWorker();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Reject ALL pending builds (not just this one) and recreate the worker,
        // mirroring the worker error handler. The current entry is also in the
        // map so _failAllPending covers it — no need to special-case it.
        this._restartWorker();
        this._failAllPending(new Error(`JS build "${spec.name}" timed out after 10s`));
      }, 10_000);
      this._pendingByTransform.set(spec.name, { resolve, reject, timer });
      this._worker.postMessage({
        kind: 'build',
        transformName: spec.name,
        body: spec.body.toString(),
        inputs: inputRows,
      });
    });
  }

  // Reject every pending JS build with err and clear the pending map.
  // Used by both the timeout callback and the worker error handler.
  _failAllPending(err) {
    for (const [, p] of this._pendingByTransform) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this._pendingByTransform.clear();
  }

  _spawnWorker() {
    const w = new Worker('./workers/builder.js', { type: 'module' });
    w.addEventListener('message', (ev) => {
      const { kind, transformName, rows, message } = ev.data || {};
      const pending = this._pendingByTransform.get(transformName);
      if (!pending) return;
      this._pendingByTransform.delete(transformName);
      clearTimeout(pending.timer);
      if (kind === 'ok') pending.resolve(rows);
      else pending.reject(new Error(message || 'unknown JS build error'));
    });
    w.addEventListener('error', (err) => {
      console.error('[builder.worker] error', err.message);
      // Reject every in-flight build via _failAllPending, then recreate worker.
      this._failAllPending(new Error(`worker error: ${err.message}`));
      this._restartWorker();
    });
    return w;
  }

  _restartWorker() {
    try { this._worker?.terminate(); } catch { /* ignore */ }
    this._worker = null;
  }
}
