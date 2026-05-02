// ontology/core/BuildEngine.js
// Orchestrates pipeline builds. Phase 2: SQL + JS execution against
// DuckDB-Wasm and a Web Worker respectively, full rebuild every time
// (no fingerprinting yet — that lands in Phase 3). One transform per call
// to .build(); .buildAll() walks all registered transforms in topo order.
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
// - Inputs are resolved as plain row arrays (via ontology.all() for raw
//   datasets, or Dataset.rows() for derived ones).
// - The body function is sent as a source string to workers/builder.js.
// - The worker reconstitutes it via new Function, runs it, returns rows.
// - 10s timeout: if the worker doesn't respond in time, it is terminated
//   and recreated; the build rejects with a timeout error.

import { DuckDBProvider } from './DuckDBProvider.js';

export class BuildEngine {
  constructor(ontology) {
    this.ontology = ontology;
    this._registeredJsonInputs = new Set();
    this._worker = null;
    this._pendingByTransform = new Map(); // transformName -> { resolve, reject, timer }
    this._inFlight = null;               // Carryover #2: serialize concurrent build() calls
  }

  // Build every registered transform once, in topo order.
  async buildAll() {
    const topo = this.ontology.lineage.topo();
    for (const datasetName of topo) {
      const transformName = this._transformProducing(datasetName);
      if (transformName) await this.build(transformName);
    }
  }

  // Carryover #2: serialize concurrent build() calls so they don't race on
  // the shared DuckDB connection or the single JS worker.
  async build(transformName) {
    while (this._inFlight) {
      try { await this._inFlight; } catch { /* prior build's error doesn't block this one */ }
    }
    this._inFlight = this._buildInternal(transformName);
    try {
      return await this._inFlight;
    } finally {
      this._inFlight = null;
    }
  }

  async _buildInternal(transformName) {
    const spec = this.ontology.transforms.get(transformName);
    if (!spec) throw new Error(`Unknown transform "${transformName}"`);

    // Build any upstream derived inputs first. Call _buildInternal directly
    // (not build()) because we are already inside the serialization lock;
    // calling build() here would deadlock waiting on this._inFlight.
    for (const inp of spec.inputs) {
      const inputDs = this.ontology.datasets.get(inp);
      if (inputDs && inputDs.source.kind === 'derived') {
        await this._buildInternal(inputDs.source.transform);
      }
    }

    const branch = this.ontology.branches.currentBranch || 'main';
    const startedAt = new Date().toISOString();
    console.info(`[build] ${transformName} on branch=${branch}`);

    let rows;
    try {
      if (spec.kind === 'sql') {
        rows = await this._executeSql(spec, branch);
      } else {
        rows = await this._executeJs(spec, branch);
      }
      const outDs = this.ontology.datasets.get(spec.output);
      outDs.setDerivedRows(rows);
      this.ontology.emit('build', {
        transform: transformName,
        output: spec.output,
        branch,
        rowCount: rows.length,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: 'ok',
      });
      return { status: 'ok', rowCount: rows.length };
    } catch (err) {
      this.ontology.emit('build:failed', {
        transform: transformName,
        output: spec.output,
        branch,
        error: err.message,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: 'failed',
      });
      throw err;
    }
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

  // Execute a JS transform body in the Web Worker.
  async _executeJs(spec, branch) {
    // Resolve inputs as plain arrays (honor branch + time-travel via the
    // existing read APIs). For raw datasets, we use ontology.all() so kinetic
    // edits and bi-temporal context flow through. For derived inputs, use the
    // raw dataset rows() directly (already branch-scoped via setDerivedRows
    // calls keyed by branch — Phase 4 makes this fully per-branch).
    const inputs = {};
    for (const inp of spec.inputs) {
      const ds = this.ontology.datasets.get(inp);
      if (ds.source.kind === 'raw') {
        // ontology.all() returns ObjectProxy instances; snapshot to plain rows.
        const objs = this.ontology.all(inp);
        inputs[inp] = objs.map((o) => o.snapshot ? o.snapshot() : { ...o });
      } else {
        inputs[inp] = ds.rows();
      }
    }

    if (!this._worker) this._worker = this._spawnWorker();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingByTransform.delete(spec.name);
        this._restartWorker();
        reject(new Error(`JS build "${spec.name}" timed out after 10s`));
      }, 10_000);
      this._pendingByTransform.set(spec.name, { resolve, reject, timer });
      this._worker.postMessage({
        kind: 'build',
        transformName: spec.name,
        body: spec.body.toString(),
        inputs,
      });
    });
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
      // Reject every in-flight build and recreate the worker.
      for (const [, p] of this._pendingByTransform) {
        clearTimeout(p.timer);
        p.reject(new Error(`worker error: ${err.message}`));
      }
      this._pendingByTransform.clear();
      this._restartWorker();
    });
    return w;
  }

  _restartWorker() {
    try { this._worker?.terminate(); } catch { /* ignore */ }
    this._worker = null;
  }
}
