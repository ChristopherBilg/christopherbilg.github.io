// ontology/verify/task4_buildengine_sql.js
// Run with the app loaded.
import { assert, summary } from './_assert.js';

const ont = globalThis.ontology;
const be  = globalThis.buildEngine;

assert('Ontology.transforms is a Map', ont.transforms instanceof Map);
assert('avgDelayByOrigin transform registered', ont.transforms.has('avgDelayByOrigin'));
assert('AvgDelayByOrigin dataset registered',   ont.datasets.has('AvgDelayByOrigin'));
assert('AvgDelayByOrigin source.kind is derived',
  ont.datasets.get('AvgDelayByOrigin').source.kind === 'derived');

await be.build('avgDelayByOrigin');

const ds = ont.datasets.get('AvgDelayByOrigin');
const rows = ds.rows();
assert('build produced rows', rows.length > 0);
assert('rows have origin pk',  rows.every((r) => typeof r.origin === 'string'));
assert('rows have avg_delay',  rows.every((r) => typeof r.avg_delay === 'number'));
assert('Ontology.cache mirrors derived rows',
  ont.cache.has(`AvgDelayByOrigin:${rows[0].origin}`));

// And via the existing query API.
const viaQuery = await ont.query().from('AvgDelayByOrigin').collect();
assert('query().from(derived).collect() works', viaQuery.length === rows.length);

summary();
