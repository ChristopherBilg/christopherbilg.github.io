// ontology/verify/task11_asof.js
import { assert, summary } from './_assert.js';

const ont = globalThis.ontology;
const be  = globalThis.buildEngine;

await be.build('flightStatsByOrigin');
const live = be.catalog.latest('flightStatsByOrigin', ont.branches.currentBranch);
assert('live build asOfTx is null', live.asOfTx === null);

const past = '2026-04-22T00:00:00Z';
await be.build('flightStatsByOrigin', { asOfTx: past, asOfValid: past });
const ctx = be.catalog.latest('flightStatsByOrigin', ont.branches.currentBranch);
assert('contextual build asOfTx captured', ctx.asOfTx === past);
assert('contextual build asOfValid captured', ctx.asOfValid === past);

summary();
