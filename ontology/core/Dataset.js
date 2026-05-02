// ontology/core/Dataset.js
// A Dataset is the typed-table primitive that lives below the ontology layer.
// Two flavors:
//   - raw:     populated by an adapter (JSONAdapter / DuckDBAdapter); rows() is
//              a thin pass-through over the existing Ontology.cache.
//   - derived: produced by a transform; rows() reads from an internal store
//              that BuildEngine writes after a successful build.
//
// Object types in the existing ontology layer bind to a Dataset by name. The
// existing read paths (Ontology.get, ObjectProxy, QueryBuilder, integrity worker)
// continue to read from Ontology.cache untouched.

export class Dataset {
  constructor({ name, pk, source }, ontology) {
    if (!name) throw new Error('Dataset requires a name');
    if (!pk) throw new Error(`Dataset "${name}" requires a pk`);
    if (!source || !source.kind) throw new Error(`Dataset "${name}" requires source.kind`);
    if (source.kind !== 'raw' && source.kind !== 'derived') {
      throw new Error(`Dataset "${name}" source.kind must be 'raw' or 'derived'`);
    }
    this.name = name;
    this.pk = pk;
    this.source = source;
    this.ontology = ontology;
    // Adapter for raw datasets is created lazily during ontology.load() (so we
    // share the same adapter instance the existing flow uses).
    this.adapter = null;
    // Rows for derived datasets live here. BuildEngine writes into this Map
    // (keyed by pk) on successful build. Raw datasets leave this null and read
    // through to Ontology.cache via the adapter.
    this._derivedRows = null;
  }

  // Wire the adapter for raw datasets. Called from Ontology.load() after the
  // existing _makeAdapter() machinery builds it.
  attachAdapter(adapter) {
    if (this.source.kind !== 'raw') {
      throw new Error(`Dataset "${this.name}" is not raw; cannot attachAdapter`);
    }
    this.adapter = adapter;
  }

  // Replace this derived dataset's rows. Called by BuildEngine on build success.
  // Also mirrors into Ontology.cache so any object types bound to this dataset
  // become visible to ObjectProxy / GraphView / query().from(...) /etc.
  setDerivedRows(rows) {
    if (this.source.kind !== 'derived') {
      throw new Error(`Dataset "${this.name}" is not derived; cannot setDerivedRows`);
    }
    // Validate every row's pk first into a fresh Map. Only after the loop
    // succeeds do we touch the cache or this._derivedRows. This makes the
    // operation transactional — a thrown row never leaves us half-built.
    const next = new Map();
    for (const row of rows) {
      const pkVal = row[this.pk];
      if (pkVal == null) {
        throw new Error(`Dataset "${this.name}": derived row missing pk "${this.pk}"`);
      }
      next.set(String(pkVal), row);
    }
    this._clearCacheForDataset();
    this._derivedRows = next;
    for (const [k, row] of next) {
      this.ontology.cache.set(`${this.name}:${k}`, row);
    }
  }

  _clearCacheForDataset() {
    const prefix = `${this.name}:`;
    for (const key of this.ontology.cache.keys()) {
      if (key.startsWith(prefix)) this.ontology.cache.delete(key);
    }
  }

  rows() {
    if (this.source.kind === 'derived') {
      return this._derivedRows ? Array.from(this._derivedRows.values()) : [];
    }
    // Raw: read through the adapter, which iterates Ontology.cache.
    if (!this.adapter) return [];
    return Array.from(this.adapter.allRows());
  }

  getRow(pkValue) {
    if (this.source.kind === 'derived') {
      return this._derivedRows ? this._derivedRows.get(String(pkValue)) || null : null;
    }
    if (!this.adapter) return null;
    return this.adapter.getRow(pkValue);
  }
}
