import { ObjectProxy } from './ObjectProxy.js';
import { LinkCoordinator } from './LinkCoordinator.js';
import { ConstraintEngine } from './ConstraintEngine.js';
import { ComputedRegistry } from './ComputedRegistry.js';
import { QueryBuilder } from './QueryBuilder.js';
import { SecurityProvider } from './SecurityProvider.js';
import { BranchManager } from './BranchManager.js';
import { CRDTClock, crdtCompare } from './CRDTClock.js';
import { LocalState } from '../store/LocalState.js';

export class Ontology {
  constructor() {
    this.objectTypes = new Map();
    this.cache = new Map();
    this.listeners = new Map();
    this.loaded = false;
    this.links = new LinkCoordinator(this);
    this.constraints = new ConstraintEngine(this);
    this.computed = new ComputedRegistry(this);
    this.security = new SecurityProvider();
    this.branches = new BranchManager();
    this.clock = new CRDTClock();
  }

  defineObject(name, config) {
    this.objectTypes.set(name, config);
  }

  async load() {
    const jobs = [];
    for (const [name, config] of this.objectTypes) {
      jobs.push(
        fetch(config.backingData)
          .then((res) => {
            if (!res.ok) throw new Error(`Failed to load ${config.backingData}: ${res.status}`);
            return res.json();
          })
          .then((rows) => {
            for (const row of rows) {
              this.cache.set(`${name}:${row[config.pk]}`, row);
            }
          }),
      );
    }
    await Promise.all(jobs);
    this.loaded = true;
    this.emit('loaded');
  }

  get(typeName, id, context) {
    const base = this.cache.get(`${typeName}:${id}`);
    if (!base) return null;
    if (!isVisible(base, context)) return null;
    if (this.security) {
      const merged = this.mergeEdits(typeName, id, base, context);
      if (!this.security.canRead(typeName, merged)) return null;
    }
    return new ObjectProxy(this, typeName, id, base, context);
  }

  all(typeName, context) {
    const out = [];
    const prefix = `${typeName}:`;
    for (const key of this.cache.keys()) {
      if (!key.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      const obj = this.get(typeName, id, context);
      if (obj) out.push(obj);
    }
    return out;
  }

  mergeEdits(typeName, id, baseRow, context) {
    const edits = this.getEdits(typeName, id, context);
    if (!edits.length) return { ...baseRow };
    const sorted = edits.slice().sort(crdtCompare);
    return sorted.reduce((acc, e) => ({ ...acc, ...e.changes }), { ...baseRow });
  }

  getEdits(typeName, id, context) {
    const edits = LocalState.getEditsFor(typeName, id);
    const activeBranches = this.branches ? this.branches.activeBranches() : null;
    return edits.filter((e) => {
      if (activeBranches && !activeBranches.has(e.branchId || 'main')) return false;
      if (context && !isVisible(e, context)) return false;
      return true;
    });
  }

  query() {
    return new QueryBuilder(this);
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(cb);
  }

  emit(event, payload) {
    (this.listeners.get(event) || []).forEach((cb) => cb(payload));
  }

  getSchema() {
    const objects = {};
    for (const [name, config] of this.objectTypes) {
      const sample = this._firstRowOf(name);
      objects[name] = {
        pk: config.pk,
        properties: sample ? Object.keys(sample).sort() : [],
      };
    }
    return { objects, links: this.links.getSchema() };
  }

  _firstRowOf(typeName) {
    const prefix = `${typeName}:`;
    for (const [key, row] of this.cache) {
      if (key.startsWith(prefix)) return row;
    }
    return null;
  }
}

function isVisible(record, context) {
  if (!context) return true;
  if (context.asOfTx && record.created_at && record.created_at > context.asOfTx) return false;
  if (context.asOfValid && record.valid_from && record.valid_from > context.asOfValid) return false;
  return true;
}
