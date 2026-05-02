// ontology/verify/_assert.js
// Lightweight verification helper used by `ontology/verify/task*.js`.
// Run a verify file by pasting `await import('./verify/taskN.js')` into the
// browser console with `ontology/index.html` open. Each module logs PASS/FAIL
// and updates `globalThis.__verify` so multiple imports accumulate counts.

if (!globalThis.__verify) globalThis.__verify = { pass: 0, fail: 0 };

export function assert(label, cond, detail) {
  if (cond) {
    globalThis.__verify.pass++;
    console.log(`%cPASS%c ${label}`, 'color:#15803d;font-weight:bold', '');
    return true;
  }
  globalThis.__verify.fail++;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  return false;
}

export function resetCounters() {
  globalThis.__verify = { pass: 0, fail: 0 };
}

export function summary() {
  const { pass, fail } = globalThis.__verify;
  console.log(`%c${pass} pass, ${fail} fail`, fail ? 'color:#b91c1c' : 'color:#15803d');
  return { pass, fail };
}
