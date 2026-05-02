// ontology/verify/task7_buildcatalog.js
import { assert, summary } from './_assert.js';
import { BuildCatalog } from '../core/BuildCatalog.js';
import { LineageGraph } from '../core/LineageGraph.js';

const cat = new BuildCatalog();
assert('latest of unknown is null', cat.latest('t', 'main') === null);
assert('history of unknown is empty', cat.history('t', 'main').length === 0);

cat.appendRecord({ id: 'b1', transform: 't', branch: 'main', status: 'ok',  finishedAt: '2026-05-02T00:00:01Z', fingerprint: { combined: 'h:1' }, rowCount: 3 });
cat.appendRecord({ id: 'b2', transform: 't', branch: 'main', status: 'ok',  finishedAt: '2026-05-02T00:00:02Z', fingerprint: { combined: 'h:1' }, rowCount: 3 });
cat.appendRecord({ id: 'b3', transform: 't', branch: 'main', status: 'failed', finishedAt: '2026-05-02T00:00:03Z', error: 'oops' });

const latest = cat.latest('t', 'main');
assert('latest is most recent', latest.id === 'b3');
assert('latestSuccessful skips failed', cat.latestSuccessful('t', 'main').id === 'b2');

const hist = cat.history('t', 'main');
assert('history newest-first', hist[0].id === 'b3' && hist[2].id === 'b1');

// Stale-hint round trip.
cat.setStaleHint('t', 'main', true);
assert('staleHint round-trips', cat.getStaleHint('t', 'main') === true);

// Downstream marking.
const g = new LineageGraph();
g.addNode('Raw'); g.addNode('Mid'); g.addNode('Leaf');
g.addEdge('Raw', 'Mid'); g.addEdge('Mid', 'Leaf');
const txByOutput = new Map([['Mid', 'midTx'], ['Leaf', 'leafTx']]);

cat.markDownstreamStale('Raw', g, 'main', txByOutput);
assert('mid stale after Raw change', cat.getStaleHint('midTx', 'main') === true);
assert('leaf stale after Raw change', cat.getStaleHint('leafTx', 'main') === true);

summary();
