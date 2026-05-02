// ontology/core/Fingerprint.js
// Stable, fast-ish row-set hash. NOT cryptographic — just enough to detect
// "did the inputs change since the last build" with negligible collision
// probability for the dataset sizes this project handles. CRDT-aware: if
// rows carry lamport/nodeId fields, they participate in the hash (so two
// tabs that converge to the same merged state produce the same hash).

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME  = 0x01000193;

function fnv1a(str) {
  let h = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function rowToken(row) {
  if (row && (row.lamport != null || row.nodeId != null)) {
    return `${JSON.stringify({ ...row, lamport: row.lamport ?? 0, nodeId: row.nodeId ?? '' })}`;
  }
  return JSON.stringify(row);
}

export function hashDataset(rows, pk) {
  if (!Array.isArray(rows)) throw new Error('hashDataset: rows must be an array');
  if (!pk) throw new Error('hashDataset: pk is required');
  // pk values are stringified for stable cross-type comparison; numeric pks are
  // not lexicographically sorted, but our datasets use uniform string pks
  // (tail_number, pilot_id, code, origin).
  const sorted = rows.slice().sort((a, b) => {
    const ax = a?.[pk];
    const bx = b?.[pk];
    if (ax === bx) return 0;
    return String(ax) < String(bx) ? -1 : 1;
  });
  const concat = sorted.map(rowToken).join('|');
  return `h:${fnv1a(concat)}`;
}

export function hashCombined(perInput) {
  // Sort by input name for order independence.
  const keys = Object.keys(perInput).sort();
  const concat = keys.map((k) => `${k}=${perInput[k]}`).join('|');
  return `h:${fnv1a(concat)}`;
}
