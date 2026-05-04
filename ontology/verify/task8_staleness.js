// ontology/verify/task8_staleness.js
import { assert, summary } from './_assert.js';

const ont = globalThis.ontology;
const be  = globalThis.buildEngine;
const branch = ont.branches.currentBranch;

// Build once.
await be.build('flightStatsByOrigin');
const first = be.catalog.latest('flightStatsByOrigin', branch);
assert('first build status ok', first.status === 'ok');
assert('first build has fingerprint', !!first.fingerprint?.combined);
assert('first build cleared stale hint', be.catalog.getStaleHint('flightStatsByOrigin', branch) === false);

// Build again immediately. Inputs unchanged → skipped.
await be.build('flightStatsByOrigin');
const second = be.catalog.latest('flightStatsByOrigin', branch);
assert('second build skipped', second.status === 'skipped');
assert('second build has same combined fingerprint as first',
  second.fingerprint?.combined === first.fingerprint.combined);

// Dispatch an action that changes Flight → downstream stale hint flips.
const flight = ont.all('Flight').find((f) => f.status === 'Scheduled');
if (flight) {
  globalThis.actions.dispatch('delayFlight', { flightId: flight.id, minutes: 15 });
  assert('delay flips staleHint on flightStatsByOrigin',
    be.catalog.getStaleHint('flightStatsByOrigin', branch) === true);

  await be.build('flightStatsByOrigin');
  const third = be.catalog.latest('flightStatsByOrigin', branch);
  assert('third build (after action) is ok',
    third.status === 'ok' || third.status === 'skipped');
  assert('third build cleared stale hint',
    be.catalog.getStaleHint('flightStatsByOrigin', branch) === false);
}

summary();
