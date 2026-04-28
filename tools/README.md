# tools/

Build-time helpers for the `ontology/` static-file project. These do **not** run at page load — they exist solely to produce committed JSON artifacts in `ontology/data/`.

## generate-data.mjs

Deterministic synthetic dataset generator written in pure Node (no dependencies, no `package.json`, no `node_modules`). Re-runs produce byte-identical output.

```bash
node tools/generate-data.mjs
```

Outputs:
- `ontology/data/airports.json` — 100 rows
- `ontology/data/pilots.json`   — 200 rows
- `ontology/data/flights.json`  — 5000 rows

The same JSON files back both adapters: `JSONAdapter` `fetch`es them directly, and `DuckDBAdapter` registers them in the in-browser DuckDB-Wasm virtual FS and queries them via `read_json_auto`. No Parquet step — the demo's value is the OLAP engine in the browser, not the storage format, and JSON keeps the site genuinely static.

## Pinned library versions

Recorded here so this README is the single place to update them. All loaded at runtime from CDN; no local install.

| Library                       | Version    | Purpose                              |
|-------------------------------|------------|--------------------------------------|
| `@duckdb/duckdb-wasm` (CDN)   | `^1.29.0`  | Browser-side OLAP engine             |
| `force-graph` (CDN)           | `^1.43.0`  | 2D WebGL link analysis view          |
