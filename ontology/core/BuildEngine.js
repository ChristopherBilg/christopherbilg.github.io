// ontology/core/BuildEngine.js
// Orchestrates pipeline builds. Phase 2: SQL-only execution against
// DuckDB-Wasm, full rebuild every time (no fingerprinting yet — that lands
// in Phase 3). One transform per call to .build(); .buildAll() walks all
// registered transforms in topo order.
//
// SQL execution model:
// - Each input dataset is registered as a DuckDB view named after the dataset.
//   For DuckDBAdapter inputs, the view already exists (the adapter created it
//   at load). For JSONAdapter inputs, we lazily call provider.registerJSON()
//   to surface the raw JSON inside DuckDB.
// - The transform body runs against those views.
// - The output is written to a persistent DuckDB table `<output>__<branch>`,
//   then read back as plain rows and handed to Dataset.setDerivedRows().

import { DuckDBProvider } from './DuckDBProvider.js';

export class BuildEngine {
  constructor(ontology) {
    this.ontology = ontology;
    this._registeredJsonInputs = new Set();
  }

  // Build every registered transform once, in topo order.
  async buildAll() {
    const topo = this.ontology.lineage.topo();
    for (const datasetName of topo) {
      const transformName = this._transformProducing(datasetName);
      if (transformName) await this.build(transformName);
    }
  }

  async build(transformName) {
    const spec = this.ontology.transforms.get(transformName);
    if (!spec) throw new Error(`Unknown transform "${transformName}"`);
    if (spec.kind !== 'sql') {
      throw new Error(`BuildEngine: kind "${spec.kind}" not yet supported (Phase 2 is SQL-only)`);
    }

    // Build any upstream derived inputs first.
    for (const inp of spec.inputs) {
      const inputDs = this.ontology.datasets.get(inp);
      if (inputDs && inputDs.source.kind === 'derived') {
        await this.build(inputDs.source.transform);
      }
    }

    const branch = this.ontology.branches.currentBranch || 'main';
    const startedAt = new Date().toISOString();
    console.info(`[build] ${transformName} on branch=${branch}`);

    try {
      const rows = await this._executeSql(spec, branch);
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
}
