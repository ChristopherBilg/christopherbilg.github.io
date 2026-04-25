export class ObjectProxy {
  constructor(ontology, typeName, id, baseRow, context) {
    this.ontology = ontology;
    this.typeName = typeName;
    this.id = id;
    this._base = baseRow;
    this._context = context || null;

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        const ont = target.ontology;
        if (ont.computed && typeof prop === 'string' && ont.computed.has(target.typeName, prop)) {
          return ont.computed.evaluate(target.typeName, target.id, prop, receiver);
        }
        if (ont.computed && typeof prop === 'string') {
          ont.computed.recordRead(target.typeName, target.id, prop);
        }
        const merged = ont.mergeEdits(target.typeName, target.id, target._base, target._context);
        return merged[prop];
      },
      has(target, prop) {
        if (prop in target) return true;
        const merged = target.ontology.mergeEdits(target.typeName, target.id, target._base, target._context);
        return prop in merged;
      },
      ownKeys(target) {
        const merged = target.ontology.mergeEdits(target.typeName, target.id, target._base, target._context);
        return Reflect.ownKeys(merged);
      },
      getOwnPropertyDescriptor(target, prop) {
        const merged = target.ontology.mergeEdits(target.typeName, target.id, target._base, target._context);
        if (prop in merged) {
          return { enumerable: true, configurable: true, writable: false, value: merged[prop] };
        }
        return undefined;
      },
    });
  }

  links(linkName) {
    return this.ontology.links.resolve(linkName, this.id, this._context);
  }

  snapshot() {
    return this.ontology.mergeEdits(this.typeName, this.id, this._base, this._context);
  }

  hasEdits() {
    return this.ontology.getEdits(this.typeName, this.id, this._context).length > 0;
  }

  toJSON() {
    return this.snapshot();
  }
}
