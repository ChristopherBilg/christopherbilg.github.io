// ontology/verify/task3_transform.js
import { assert, summary } from './_assert.js';
import { validateTransformSpec } from '../core/Transform.js';

const datasets = new Map([
  ['Flight', { name: 'Flight', pk: 'tail_number' }],
  ['Pilot',  { name: 'Pilot',  pk: 'pilot_id' }],
]);
const transforms = new Map();

const ok = validateTransformSpec({
  name: 'avgDelay',
  inputs: ['Flight'],
  output: 'AvgDelay',
  pk: 'origin',
  kind: 'sql',
  body: 'SELECT 1',
}, { datasets, transforms });
assert('valid spec returns the spec', ok && ok.name === 'avgDelay');

const cases = [
  ['missing name',     { inputs: ['Flight'], output: 'X', pk: 'p', kind: 'sql', body: 'S' }],
  ['empty inputs',     { name: 'T', inputs: [], output: 'X', pk: 'p', kind: 'sql', body: 'S' }],
  ['unknown input',    { name: 'T', inputs: ['Nope'], output: 'X', pk: 'p', kind: 'sql', body: 'S' }],
  ['no body for sql',  { name: 'T', inputs: ['Flight'], output: 'X', pk: 'p', kind: 'sql', body: '' }],
  ['non-fn body for js', { name: 'T', inputs: ['Flight'], output: 'X', pk: 'p', kind: 'js', body: 'string' }],
  ['unknown kind',     { name: 'T', inputs: ['Flight'], output: 'X', pk: 'p', kind: 'wat', body: 'S' }],
  ['output collides with dataset',
                       { name: 'T', inputs: ['Flight'], output: 'Flight', pk: 'p', kind: 'sql', body: 'S' }],
];
for (const [label, bad] of cases) {
  let threw = false;
  try { validateTransformSpec(bad, { datasets, transforms }); } catch { threw = true; }
  assert(`rejects: ${label}`, threw);
}

// Name collision with existing transform.
transforms.set('AlreadyHere', {});
let threw = false;
try {
  validateTransformSpec({
    name: 'AlreadyHere', inputs: ['Flight'], output: 'X', pk: 'p', kind: 'sql', body: 'S',
  }, { datasets, transforms });
} catch { threw = true; }
assert('rejects: transform name already used', threw);

summary();
