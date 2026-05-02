// ontology/verify/task6_fingerprint.js
import { assert, summary } from './_assert.js';
import { hashDataset, hashCombined } from '../core/Fingerprint.js';

const a = [{ id: 1, x: 'a' }, { id: 2, x: 'b' }];
const b = [{ id: 2, x: 'b' }, { id: 1, x: 'a' }];
const c = [{ id: 1, x: 'a' }, { id: 2, x: 'B' }];

const ha = hashDataset(a, 'id');
const hb = hashDataset(b, 'id');
const hc = hashDataset(c, 'id');

assert('hash format is h:<8 hex>', /^h:[0-9a-f]{8}$/.test(ha));
assert('order-insensitive (sort by pk)', ha === hb);
assert('field change yields different hash', ha !== hc);

// Combined hash.
const k1 = hashCombined({ Flight: ha, Pilot: hc });
const k2 = hashCombined({ Pilot: hc, Flight: ha });
assert('combined order-insensitive', k1 === k2);

const k3 = hashCombined({ Flight: ha });
assert('combined differs when inputs differ', k1 !== k3);

// CRDT awareness.
const r1 = [{ id: 1, x: 'a', lamport: 5, nodeId: 'n' }];
const r2 = [{ id: 1, x: 'a', lamport: 5, nodeId: 'n' }];
const r3 = [{ id: 1, x: 'a', lamport: 6, nodeId: 'n' }];
assert('same crdt fields → same hash', hashDataset(r1, 'id') === hashDataset(r2, 'id'));
assert('different lamport → different hash', hashDataset(r1, 'id') !== hashDataset(r3, 'id'));

summary();
