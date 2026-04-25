export class ConstraintEngine {
  constructor(ontology) {
    this.ontology = ontology;
    this.constraints = new Map();
    this.byType = new Map();
  }

  define(name, spec) {
    if (!spec.objectType) throw new Error(`Constraint "${name}" missing objectType`);
    if (typeof spec.check !== 'function') throw new Error(`Constraint "${name}" missing check()`);
    this.constraints.set(name, spec);
    if (!this.byType.has(spec.objectType)) this.byType.set(spec.objectType, new Set());
    this.byType.get(spec.objectType).add(name);
  }

  check(target, changes) {
    const names = this.byType.get(target.typeName);
    if (!names) return null;
    for (const name of names) {
      const spec = this.constraints.get(name);
      if (spec.triggers && !spec.triggers.some((t) => t in changes)) continue;
      const err = spec.check(target, changes, this.ontology);
      if (err) return { constraint: name, message: err };
    }
    return null;
  }

  list() {
    return Array.from(this.constraints.entries()).map(([name, spec]) => ({
      name,
      objectType: spec.objectType,
      triggers: spec.triggers || null,
      description: spec.description || null,
    }));
  }

  getSchema() {
    return this.list();
  }
}
