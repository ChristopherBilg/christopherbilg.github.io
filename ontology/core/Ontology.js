import { ObjectProxy } from './ObjectProxy.js';
import { LinkCoordinator } from './LinkCoordinator.js';
import { ConstraintEngine } from './ConstraintEngine.js';
import { ComputedRegistry } from './ComputedRegistry.js';
import { QueryBuilder } from './QueryBuilder.js';
import { SecurityProvider } from './SecurityProvider.js';
import { BranchManager } from './BranchManager.js';
import { CRDTClock, crdtCompare } from './CRDTClock.js';
import { JSONAdapter } from './JSONAdapter.js';
import { DuckDBAdapter } from './DuckDBAdapter.js';
import { LocalState } from '../store/LocalState.js';
import { Dataset } from './Dataset.js';
import { validateTransformSpec } from './Transform.js';
import { LineageGraph } from './LineageGraph.js';

export class Ontology {
  constructor() {
    this.objectTypes = new Map();
    this.datasets = new Map();
    this.cache = new Map();
    this.listeners = new Map();
    this.loaded = false;
    this.links = new LinkCoordinator(this);
    this.constraints = new ConstraintEngine(this);
    this.computed = new ComputedRegistry(this);
    this.security = new SecurityProvider();
    this.branches = new BranchManager();
    this.clock = new CRDTClock();
    this.transforms = new Map();
    this.lineage = new LineageGraph();
  }

  defineDataset(spec) {
    if (this.datasets.has(spec.name)) {
      const existing = this.datasets.get(spec.name);
      if (spec.source?.kind === 'derived' && existing.source.kind === 'raw') {
        throw new Error(`Cannot define derived dataset "${spec.name}": name already used by a raw dataset`);
      }
      throw new Error(`Dataset "${spec.name}" already defined`);
    }
    const ds = new Dataset(spec, this);
    this.datasets.set(spec.name, ds);
    this.lineage.addNode(spec.name);
    return ds;
  }

  defineObject(name, config) {
    const adapter = config.adapter || 'json';
    if (!this.datasets.has(name)) {
      this.defineDataset({
        name,
        pk: config.pk,
        source: { kind: 'raw', adapter, backingData: config.backingData },
      });
    }
    this.objectTypes.set(name, { ...config, adapter, dataset: name });
  }

  defineTransform(spec) {
    validateTransformSpec(spec, { datasets: this.datasets, transforms: this.transforms });
    // Register derived dataset for the output.
    this.defineDataset({
      name: spec.output,
      pk: spec.pk,
      source: { kind: 'derived', transform: spec.name },
    });
    // Add edges input -> output.
    for (const inp of spec.inputs) this.lineage.addEdge(inp, spec.output);
    this.transforms.set(spec.name, spec);
    this._txByOutputCache = null;
    return spec;
  }

  _makeAdapter(typeName, config) {
    if (config.adapter === 'json')   return new JSONAdapter(typeName, config, this);
    if (config.adapter === 'duckdb') return new DuckDBAdapter(typeName, config, this);
    throw new Error(`Unknown adapter type "${config.adapter}" for ${typeName}`);
  }

  async load() {
    const jobs = [];
    this.adapters = new Map();
    for (const [name, config] of this.objectTypes) {
      if (config.adapter === 'derived') continue; // populated by BuildEngine after a build
      const adapter = this._makeAdapter(name, config);
      this.adapters.set(name, adapter);
      const ds = this.datasets.get(name);
      if (ds && ds.source.kind === 'raw') ds.attachAdapter(adapter);
      jobs.push(adapter.load());
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

  transformsByOutput() {
    if (!this._txByOutputCache) {
      const m = new Map();
      for (const [name, spec] of this.transforms) m.set(spec.output, name);
      this._txByOutputCache = m;
    }
    return this._txByOutputCache;
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
