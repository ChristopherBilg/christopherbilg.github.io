// ontology/verify/task12_column_lineage.js
import { assert, summary } from './_assert.js';

const ont = globalThis.ontology;
const be  = globalThis.buildEngine;

const statsSpec = ont.transforms.get('flightStatsByOrigin');
assert('flightStatsByOrigin has lineage', !!statsSpec.lineage);
assert('flight_count column lineage references Flight.origin',
  statsSpec.lineage.flight_count?.includes('Flight.origin'));

// Register a bad transform with a bogus column and try to build → should throw.
ont.defineTransform({
  name: '__bogus_lineage',
  inputs: ['Flight'],
  output: 'BogusOutput',
  pk: 'tail_number',
  kind: 'js',
  body: (inp) => inp.Flight.slice(),
  lineage: { tail_number: ['Flight.NOT_A_COLUMN'] },
});
ont.objectTypes.set('BogusOutput', { pk: 'tail_number', adapter: 'derived', dataset: 'BogusOutput' });

let threw = false;
try { await be.build('__bogus_lineage'); } catch (err) {
  threw = /not a column/i.test(err.message) || /unknown column/i.test(err.message);
}
assert('bogus column lineage rejected at build time', threw);

summary();
