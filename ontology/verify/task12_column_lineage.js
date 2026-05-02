// ontology/verify/task12_column_lineage.js
import { assert, summary } from './_assert.js';

const ont = globalThis.ontology;
const be  = globalThis.buildEngine;

const avgSpec = ont.transforms.get('avgDelayByOrigin');
assert('avgDelayByOrigin has lineage', !!avgSpec.lineage);
assert('avgDelay column lineage references Flight.delay_minutes',
  avgSpec.lineage.avg_delay?.includes('Flight.delay_minutes'));

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
