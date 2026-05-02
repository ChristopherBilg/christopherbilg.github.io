// ontology/core/Transform.js
// Validates transform specs at registration time. The shape is the data
// contract the BuildEngine, lineage UI, and (in Phase 5) the column-lineage
// validator all rely on.

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function ensureIdent(label, value) {
  if (typeof value !== 'string' || !IDENT_RE.test(value)) {
    throw new Error(`${label} "${value}" is not a valid identifier (must match /^[A-Za-z_][A-Za-z0-9_]*$/)`);
  }
}

export function validateTransformSpec(spec, { datasets, transforms }) {
  if (!spec || typeof spec !== 'object') throw new Error('Transform spec must be an object');
  const { name, inputs, output, pk, kind, body, lineage } = spec;

  if (!name || typeof name !== 'string') throw new Error('Transform.name is required');
  ensureIdent('Transform name', name);
  if (transforms && transforms.has(name)) throw new Error(`Transform "${name}" already defined`);
  if (datasets && datasets.has(name)) throw new Error(`Transform "${name}" collides with existing dataset name`);

  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error(`Transform "${name}" needs at least one input dataset`);
  }
  for (const inp of inputs) {
    if (typeof inp !== 'string') throw new Error(`Transform "${name}" inputs must be strings`);
    ensureIdent(`Transform "${name}" input`, inp);
    if (datasets && !datasets.has(inp)) {
      throw new Error(`Transform "${name}" input "${inp}" is not a registered dataset`);
    }
  }

  if (!output || typeof output !== 'string') throw new Error(`Transform "${name}" output is required`);
  ensureIdent(`Transform "${name}" output`, output);
  if (datasets && datasets.has(output)) {
    throw new Error(`Transform "${name}" output "${output}" collides with existing dataset`);
  }

  if (!pk || typeof pk !== 'string') throw new Error(`Transform "${name}" pk is required`);
  ensureIdent('Transform pk', pk);

  if (kind !== 'sql' && kind !== 'js') {
    throw new Error(`Transform "${name}" kind must be 'sql' or 'js' (got "${kind}")`);
  }

  if (kind === 'sql') {
    if (typeof body !== 'string' || !body.trim()) {
      throw new Error(`Transform "${name}" SQL body must be a non-empty string`);
    }
  } else {
    if (typeof body !== 'function') {
      throw new Error(`Transform "${name}" JS body must be a function`);
    }
  }

  if (lineage !== undefined && (typeof lineage !== 'object' || Array.isArray(lineage))) {
    throw new Error(`Transform "${name}" lineage must be a plain object if present`);
  }

  return spec;
}

// Validate column-level lineage against actual dataset columns. Call this
// lazily (e.g., from BuildEngine before the first build of this transform),
// because raw datasets only have known columns after they've loaded.
export function validateLineageReferences(spec, datasets) {
  if (!spec.lineage) return;
  const inputSet = new Set(spec.inputs);
  for (const [outCol, refs] of Object.entries(spec.lineage)) {
    if (!Array.isArray(refs)) {
      throw new Error(`Transform "${spec.name}" lineage[${outCol}] must be an array of "Dataset.col" strings`);
    }
    for (const ref of refs) {
      const m = /^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/.exec(String(ref || ''));
      if (!m) {
        throw new Error(`Transform "${spec.name}" lineage[${outCol}] = "${ref}" is not a valid Dataset.col reference`);
      }
      const [, dsName, colName] = m;
      if (!inputSet.has(dsName)) {
        throw new Error(`Transform "${spec.name}" lineage[${outCol}] references "${dsName}" which is not an input`);
      }
      const ds = datasets.get(dsName);
      if (!ds) {
        throw new Error(`Transform "${spec.name}" lineage[${outCol}] references unknown dataset "${dsName}"`);
      }
      const sample = ds.rows()[0];
      if (sample && !(colName in sample)) {
        throw new Error(`Transform "${spec.name}" lineage[${outCol}] references "${dsName}.${colName}" which is not a column`);
      }
    }
  }
}
