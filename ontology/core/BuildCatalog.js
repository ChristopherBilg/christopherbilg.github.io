// ontology/core/BuildCatalog.js
// In-memory catalog of build records. Newest-last in storage; history()
// returns newest-first by reversing on read. Also stores a `staleHint` flag
// per (transform, branch) — written by event-driven invalidation, cleared
// by successful (or skipped) builds.

export class BuildCatalog {
  constructor() {
    this._records = new Map();   // "transform::branch" -> Array<record>
    this._staleHints = new Map(); // "transform::branch" -> boolean
  }

  // Identifier safety: transform names are validated to /^[A-Za-z_][A-Za-z0-9_]*$/ in
  // Transform.js, branch names to /^[a-z0-9_-]+$/i in BranchManager.js. Neither
  // permits "::", so this delimiter is collision-free.
  _key(transform, branch) { return `${transform}::${branch}`; }

  appendRecord(record) {
    if (!record?.transform || !record?.branch) {
      throw new Error('BuildCatalog: record requires transform and branch');
    }
    const key = this._key(record.transform, record.branch);
    if (!this._records.has(key)) this._records.set(key, []);
    this._records.get(key).push(record);
  }

  latest(transform, branch) {
    const arr = this._records.get(this._key(transform, branch));
    if (!arr || arr.length === 0) return null;
    return arr[arr.length - 1];
  }

  latestSuccessful(transform, branch) {
    const arr = this._records.get(this._key(transform, branch));
    if (!arr) return null;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].status === 'ok' || arr[i].status === 'skipped') return arr[i];
    }
    return null;
  }

  history(transform, branch) {
    const arr = this._records.get(this._key(transform, branch));
    return arr ? arr.slice().reverse() : [];
  }

  setStaleHint(transform, branch, value) {
    this._staleHints.set(this._key(transform, branch), Boolean(value));
  }

  getStaleHint(transform, branch) {
    return Boolean(this._staleHints.get(this._key(transform, branch)));
  }

  markDownstreamStale(datasetName, lineageGraph, branch, transformsByOutput) {
    for (const ds of lineageGraph.downstreamOf(datasetName)) {
      const tx = transformsByOutput.get(ds);
      if (tx) this.setStaleHint(tx, branch, true);
    }
  }
}
