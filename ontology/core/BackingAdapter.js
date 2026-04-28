export class BackingAdapter {
  constructor(typeName, config, ontology) {
    this.typeName = typeName;
    this.config = config;
    this.ontology = ontology;
  }

  async load() {
    throw new Error(`${this.constructor.name}.load() not implemented`);
  }

  getRow(id) {
    return this.ontology.cache.get(`${this.typeName}:${id}`) || null;
  }

  *allRows() {
    const prefix = `${this.typeName}:`;
    for (const [key, row] of this.ontology.cache) {
      if (key.startsWith(prefix)) yield row;
    }
  }

  getSchema() {
    let sample = null;
    for (const row of this.allRows()) { sample = row; break; }
    return {
      pk: this.config.pk,
      properties: sample ? Object.keys(sample).sort() : [],
    };
  }
}
