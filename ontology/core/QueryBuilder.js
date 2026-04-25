const DEFAULT_MAX_DEPTH = 8;

export class QueryBuilder {
  constructor(ontology) {
    this.ontology = ontology;
    this._steps = [];
    this._maxDepth = DEFAULT_MAX_DEPTH;
    this._context = null;
  }

  from(typeName) {
    this._steps.push({ kind: 'from', type: typeName });
    return this;
  }

  startingFrom(...objects) {
    this._steps.push({ kind: 'startingFrom', objects });
    return this;
  }

  traverse(linkName) {
    this._steps.push({ kind: 'traverse', linkName });
    return this;
  }

  where(predicate) {
    if (typeof predicate !== 'function') throw new Error('where() needs a function');
    this._steps.push({ kind: 'where', predicate });
    return this;
  }

  asOf(context) {
    this._context = context;
    return this;
  }

  maxDepth(n) {
    this._maxDepth = n;
    return this;
  }

  collect() {
    let frontier = [];
    let traversals = 0;

    for (const step of this._steps) {
      if (step.kind === 'from') {
        frontier = this.ontology.all(step.type, this._context);
      } else if (step.kind === 'startingFrom') {
        frontier = step.objects.slice();
      } else if (step.kind === 'traverse') {
        traversals++;
        if (traversals > this._maxDepth) {
          throw new Error(`Max traversal depth ${this._maxDepth} exceeded`);
        }
        const visited = new Set();
        const next = [];
        for (const obj of frontier) {
          if (typeof obj?.links !== 'function') continue;
          for (const target of obj.links(step.linkName)) {
            const k = `${target.typeName}:${target.id}`;
            if (visited.has(k)) continue;
            visited.add(k);
            next.push(target);
          }
        }
        frontier = next;
      } else if (step.kind === 'where') {
        frontier = frontier.filter((obj) => {
          try { return Boolean(step.predicate(obj)); }
          catch { return false; }
        });
      }
    }

    return frontier;
  }

  count() {
    return this.collect().length;
  }

  describe() {
    return this._steps.map((s) => {
      if (s.kind === 'from') return `from(${s.type})`;
      if (s.kind === 'startingFrom') return `startingFrom([${s.objects.length}])`;
      if (s.kind === 'traverse') return `traverse(${s.linkName})`;
      if (s.kind === 'where') return 'where(…)';
      return s.kind;
    }).join(' → ');
  }
}
