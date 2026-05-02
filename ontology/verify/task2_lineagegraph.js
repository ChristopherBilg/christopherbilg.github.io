// ontology/verify/task2_lineagegraph.js
import { assert, summary } from './_assert.js';
import { LineageGraph } from '../core/LineageGraph.js';

const g = new LineageGraph();
g.addNode('A'); g.addNode('B'); g.addNode('C'); g.addNode('D');
g.addEdge('A', 'B');
g.addEdge('B', 'C');
g.addEdge('A', 'D');

const topo = g.topo();
assert('topo includes all nodes', topo.length === 4);
assert('A before B in topo', topo.indexOf('A') < topo.indexOf('B'));
assert('B before C in topo', topo.indexOf('B') < topo.indexOf('C'));
assert('A before D in topo', topo.indexOf('A') < topo.indexOf('D'));

assert('downstream of A is {B,C,D}',
  setEq(g.downstreamOf('A'), ['B', 'C', 'D']));
assert('downstream of B is {C}',
  setEq(g.downstreamOf('B'), ['C']));
assert('downstream of C is empty',
  setEq(g.downstreamOf('C'), []));
assert('upstream of C is {A,B}',
  setEq(g.upstreamOf('C'), ['A', 'B']));
assert('upstream of A is empty',
  setEq(g.upstreamOf('A'), []));

// Cycle detection.
let threw = false;
try { g.addEdge('C', 'A'); } catch { threw = true; }
assert('multi-step cycle rejected', threw);

const g2 = new LineageGraph();
g2.addNode('X');
let threwSelf = false;
try { g2.addEdge('X', 'X'); } catch { threwSelf = true; }
assert('self-loop rejected', threwSelf);

let threwUnknown = false;
try { g2.addEdge('X', 'NotRegistered'); } catch { threwUnknown = true; }
assert('unknown target rejected', threwUnknown);

summary();

function setEq(setLike, arr) {
  const a = Array.from(setLike).sort();
  const b = arr.slice().sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
