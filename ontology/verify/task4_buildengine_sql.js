// ontology/verify/task4_buildengine_sql.js
// Run with the app loaded.
import { assert, summary } from './_assert.js';

const ont = globalThis.ontology;
const be  = globalThis.buildEngine;

assert('Ontology.transforms is a Map', ont.transforms instanceof Map);
assert('flightStatsByOrigin transform registered', ont.transforms.has('flightStatsByOrigin'));
assert('FlightStatsByOrigin dataset registered',   ont.datasets.has('FlightStatsByOrigin'));
assert('FlightStatsByOrigin source.kind is derived',
  ont.datasets.get('FlightStatsByOrigin').source.kind === 'derived');

await be.build('flightStatsByOrigin');

const ds = ont.datasets.get('FlightStatsByOrigin');
const rows = ds.rows();
assert('build produced rows', rows.length > 0);
assert('rows have origin pk',     rows.every((r) => typeof r.origin === 'string'));
assert('rows have flight_count',  rows.every((r) => typeof r.flight_count === 'number'));
assert('Ontology.cache mirrors derived rows',
  ont.cache.has(`FlightStatsByOrigin:${rows[0].origin}`));

// And via the existing query API.
const viaQuery = await ont.query().from('FlightStatsByOrigin').collect();
assert('query().from(derived).collect() works', viaQuery.length === rows.length);

summary();
