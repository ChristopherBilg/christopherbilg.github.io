// ontology/verify/task5_buildengine_js.js
import { assert, summary } from './_assert.js';

const ont = globalThis.ontology;
const be  = globalThis.buildEngine;

assert('pilotWorkload registered', ont.transforms.has('pilotWorkload'));
assert('PilotWorkload dataset registered', ont.datasets.has('PilotWorkload'));

await be.build('pilotWorkload');

const rows = ont.datasets.get('PilotWorkload').rows();
assert('JS build produced rows', rows.length > 0);
assert('rows have pilot_id pk', rows.every((r) => typeof r.pilot_id === 'string'));
assert('rows have scheduled_flights count', rows.every((r) => typeof r.scheduled_flights === 'number'));

// Negative test: JS error in body should fail cleanly.
ont.transforms.set('badJsTransform', {
  name: 'badJsTransform',
  inputs: ['Flight'],
  output: 'BadJsOutput',
  pk: 'tail_number',
  kind: 'js',
  body: () => { throw new Error('intentional'); },
});
ont.datasets.set('BadJsOutput', new (await import('../core/Dataset.js')).Dataset(
  { name: 'BadJsOutput', pk: 'tail_number', source: { kind: 'derived', transform: 'badJsTransform' } },
  ont,
));
ont.lineage.addNode('BadJsOutput');
ont.lineage.addEdge('Flight', 'BadJsOutput');

let threw = false;
try { await be.build('badJsTransform'); } catch { threw = true; }
assert('JS body throw surfaces as build failure', threw);

// Carryover: identifier whitelist
let badIdentThrew = false;
try {
  ont.defineTransform({
    name: 'has spaces', inputs: ['Flight'], output: 'Y', pk: 'p', kind: 'sql', body: 'SELECT 1',
  });
} catch (err) {
  badIdentThrew = /not a valid identifier/.test(err.message);
}
assert('identifier whitelist rejects bad transform names', badIdentThrew);

let badOutputThrew = false;
try {
  ont.defineTransform({
    name: 'goodName', inputs: ['Flight'], output: 'X "; DROP', pk: 'p', kind: 'sql', body: 'SELECT 1',
  });
} catch (err) {
  badOutputThrew = /not a valid identifier/.test(err.message);
}
assert('identifier whitelist rejects bad output names', badOutputThrew);

// Carryover: in-flight serialization
const p1 = be.build('avgDelayByOrigin');
const p2 = be.build('avgDelayByOrigin');
const [r1, r2] = await Promise.all([p1, p2]);
assert('concurrent build calls both succeed', r1?.status === 'ok' && r2?.status === 'ok');

summary();
