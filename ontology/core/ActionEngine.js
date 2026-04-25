import { LocalState } from '../store/LocalState.js';

export class ActionEngine {
  constructor(ontology) {
    this.ontology = ontology;
    this.definitions = new Map();
  }

  define(name, spec) {
    if (!spec.objectType) throw new Error(`Action "${name}" missing objectType`);
    if (!spec.idParam) throw new Error(`Action "${name}" missing idParam`);
    if (typeof spec.apply !== 'function') throw new Error(`Action "${name}" missing apply()`);
    this.definitions.set(name, spec);
  }

  has(name) {
    return this.definitions.has(name);
  }

  list() {
    return Array.from(this.definitions.keys());
  }

  availableFor(target) {
    const out = [];
    for (const [name, spec] of this.definitions) {
      if (spec.objectType !== target.typeName) continue;
      if (spec.availableWhen && !spec.availableWhen(target, this.ontology)) continue;
      out.push({ name, spec });
    }
    return out;
  }

  dispatch(name, params) {
    const spec = this.definitions.get(name);
    if (!spec) throw new Error(`Unknown action: ${name}`);

    const objectId = params[spec.idParam];
    const target = this.ontology.get(spec.objectType, objectId);
    if (!target) throw new Error(`Target not found: ${spec.objectType}:${objectId}`);

    if (spec.validate) {
      const err = spec.validate(target, params, this.ontology);
      if (err) throw new Error(err);
    }

    const changes = spec.apply(target, params, this.ontology);
    if (!changes || typeof changes !== 'object') {
      throw new Error(`Action "${name}" must return a changes object`);
    }

    const changeSet = {
      id: (crypto.randomUUID && crypto.randomUUID()) || `cs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      action: name,
      objectType: spec.objectType,
      objectId,
      params,
      changes,
      timestamp: new Date().toISOString(),
    };

    LocalState.appendChangeSet(changeSet);
    this.ontology.emit('action', changeSet);
    return changeSet;
  }

  undo(changeSetId) {
    const removed = LocalState.removeChangeSet(changeSetId);
    if (removed) this.ontology.emit('undo', removed);
    return removed;
  }

  history() {
    return LocalState.getAllChangeSets();
  }
}
