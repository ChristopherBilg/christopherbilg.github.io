export class LinkCoordinator {
  constructor(ontology) {
    this.ontology = ontology;
    this.linkTypes = new Map();
    this.outgoing = new Map();
    this.incoming = new Map();
  }

  define(name, config) {
    if (!config.source) throw new Error(`Link "${name}" missing source`);
    if (!config.target) throw new Error(`Link "${name}" missing target`);
    if (!config.fk) throw new Error(`Link "${name}" missing fk`);
    this.linkTypes.set(name, config);

    if (!this.outgoing.has(config.source)) this.outgoing.set(config.source, new Set());
    this.outgoing.get(config.source).add(name);

    if (!this.incoming.has(config.target)) this.incoming.set(config.target, new Set());
    this.incoming.get(config.target).add(name);
  }

  get(name) {
    return this.linkTypes.get(name);
  }

  has(name) {
    return this.linkTypes.has(name);
  }

  names() {
    return Array.from(this.linkTypes.keys());
  }

  outgoingFor(typeName) {
    return Array.from(this.outgoing.get(typeName) || []);
  }

  incomingFor(typeName) {
    return Array.from(this.incoming.get(typeName) || []);
  }

  resolve(linkName, sourceId, context) {
    const link = this.linkTypes.get(linkName);
    if (!link) return [];
    const source = this.ontology.get(link.source, sourceId, context);
    if (!source) return [];

    if (link.direction === 'reverse') {
      return this.findByProperty(link.target, link.fk, sourceId, context);
    }

    const fkValue = source[link.fk];
    if (fkValue == null) return [];
    const target = this.ontology.get(link.target, fkValue, context);
    return target ? [target] : [];
  }

  findByProperty(typeName, prop, value, context) {
    const target = String(value);
    return this.ontology.all(typeName, context).filter((obj) => String(obj[prop]) === target);
  }

  getSchema() {
    const out = {};
    for (const [name, cfg] of this.linkTypes) {
      out[name] = { ...cfg };
    }
    return out;
  }
}
