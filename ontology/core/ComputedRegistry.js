export class ComputedRegistry {
  constructor(ontology) {
    this.ontology = ontology;
    this.derivations = new Map();
    this.cache = new Map();
    this._stack = [];
  }

  define(typeName, propName, fn) {
    if (typeof fn !== 'function') throw new Error(`Computed "${typeName}.${propName}" needs a function`);
    if (!this.derivations.has(typeName)) this.derivations.set(typeName, new Map());
    this.derivations.get(typeName).set(propName, fn);
  }

  has(typeName, propName) {
    return this.derivations.get(typeName)?.has(propName) ?? false;
  }

  computedNames(typeName) {
    return Array.from(this.derivations.get(typeName)?.keys() || []);
  }

  evaluate(typeName, id, propName, proxy) {
    const cacheKey = key(typeName, id, propName);
    this._recordRead(cacheKey);

    const useCache = !proxy._context;
    if (useCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey).value;
    }

    const fn = this.derivations.get(typeName)?.get(propName);
    if (!fn) return undefined;

    const tracker = new Set();
    this._stack.push(tracker);
    let value;
    try {
      value = fn(proxy);
    } finally {
      this._stack.pop();
    }

    if (useCache) {
      this.cache.set(cacheKey, { value, deps: tracker });
    }
    return value;
  }

  recordRead(typeName, id, propName) {
    this._recordRead(key(typeName, id, propName));
  }

  _recordRead(k) {
    if (this._stack.length === 0) return;
    this._stack[this._stack.length - 1].add(k);
  }

  invalidate(typeName, id, propName) {
    this._evictMatching(key(typeName, id, propName));
  }

  _evictMatching(targetKey) {
    const evicted = [];
    for (const [k, entry] of this.cache) {
      if (entry.deps.has(targetKey)) evicted.push(k);
    }
    if (!evicted.length) return;
    for (const k of evicted) this.cache.delete(k);
    for (const k of evicted) this._evictMatching(k);
  }

  invalidateAll() {
    this.cache.clear();
  }

  stats() {
    return {
      definitions: Array.from(this.derivations.entries()).reduce((n, [, m]) => n + m.size, 0),
      cached: this.cache.size,
    };
  }

  getSchema() {
    const out = {};
    for (const [type, props] of this.derivations) {
      out[type] = Array.from(props.keys());
    }
    return out;
  }
}

function key(typeName, id, prop) {
  return `${typeName}:${id}:${prop}`;
}
