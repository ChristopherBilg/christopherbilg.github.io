// ontology/core/Transform.js
// Validates transform specs at registration time. The shape is the data
// contract the BuildEngine, lineage UI, and (in Phase 5) the column-lineage
// validator all rely on.

export function validateTransformSpec(spec, { datasets, transforms }) {
  if (!spec || typeof spec !== 'object') throw new Error('Transform spec must be an object');
  const { name, inputs, output, pk, kind, body, lineage } = spec;

  if (!name || typeof name !== 'string') throw new Error('Transform.name is required');
  if (transforms && transforms.has(name)) throw new Error(`Transform "${name}" already defined`);
  if (datasets && datasets.has(name)) throw new Error(`Transform "${name}" collides with existing dataset name`);

  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error(`Transform "${name}" needs at least one input dataset`);
  }
  for (const inp of inputs) {
    if (typeof inp !== 'string') throw new Error(`Transform "${name}" inputs must be strings`);
    if (datasets && !datasets.has(inp)) {
      throw new Error(`Transform "${name}" input "${inp}" is not a registered dataset`);
    }
  }

  if (!output || typeof output !== 'string') throw new Error(`Transform "${name}" output is required`);
  if (datasets && datasets.has(output)) {
    throw new Error(`Transform "${name}" output "${output}" collides with existing dataset`);
  }

  if (!pk || typeof pk !== 'string') throw new Error(`Transform "${name}" pk is required`);

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
