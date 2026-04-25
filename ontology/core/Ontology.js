import { ObjectProxy } from './ObjectProxy.js';
import { LocalState } from '../store/LocalState.js';

export class Ontology {
  constructor() {
    this.objectTypes = new Map();
    this.linkTypes = new Map();
    this.cache = new Map();
    this.listeners = new Map();
    this.loaded = false;
  }

  defineObject(name, config) {
    this.objectTypes.set(name, config);
  }

  defineLink(name, config) {
    this.linkTypes.set(name, config);
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

  get(typeName, id) {
    const base = this.cache.get(`${typeName}:${id}`);
    if (!base) return null;
    return new ObjectProxy(this, typeName, id, base);
  }

  all(typeName) {
    const out = [];
    const prefix = `${typeName}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        const id = key.slice(prefix.length);
        out.push(this.get(typeName, id));
      }
    }
    return out;
  }

  resolveLink(linkName, sourceId) {
    const link = this.linkTypes.get(linkName);
    if (!link) return [];
    const source = this.get(link.source, sourceId);
    if (!source) return [];

    if (link.direction === 'reverse') {
      return this.findByProperty(link.target, link.fk, sourceId);
    }

    const fkValue = source[link.fk];
    if (fkValue == null) return [];
    const target = this.get(link.target, fkValue);
    return target ? [target] : [];
  }

  findByProperty(typeName, prop, value) {
    const target = String(value);
    return this.all(typeName).filter((obj) => String(obj[prop]) === target);
  }

  mergeEdits(typeName, id, baseRow) {
    const edits = LocalState.getEditsFor(typeName, id);
    if (!edits.length) return { ...baseRow };
    return edits.reduce((acc, edit) => ({ ...acc, ...edit.changes }), { ...baseRow });
  }

  getEdits(typeName, id) {
    return LocalState.getEditsFor(typeName, id);
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(cb);
  }

  emit(event, payload) {
    (this.listeners.get(event) || []).forEach((cb) => cb(payload));
  }
}
