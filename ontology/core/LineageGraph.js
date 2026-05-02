// ontology/core/LineageGraph.js
// Dependency DAG over dataset names. Nodes are dataset names (strings).
// Edges go from input → output. Used by BuildEngine for topo-ordering builds
// and by the staleness machinery for downstream propagation.

export class LineageGraph {
  constructor() {
    this.nodes = new Set();
    this.outgoing = new Map(); // name -> Set<name> (forward edges)
    this.incoming = new Map(); // name -> Set<name> (reverse edges)
  }

  addNode(name) {
    if (!name || typeof name !== 'string') throw new Error('addNode needs a string name');
    if (this.nodes.has(name)) return;
    this.nodes.add(name);
    this.outgoing.set(name, new Set());
    this.incoming.set(name, new Set());
  }

  addEdge(from, to) {
    if (!this.nodes.has(from)) throw new Error(`LineageGraph: unknown source "${from}"`);
    if (!this.nodes.has(to))   throw new Error(`LineageGraph: unknown target "${to}"`);
    if (from === to)           throw new Error(`LineageGraph: self-loop "${from}" -> "${to}" rejected`);
    if (this._reaches(to, from)) {
      throw new Error(`LineageGraph: edge "${from}" -> "${to}" would form a cycle`);
    }
    this.outgoing.get(from).add(to);
    this.incoming.get(to).add(from);
  }

  // Does `start` transitively reach `target` via outgoing edges?
  _reaches(start, target) {
    if (start === target) return true;
    const stack = [start];
    const seen = new Set();
    while (stack.length) {
      const cur = stack.pop();
      if (cur === target) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of this.outgoing.get(cur) || []) stack.push(next);
    }
    return false;
  }

  // Kahn's algorithm. Stable in declaration order for the inputs we care about.
  topo() {
    const inDeg = new Map();
    for (const n of this.nodes) inDeg.set(n, this.incoming.get(n).size);
    const ready = [];
    for (const n of this.nodes) if (inDeg.get(n) === 0) ready.push(n);
    const out = [];
    while (ready.length) {
      const n = ready.shift();
      out.push(n);
      for (const next of this.outgoing.get(n)) {
        inDeg.set(next, inDeg.get(next) - 1);
        if (inDeg.get(next) === 0) ready.push(next);
      }
    }
    if (out.length !== this.nodes.size) {
      throw new Error('LineageGraph: cycle detected during topo (should never happen post-addEdge)');
    }
    return out;
  }

  downstreamOf(name) {
    if (!this.nodes.has(name)) return new Set();
    const out = new Set();
    const stack = [...(this.outgoing.get(name) || [])];
    while (stack.length) {
      const n = stack.pop();
      if (out.has(n)) continue;
      out.add(n);
      for (const next of this.outgoing.get(n) || []) stack.push(next);
    }
    return out;
  }

  upstreamOf(name) {
    if (!this.nodes.has(name)) return new Set();
    const out = new Set();
    const stack = [...(this.incoming.get(name) || [])];
    while (stack.length) {
      const n = stack.pop();
      if (out.has(n)) continue;
      out.add(n);
      for (const next of this.incoming.get(n) || []) stack.push(next);
    }
    return out;
  }
}
