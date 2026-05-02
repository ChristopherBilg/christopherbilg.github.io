// ontology/workers/builder.js
// Web Worker for JS transforms. Receives { transformName, body (source), inputs },
// reconstitutes the function, runs it, posts back { kind: 'ok', rows } or
// { kind: 'error', message }.
//
// Body source is reconstituted via `new Function`, scoped to the worker. The
// worker has no access to the main thread's ontology or DOM — transforms must
// be pure functions over the input rows.

self.addEventListener('message', (ev) => {
  const { kind, transformName, body, inputs } = ev.data || {};
  if (kind !== 'build') return;
  try {
    const fn = new Function(`return (${body})`)();
    const rows = fn(inputs);
    if (!Array.isArray(rows)) {
      throw new Error(`Transform "${transformName}" must return an array of rows`);
    }
    self.postMessage({ kind: 'ok', transformName, rows });
  } catch (err) {
    self.postMessage({ kind: 'error', transformName, message: err.message });
  }
});
