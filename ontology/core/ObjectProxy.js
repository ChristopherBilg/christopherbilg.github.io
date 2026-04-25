export class ObjectProxy {
  constructor(ontology, typeName, id, baseRow) {
    this.ontology = ontology;
    this.typeName = typeName;
    this.id = id;
    this._base = baseRow;

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        const merged = target.ontology.mergeEdits(target.typeName, target.id, target._base);
        return merged[prop];
      },
      has(target, prop) {
        if (prop in target) return true;
        const merged = target.ontology.mergeEdits(target.typeName, target.id, target._base);
        return prop in merged;
      },
      ownKeys(target) {
        const merged = target.ontology.mergeEdits(target.typeName, target.id, target._base);
        return Reflect.ownKeys(merged);
      },
      getOwnPropertyDescriptor(target, prop) {
        const merged = target.ontology.mergeEdits(target.typeName, target.id, target._base);
        if (prop in merged) {
          return { enumerable: true, configurable: true, writable: false, value: merged[prop] };
        }
        return undefined;
      },
    });
  }

  links(linkName) {
    return this.ontology.resolveLink(linkName, this.id);
  }

  snapshot() {
    return this.ontology.mergeEdits(this.typeName, this.id, this._base);
  }

  hasEdits() {
    return this.ontology.getEdits(this.typeName, this.id).length > 0;
  }

  toJSON() {
    return this.snapshot();
  }
}
