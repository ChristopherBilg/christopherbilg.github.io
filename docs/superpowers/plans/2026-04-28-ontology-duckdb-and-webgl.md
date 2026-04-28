# Ontology — DuckDB-Wasm + WebGL Graph View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-04-28-ontology-duckdb-and-webgl-design.md`](../specs/2026-04-28-ontology-duckdb-and-webgl-design.md)

**Goal:** Add a DuckDB-Wasm OLAP storage adapter for `Flight` (sourced from the same JSON file `JSONAdapter` already serves, via `read_json_auto`) and a `force-graph` WebGL link-analysis view that replaces the flight-list panel, while preserving every existing pattern in `ontology/` (ChangeSets, branching, time travel, computed properties, security, integrity worker, CRDT clock, AIP stub).

**Architecture:** Introduce a `BackingAdapter` interface with two implementations (`JSONAdapter`, `DuckDBAdapter`); both populate the same `Ontology.cache` Map so every existing read path is unchanged. Add a `.sql()` escape hatch on `QueryBuilder` that routes results back through `Ontology.get()` so security/temporal/proxy filtering still applies. Replace the flight-list panel with a `force-graph` 2D canvas in `views/GraphView.js`; click-to-select drives the existing detail panel via a generalized `state.selection: { type, id }`.

**Tech Stack:**
- Vanilla ES Modules (no bundler, no framework — same as existing code)
- `@duckdb/duckdb-wasm` from CDN (pinned version), main thread
- `force-graph` (2D) from CDN (pinned version)
- Pure Node (built-ins only — no `package.json`, no `node_modules`) for the synthetic data generator
- No tests framework — verification is browser console and visual inspection, mirroring the project's existing pattern

**No-NPM / no-Parquet decision:** During Task 2 execution we revisited the original "use the Node `duckdb` binding to bake a Parquet artifact" approach. The site is a static GitHub Pages deploy; introducing `package.json` for a single build-time dep was off-pattern. DuckDB-Wasm reads JSON natively via `read_json_auto()`, so the OLAP demo lands just as well from the same JSON file the `JSONAdapter` already serves. We dropped the Parquet build step and the `duckdb` Node binding; `tools/generate-data.mjs` is now a single zero-dep Node script. Trade-off: payload is ~3× larger for `flights.json` (~1.3 MB vs ~150 KB Parquet), which gzip-compresses well and is acceptable for a demo. **Read every Task 2 / Task 4 / Task 9 step below with that revision in mind** — the wording was updated to match.

**Verification model:** This project has no automated test harness. Each task uses *verification-driven development* — write the verification first (a console snippet or visual acceptance check), confirm the feature is missing, implement, confirm verification passes, commit. The TDD principle adapted to a no-harness browser project.

**Library version pins** (record actual versions in `tools/README.md`):
- `@duckdb/duckdb-wasm`: `^1.29.0` (CDN: `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm`)
- `force-graph`: `^1.43.0` (CDN: `https://esm.sh/force-graph@1.43.0`)

---

## Task ordering and dependencies

| # | Task | Depends on |
|---|---|---|
| 1 | `BackingAdapter` + `JSONAdapter` refactor | — |
| 2 | Synthetic data generator + dataset commit | — |
| 3 | `DuckDBProvider` singleton | 2 |
| 4 | `DuckDBAdapter` + wire `Flight` via manifests | 1, 3 |
| 5 | `QueryBuilder.sql()` escape hatch | 3 |
| 6 | Generalized detail panel + `state.selection` refactor | — |
| 7 | `GraphView` module (built but not yet mounted) | 6 |
| 8 | Layout refactor + `app.js` wiring + remove flight list | 7, 4 |
| 9 | Final verification sweep + footer docs update | 4, 5, 8 |

---

## Task 1: `BackingAdapter` interface + `JSONAdapter` refactor

**Goal:** Extract the existing `Ontology.load()` fetch-and-cache logic into a `BackingAdapter` interface with a `JSONAdapter` implementation. Behavior-preserving refactor — existing UI continues to work identically.

**Files:**
- Create: `ontology/core/BackingAdapter.js`
- Create: `ontology/core/JSONAdapter.js`
- Modify: `ontology/core/Ontology.js` (replace inline fetch in `load()` with adapter delegation; `defineObject` accepts `{ adapter }` field, defaulting to `'json'`)

**Acceptance Criteria:**
- [ ] `ontology.objectTypes.get('Flight').adapter === 'json'` (defaulting from omitted field)
- [ ] Existing flight-list, detail, audit-log, time travel, branching, integrity, AIP, role switching all behave identically — no visual or behavioral regression
- [ ] `console.info` logs `[adapter:json] loaded Airport (8)` etc. on boot
- [ ] `Ontology.cache.size` equals total rows across all 3 types (current dataset: 8 + 6 + 9 = 23 rows)

**Verify:** Open `ontology/index.html` in a browser → all existing flows work. In console: `Array.from(ontology.objectTypes.entries()).map(([n, c]) => [n, c.adapter])` returns `[['Airport','json'], ['Pilot','json'], ['Flight','json']]`.

**Steps:**

- [ ] **Step 1: Write `BackingAdapter` base class**

Create `ontology/core/BackingAdapter.js`:

```js
export class BackingAdapter {
  constructor(typeName, config, ontology) {
    this.typeName = typeName;
    this.config = config;
    this.ontology = ontology;
  }

  async load() {
    throw new Error(`${this.constructor.name}.load() not implemented`);
  }

  getRow(id) {
    return this.ontology.cache.get(`${this.typeName}:${id}`) || null;
  }

  *allRows() {
    const prefix = `${this.typeName}:`;
    for (const [key, row] of this.ontology.cache) {
      if (key.startsWith(prefix)) yield row;
    }
  }

  getSchema() {
    let sample = null;
    for (const row of this.allRows()) { sample = row; break; }
    return {
      pk: this.config.pk,
      properties: sample ? Object.keys(sample).sort() : [],
    };
  }
}
```

- [ ] **Step 2: Write `JSONAdapter`**

Create `ontology/core/JSONAdapter.js`:

```js
import { BackingAdapter } from './BackingAdapter.js';

export class JSONAdapter extends BackingAdapter {
  async load() {
    const url = this.config.backingData;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    const rows = await res.json();
    for (const row of rows) {
      this.ontology.cache.set(`${this.typeName}:${row[this.config.pk]}`, row);
    }
    console.info(`[adapter:json] loaded ${this.typeName} (${rows.length})`);
  }
}
```

- [ ] **Step 3: Update `Ontology` to delegate to adapters**

Modify `ontology/core/Ontology.js`. Replace the imports and `load()` method:

```js
// at top, alongside existing imports
import { JSONAdapter } from './JSONAdapter.js';
```

Add inside `class Ontology`:

```js
defineObject(name, config) {
  const adapter = config.adapter || 'json';
  this.objectTypes.set(name, { ...config, adapter });
}

_makeAdapter(typeName, config) {
  if (config.adapter === 'json') return new JSONAdapter(typeName, config, this);
  throw new Error(`Unknown adapter type "${config.adapter}" for ${typeName}`);
}

async load() {
  const jobs = [];
  this.adapters = new Map();
  for (const [name, config] of this.objectTypes) {
    const adapter = this._makeAdapter(name, config);
    this.adapters.set(name, adapter);
    jobs.push(adapter.load());
  }
  await Promise.all(jobs);
  this.loaded = true;
  this.emit('loaded');
}
```

The existing `defineObject` (which just did `this.objectTypes.set(name, config)`) is replaced. The existing inline `load()` body is replaced by adapter delegation.

`getSchema()` already reads from `_firstRowOf` which scans `this.cache`, so it stays unchanged.

- [ ] **Step 4: Verify behavior preservation in the browser**

Reload `ontology/index.html`. Verify:
1. Flight list shows 9 cards.
2. Click `N101AA` → detail panel populates as before.
3. Click "Depart flight" → status flips to `InAir`, audit log gains entry.
4. Console: `Array.from(ontology.objectTypes.entries()).map(([n, c]) => [n, c.adapter])` → `[['Airport','json'], ['Pilot','json'], ['Flight','json']]`.
5. Console: `ontology.cache.size` → `23`.
6. Console: `console` history shows three `[adapter:json] loaded …` lines.

If any existing flow breaks, fix before commit.

- [ ] **Step 5: Commit**

```bash
git add ontology/core/BackingAdapter.js ontology/core/JSONAdapter.js ontology/core/Ontology.js
git commit -m "refactor(ontology): Extract BackingAdapter interface with JSONAdapter

Lift the inline fetch-and-cache code in Ontology.load into a
BackingAdapter base class with a JSONAdapter implementation.
Behavior is preserved; defineObject now accepts an optional
adapter field defaulting to 'json'. This is the abstraction
layer that the upcoming DuckDBAdapter will plug into."
```

---

## Task 2: Synthetic data generator + new dataset

**Goal:** Generate a deterministic ~5,000 Flight / 200 Pilot / 100 Airport dataset as JSON (only). The generator is pure Node (built-ins only) — no `package.json`, no `node_modules`, no Parquet step. The same JSON files back both adapters: `JSONAdapter` `fetch`es them; `DuckDBAdapter` (Task 4) registers them in DuckDB-Wasm's VFS and queries via `read_json_auto`.

**Files:**
- Create: `tools/generate-data.mjs`
- Create: `tools/README.md`
- Modify: `ontology/data/airports.json` (regenerated, 100 rows)
- Modify: `ontology/data/pilots.json` (regenerated, 200 rows)
- Modify: `ontology/data/flights.json` (regenerated, 5000 rows)

**Acceptance Criteria:**
- [ ] `node tools/generate-data.mjs` succeeds with zero install / zero deps
- [ ] Re-running it produces byte-identical output (deterministic — verifiable via `md5sum`)
- [ ] Status mix in flights: roughly 60% Scheduled / 15% InAir / 20% Landed / 5% Cancelled (within ±2%)
- [ ] All Pilot/Origin/Destination FKs reference real ids (zero orphans on a clean dataset)
- [ ] `flight_hours` distribution covers all three `experience_tier` buckets (`<3000`, `3000–8000`, `>=8000`) with at least 20 pilots in each
- [ ] No `package.json`, no `.gitignore`, no `node_modules/` introduced

**Verify:**
```bash
node tools/generate-data.mjs
ls -lh ontology/data/airports.json ontology/data/pilots.json ontology/data/flights.json
md5sum ontology/data/*.json && node tools/generate-data.mjs >/dev/null && md5sum ontology/data/*.json   # determinism
```
Expected: `flights: 5000`, status counts within target ranges, both md5 runs match line-for-line.

**Steps:**

- [ ] **Step 1: Write `tools/generate-data.mjs`**

Create `/workspaces/christopherbilg.github.io/tools/generate-data.mjs`:

```js
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../ontology/data');
mkdirSync(DATA_DIR, { recursive: true });

// Deterministic seeded PRNG (mulberry32) so re-runs produce identical output.
const SEED = 0x4f4e544f; // "ONTO"
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = rng(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const range = (lo, hi) => Math.floor(rnd() * (hi - lo + 1)) + lo;

// --- Airports (100) ---
const AIRPORT_SEEDS = [
  ['JFK','John F. Kennedy International','New York','USA'],
  ['LAX','Los Angeles International','Los Angeles','USA'],
  ['ORD',"O'Hare International",'Chicago','USA'],
  ['DFW','Dallas/Fort Worth International','Dallas','USA'],
  ['SEA','Seattle-Tacoma International','Seattle','USA'],
  ['ATL','Hartsfield-Jackson Atlanta','Atlanta','USA'],
  ['BOS','Logan International','Boston','USA'],
  ['SFO','San Francisco International','San Francisco','USA'],
  ['DEN','Denver International','Denver','USA'],
  ['MIA','Miami International','Miami','USA'],
  ['LHR','London Heathrow','London','UK'],
  ['CDG','Paris Charles de Gaulle','Paris','France'],
  ['FRA','Frankfurt am Main','Frankfurt','Germany'],
  ['AMS','Amsterdam Schiphol','Amsterdam','Netherlands'],
  ['NRT','Narita International','Tokyo','Japan'],
  ['HND','Tokyo Haneda','Tokyo','Japan'],
  ['SIN','Singapore Changi','Singapore','Singapore'],
  ['HKG','Hong Kong International','Hong Kong','Hong Kong'],
  ['SYD','Sydney Kingsford Smith','Sydney','Australia'],
  ['DXB','Dubai International','Dubai','UAE'],
  // 80 more synthetic codes, real-airport-flavored
];
// Pad the airports list deterministically up to 100.
const SYNTH_CITY_PREFIX = ['Aero','Cityport','Northport','Southfield','Westmere','Eastpoint','Oakridge','Riverbend','Lakehaven','Pinegrove','Cedarcity','Hilltop','Maplewood','Brookfield','Stonebridge','Greenway','Sunnyvale','Foxhollow','Ironwood','Silverlake'];
const SYNTH_COUNTRY = ['USA','Canada','UK','France','Germany','Australia','Japan','Brazil','Mexico','Spain'];
const airports = [];
const usedCodes = new Set();
for (const [code, name, city, country] of AIRPORT_SEEDS) {
  airports.push({ code, name, city, country, created_at: '2026-01-01T00:00:00Z', valid_from: '2026-01-01T00:00:00Z' });
  usedCodes.add(code);
}
let synthIdx = 0;
while (airports.length < 100) {
  // Generate codes A00..Z99 deterministically; skip collisions.
  const a = String.fromCharCode(65 + (synthIdx % 26));
  const b = String.fromCharCode(65 + ((Math.floor(synthIdx / 26)) % 26));
  const n = synthIdx % 100;
  const code = `${a}${b}${String(n).padStart(1, '0')}`.padEnd(3, 'X').slice(0, 3);
  synthIdx++;
  if (usedCodes.has(code)) continue;
  usedCodes.add(code);
  const city = `${pick(SYNTH_CITY_PREFIX)}-${airports.length}`;
  airports.push({
    code,
    name: `${city} Regional`,
    city,
    country: pick(SYNTH_COUNTRY),
    created_at: '2026-01-01T00:00:00Z',
    valid_from: '2026-01-01T00:00:00Z',
  });
}
writeFileSync(`${DATA_DIR}/airports.json`, JSON.stringify(airports, null, 2));

// --- Pilots (200) ---
// Bucket distribution: 70 novice (<3000), 70 experienced (3000-7999), 60 veteran (>=8000)
const FIRST_NAMES = ['Amelia','Marcus','Priya','Luca','Sarah','Noah','Isla','Kenji','Mira','Diego','Yara','Tomas','Zara','Kofi','Hana','Theo','Anya','Bilal','Nora','Felix','Sana','Otto','Lila','Vikram','Imani','Sven','Aria','Hassan','Eden','Cyrus'];
const LAST_NAMES = ['Rhodes','Chen','Shah','Romano','Jenkins','Abebe','Park','Volkov','Morales','Tanaka','Khoury','Olsen','Patel','Reyes','Adeyemi','Mitsui','Garcia','Iqbal','Huang','Andersson','Diallo','Costa','Mehra','Brennan','Sato','Kowalski','Ng','Matsuda','Halloran','Ibarra'];
const LICENSES = ['Commercial', 'ATP'];
const pilots = [];
for (let i = 1; i <= 200; i++) {
  const id = `P${String(i).padStart(3, '0')}`;
  let hours;
  if (i <= 70)       hours = range(200, 2999);     // novice
  else if (i <= 140) hours = range(3000, 7999);    // experienced
  else                hours = range(8000, 18000);  // veteran
  pilots.push({
    pilot_id: id,
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    license_level: hours >= 5000 ? 'ATP' : pick(LICENSES),
    flight_hours: hours,
    created_at: '2026-01-01T00:00:00Z',
    valid_from: '2026-01-01T00:00:00Z',
  });
}
writeFileSync(`${DATA_DIR}/pilots.json`, JSON.stringify(pilots, null, 2));

// --- Flights (5000) ---
const STATUS_DIST = [
  { status: 'Scheduled', weight: 60 },
  { status: 'InAir',     weight: 15 },
  { status: 'Landed',    weight: 20 },
  { status: 'Cancelled', weight: 5 },
];
function pickStatus() {
  const total = STATUS_DIST.reduce((s, x) => s + x.weight, 0);
  let r = rnd() * total;
  for (const x of STATUS_DIST) {
    if ((r -= x.weight) <= 0) return x.status;
  }
  return 'Scheduled';
}
function tailNumber(i) {
  // N###AA pattern, then N###AB, etc., to avoid duplicates past 999.
  const n = (i % 1000) + 1;
  const suffix = String.fromCharCode(65 + Math.floor(i / 1000)) + 'A';
  return `N${String(n).padStart(3, '0')}${suffix}`;
}
const flights = [];
for (let i = 0; i < 5000; i++) {
  const tail = tailNumber(i);
  const origin = pick(airports).code;
  let destination = pick(airports).code;
  while (destination === origin) destination = pick(airports).code;
  const pilot = pilots[range(0, pilots.length - 1)].pilot_id;
  const status = pickStatus();
  // Departure: spread across April 2026.
  const dayOffset = range(0, 29);
  const hour = range(0, 23);
  const minute = pick([0, 15, 30, 45]);
  const dep = new Date(Date.UTC(2026, 3, 1 + dayOffset, hour, minute, 0)).toISOString();
  flights.push({
    tail_number: tail,
    status,
    origin,
    destination,
    departure_time: dep,
    pilot_id: pilot,
    created_at: '2026-04-01T00:00:00Z',
    valid_from: '2026-04-01T00:00:00Z',
    ...(status === 'Cancelled' ? { cancellation_reason: 'weather' } : {}),
  });
}
writeFileSync(`${DATA_DIR}/flights.json`, JSON.stringify(flights, null, 2));

console.log('Wrote:');
console.log('  airports.json:', airports.length);
console.log('  pilots.json:',  pilots.length);
console.log('  flights.json:', flights.length);
```

- [ ] **Step 2: Write `tools/README.md`**

Create `/workspaces/christopherbilg.github.io/tools/README.md`:

```markdown
# tools/

Build-time helpers for the `ontology/` static-file project. These do **not** run at page load — they exist solely to produce committed JSON artifacts in `ontology/data/`.

## generate-data.mjs

Deterministic synthetic dataset generator written in pure Node (no dependencies, no `package.json`, no `node_modules`). Re-runs produce byte-identical output.

\`\`\`bash
node tools/generate-data.mjs
\`\`\`

Outputs:
- `ontology/data/airports.json` — 100 rows
- `ontology/data/pilots.json`   — 200 rows
- `ontology/data/flights.json`  — 5000 rows

The same JSON files back both adapters: `JSONAdapter` `fetch`es them directly, and `DuckDBAdapter` registers them in the in-browser DuckDB-Wasm virtual FS and queries them via `read_json_auto`. No Parquet step — the demo's value is the OLAP engine in the browser, not the storage format, and JSON keeps the site genuinely static.

## Pinned library versions

| Library                       | Version    | Purpose                              |
|-------------------------------|------------|--------------------------------------|
| `@duckdb/duckdb-wasm` (CDN)   | `^1.29.0`  | Browser-side OLAP engine             |
| `force-graph` (CDN)           | `^1.43.0`  | 2D WebGL link analysis view          |
```

- [ ] **Step 3: Run the generator**

```bash
cd /workspaces/christopherbilg.github.io
node tools/generate-data.mjs
```

Expected: `Wrote: airports.json: 100 / pilots.json: 200 / flights.json: 5000`.

- [ ] **Step 4: Verify dataset shape and determinism**

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const a = JSON.parse(readFileSync('ontology/data/airports.json'));
const p = JSON.parse(readFileSync('ontology/data/pilots.json'));
const f = JSON.parse(readFileSync('ontology/data/flights.json'));
console.log('airports:', a.length, '/ pilots:', p.length, '/ flights:', f.length);
const status = {}; f.forEach(x => status[x.status] = (status[x.status]||0)+1);
console.log('status:', status);
const tiers = {novice:0, experienced:0, veteran:0};
p.forEach(x => {
  if (x.flight_hours < 3000) tiers.novice++;
  else if (x.flight_hours < 8000) tiers.experienced++;
  else tiers.veteran++;
});
console.log('pilot tiers:', tiers);
const codes = new Set(a.map(x => x.code));
const pids = new Set(p.map(x => x.pilot_id));
const orphans = f.filter(x => !codes.has(x.origin) || !codes.has(x.destination) || !pids.has(x.pilot_id));
console.log('orphan FKs:', orphans.length);
"

md5sum ontology/data/*.json && node tools/generate-data.mjs >/dev/null && md5sum ontology/data/*.json
```

Expected: 100 / 200 / 5000; status counts within target distribution; tiers each ≥ 20; orphan FKs = 0; both md5sum runs match.

- [ ] **Step 5: Verify the existing UI still loads with the larger dataset**

Open `ontology/index.html` (via local HTTP server). Existing flight-list now scrolls through 5000 cards. Click one — detail panel still works. AIP intent `pilots to LAX` still returns sensible results. **This is the regression check that the JSON adapter (Task 1) handles the bigger dataset.**

If the page is sluggish, that's expected for a 5000-card DOM list — Task 8 deletes that list.

- [ ] **Step 6: Commit**

```bash
git add tools/generate-data.mjs tools/README.md \
  ontology/data/airports.json ontology/data/pilots.json ontology/data/flights.json
git commit -m "feat(ontology): Generate synthetic mid-scale dataset (5k flights)

Zero-dep Node script (no package.json) that emits a deterministic
100/200/5000 airport/pilot/flight JSON dataset. Status distribution
roughly 60/15/20/5; pilot flight_hours covers all three tiers; zero
orphan FKs on a clean dataset. The DuckDBAdapter (Task 4) reads the
same flights.json via read_json_auto in DuckDB-Wasm, so no Parquet
build step is needed and the site stays NPM-free."
```

---

## Task 3: `DuckDBProvider` singleton

**Goal:** Singleton owning the DuckDB-Wasm instance. Provides `init()` (idempotent, safe to await in parallel), `registerJSON(name, url)`, and `query(sql, params)`. Pure infrastructure; no integration with `Ontology` yet. (We register the *same* JSON file the JSONAdapter uses, then expose it as a SQL view via DuckDB's `read_json_auto` — no Parquet involved.)

**Files:**
- Create: `ontology/core/DuckDBProvider.js`

**Acceptance Criteria:**
- [ ] `DuckDBProvider.shared()` returns the same instance across calls
- [ ] `await provider.init()` resolves once; concurrent `init()` calls share one bootstrap
- [ ] `await provider.registerJSON('flights', './data/flights.json')` creates a queryable view via `read_json_auto`
- [ ] `await provider.query('SELECT COUNT(*) AS n FROM flights')` returns `[{ n: 5000 }]` (or similar — DuckDB returns BigInt for COUNT; the query method coerces to plain numbers)
- [ ] `await provider.query('SELECT * FROM flights WHERE status = ?', ['Scheduled'])` returns Scheduled flights — proves parameter binding works
- [ ] No SQL string interpolation anywhere — all dynamic values flow through `params`

**Verify:** Browser console (after temporarily importing the module from console):
```js
const { DuckDBProvider } = await import('./core/DuckDBProvider.js');
const p = DuckDBProvider.shared();
await p.init();
await p.registerJSON('flights', './data/flights.json');
const total = await p.query('SELECT COUNT(*) AS n FROM flights');
console.log('total:', total[0].n); // 5000
const sched = await p.query("SELECT * FROM flights WHERE status = ? LIMIT 3", ['Scheduled']);
console.log('scheduled sample:', sched);
```

**Steps:**

- [ ] **Step 1: Create the provider module**

Create `ontology/core/DuckDBProvider.js`:

```js
const DUCKDB_CDN = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm';

let instance = null;

export class DuckDBProvider {
  constructor() {
    this._db = null;
    this._conn = null;
    this._initPromise = null;
    this._registered = new Set();
  }

  static shared() {
    if (!instance) instance = new DuckDBProvider();
    return instance;
  }

  async init() {
    if (this._conn) return;
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      const duckdb = await import(DUCKDB_CDN);
      const bundles = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(bundles);
      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
      );
      const worker = new Worker(workerUrl);
      const logger = new duckdb.ConsoleLogger();
      this._db = new duckdb.AsyncDuckDB(logger, worker);
      await this._db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(workerUrl);
      this._conn = await this._db.connect();
      console.info('[duckdb] ready');
    })();
    return this._initPromise;
  }

  async registerJSON(name, url) {
    await this.init();
    if (this._registered.has(name)) return;
    // Resolve the URL relative to the page so the worker fetch can find it.
    const absoluteUrl = new URL(url, window.location.href).toString();
    const res = await fetch(absoluteUrl);
    if (!res.ok) throw new Error(`Failed to fetch ${absoluteUrl}: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const vfsName = `${name}.json`;
    await this._db.registerFileBuffer(vfsName, buf);
    await this._conn.query(
      `CREATE OR REPLACE VIEW ${name} AS SELECT * FROM read_json_auto('${vfsName}')`,
    );
    this._registered.add(name);
    console.info(`[duckdb] registered ${name} (${buf.byteLength} bytes)`);
  }

  async query(sql, params = []) {
    await this.init();
    let result;
    if (params.length === 0) {
      result = await this._conn.query(sql);
    } else {
      const stmt = await this._conn.prepare(sql);
      try {
        result = await stmt.query(...params);
      } finally {
        await stmt.close();
      }
    }
    return this._toPlainRows(result);
  }

  _toPlainRows(arrowResult) {
    const rows = [];
    for (const row of arrowResult.toArray()) {
      const plain = {};
      for (const [k, v] of Object.entries(row.toJSON ? row.toJSON() : row)) {
        plain[k] = typeof v === 'bigint' ? Number(v) : v;
      }
      rows.push(plain);
    }
    return rows;
  }
}
```

Key points to call out:
- `import(DUCKDB_CDN)` is a *dynamic import* of an ESM module from jsDelivr's `+esm` endpoint. The version is pinned in the URL.
- `init()` uses a stored promise to dedupe concurrent calls — multiple adapters can `await provider.init()` in parallel without racing.
- `registerJSON` fetches the file, registers it in DuckDB's virtual FS by name, creates a `VIEW` over `read_json_auto` so the table-name in queries matches the registered name. Only the `name` parameter goes into the SQL string — it's a controlled identifier from our own code, never user input. (If we ever take user input here, this becomes a SQL injection vector; for v1 it's safe.)
- `query()` uses prepared statements when params are passed. Never interpolates.
- `_toPlainRows` flattens Apache Arrow output to plain JS objects and coerces `bigint` (returned for COUNT etc.) to `number`.

- [ ] **Step 2: Verify in the browser console**

Reload the page. Open console. Run the verification snippet from the **Verify** section above. Expected: `total: 5000`, `scheduled sample` shows 3 row objects with status `'Scheduled'`.

If you see CORS errors loading the CDN bundle, check that you're serving the page over `http://` (not `file://`) — DuckDB-Wasm requires a real origin. Use `python3 -m http.server 8000` from the repo root or any equivalent.

- [ ] **Step 3: Commit**

```bash
git add ontology/core/DuckDBProvider.js
git commit -m "feat(ontology): Add DuckDBProvider singleton

Browser-side DuckDB-Wasm wrapper with idempotent init, JSON file
registration via virtual FS (read_json_auto), and parameterized
query execution.
Loaded from pinned jsDelivr CDN. No integration with Ontology
yet — that comes in the next task."
```

---

## Task 4: `DuckDBAdapter` + wire `Flight` to it via manifests

**Goal:** Implement the `DuckDBAdapter` that uses `DuckDBProvider` to hydrate `ontology.cache` for its type. Wire `Flight` to it in `staging` and `prod` manifests; `dev` keeps `JSONAdapter` for fast iteration. Add fallback to `JSONAdapter` if DuckDB init fails.

**Files:**
- Create: `ontology/core/DuckDBAdapter.js`
- Modify: `ontology/core/Ontology.js` (`_makeAdapter` recognizes `'duckdb'`)
- Modify: `ontology/env/dev/manifest.json` (Flight stays json)
- Modify: `ontology/env/staging/manifest.json` (Flight → duckdb, dataSource → flights.json)
- Modify: `ontology/env/prod/manifest.json` (Flight → duckdb, dataSource → flights.json)
- Modify: `ontology/app.js` (read adapter type from manifest; fallback path on init failure)
- Modify: `ontology/config/ConfigProvider.js` (expose adapter selection per type)

**Acceptance Criteria:**
- [ ] `?env=staging` or `?env=prod` boots → console shows `[duckdb] ready` then `[adapter:duckdb] loaded Flight (5000)`
- [ ] `ontology.objectTypes.get('Flight').adapter === 'duckdb'` in staging/prod
- [ ] `ontology.objectTypes.get('Flight').adapter === 'json'` in dev
- [ ] `ontology.cache.size === 5300` (5000 + 200 + 100) in staging/prod
- [ ] All existing flows (depart, land, undo, branching, time travel, integrity inject, AIP intents, role switching, multi-tab CRDT) work identically with `Flight` backed by DuckDB
- [ ] If DuckDB init fails (simulate by breaking the CDN URL temporarily), `[duckdb] init failed; falling back to JSON adapter` is logged and the app still boots reading `flights.json`
- [ ] `Ontology.cache` shape is identical between adapters — `get('Flight', 'N101AA1')` returns a row with the same keys regardless of which env loaded it

**Verify:**
```
?env=staging → console: [duckdb] ready; [duckdb] registered flights; [adapter:duckdb] loaded Flight (5000)
Browser console:
  ontology.objectTypes.get('Flight').adapter        // 'duckdb'
  ontology.cache.size                                 // 5300
  ontology.get('Flight', 'N001AA').status             // some status
  agent.ask('list pilots')                            // works
```

**Steps:**

- [ ] **Step 1: Update manifests**

Modify `/workspaces/christopherbilg.github.io/ontology/env/dev/manifest.json` — add an `adapter` block but keep Flight on JSON:

```json
{
  "version": "1.0.0-dev",
  "environment": "dev",
  "features": {
    "allowCancellation": true,
    "allowPilotReassignment": true,
    "allowDelay": true,
    "strictStateTransitions": true
  },
  "adapters": {
    "Airport": "json",
    "Pilot": "json",
    "Flight": "json"
  },
  "dataSources": {
    "Airport": "./data/airports.json",
    "Pilot":   "./data/pilots.json",
    "Flight":  "./data/flights.json"
  }
}
```

Modify `/workspaces/christopherbilg.github.io/ontology/env/staging/manifest.json`:

```json
{
  "version": "1.0.0-staging",
  "environment": "staging",
  "features": {
    "allowCancellation": true,
    "allowPilotReassignment": true,
    "allowDelay": false,
    "strictStateTransitions": true
  },
  "adapters": {
    "Airport": "json",
    "Pilot": "json",
    "Flight": "duckdb"
  },
  "dataSources": {
    "Airport": "./data/airports.json",
    "Pilot":   "./data/pilots.json",
    "Flight":  "./data/flights.json"
  }
}
```

Modify `/workspaces/christopherbilg.github.io/ontology/env/prod/manifest.json`:

```json
{
  "version": "1.0.0",
  "environment": "prod",
  "features": {
    "allowCancellation": false,
    "allowPilotReassignment": false,
    "allowDelay": false,
    "strictStateTransitions": true
  },
  "adapters": {
    "Airport": "json",
    "Pilot": "json",
    "Flight": "duckdb"
  },
  "dataSources": {
    "Airport": "./data/airports.json",
    "Pilot":   "./data/pilots.json",
    "Flight":  "./data/flights.json"
  }
}
```

- [ ] **Step 2: Expose adapter selection from `ConfigProvider`**

Modify `ontology/config/ConfigProvider.js`. Add a method just below `resolveDataSource`:

```js
resolveAdapter(typeName) {
  const adapters = this.manifest?.adapters || {};
  return adapters[typeName] || 'json';
}
```

(Existing methods unchanged.)

- [ ] **Step 3: Write `DuckDBAdapter`**

Create `ontology/core/DuckDBAdapter.js`:

```js
import { BackingAdapter } from './BackingAdapter.js';
import { DuckDBProvider } from './DuckDBProvider.js';

export class DuckDBAdapter extends BackingAdapter {
  get tableName() {
    return this.config.tableName || `${this.typeName.toLowerCase()}s`;
  }

  async load() {
    const provider = DuckDBProvider.shared();
    await provider.init();
    await provider.registerJSON(this.tableName, this.config.backingData);
    const rows = await provider.query(`SELECT * FROM ${this.tableName}`);
    for (const row of rows) {
      this.ontology.cache.set(`${this.typeName}:${row[this.config.pk]}`, row);
    }
    console.info(`[adapter:duckdb] loaded ${this.typeName} (${rows.length})`);
  }
}
```

The `tableName` getter is the place where the registered DuckDB view name is determined. For `Flight` it's `flights`; matches the spec convention.

- [ ] **Step 4: Wire into `Ontology._makeAdapter`**

Modify `ontology/core/Ontology.js`. Add the import:

```js
import { DuckDBAdapter } from './DuckDBAdapter.js';
```

Update `_makeAdapter`:

```js
_makeAdapter(typeName, config) {
  if (config.adapter === 'json')   return new JSONAdapter(typeName, config, this);
  if (config.adapter === 'duckdb') return new DuckDBAdapter(typeName, config, this);
  throw new Error(`Unknown adapter type "${config.adapter}" for ${typeName}`);
}
```

- [ ] **Step 5: Update `app.js` `setupOntology` to read adapter from manifest, with fallback**

Modify `ontology/app.js`. Replace the `setupOntology` function with:

```js
function setupOntology() {
  const adapterFor = (typeName) => config.resolveAdapter(typeName);
  ontology.defineObject('Airport', {
    adapter: adapterFor('Airport'),
    backingData: config.resolveDataSource('Airport'),
    pk: 'code',
  });
  ontology.defineObject('Pilot', {
    adapter: adapterFor('Pilot'),
    backingData: config.resolveDataSource('Pilot'),
    pk: 'pilot_id',
  });
  ontology.defineObject('Flight', {
    adapter: adapterFor('Flight'),
    backingData: config.resolveDataSource('Flight'),
    pk: 'tail_number',
  });

  ontology.links.define('flight_pilot',       { source: 'Flight', target: 'Pilot',   fk: 'pilot_id' });
  ontology.links.define('flight_origin',      { source: 'Flight', target: 'Airport', fk: 'origin' });
  ontology.links.define('flight_destination', { source: 'Flight', target: 'Airport', fk: 'destination' });
  ontology.links.define('pilot_flights',      { source: 'Pilot',  target: 'Flight',  fk: 'pilot_id', direction: 'reverse' });
}
```

Now wrap the `await ontology.load()` call in `main()` with a fallback that demotes a failing DuckDB Flight to JSON. Find the line `await ontology.load();` near the bottom of `app.js` and replace it with:

```js
try {
  await ontology.load();
} catch (err) {
  if (String(err).toLowerCase().includes('duckdb') || String(err).toLowerCase().includes('read_json')) {
    console.warn('[duckdb] init failed; falling back to JSON adapter:', err.message);
    // Force re-define Flight as JSON adapter against the JSON file (always shipped).
    ontology.defineObject('Flight', {
      adapter: 'json',
      backingData: './data/flights.json',
      pk: 'tail_number',
    });
    // Reset cache for Flight rows so we don't keep partial DuckDB state.
    for (const key of Array.from(ontology.cache.keys())) {
      if (key.startsWith('Flight:')) ontology.cache.delete(key);
    }
    await ontology.load();
  } else {
    throw err;
  }
}
```

**Note:** the fallback re-runs all three adapters' `load()` because the simplest correct path is to not partially recover. JSON adapter loads are tiny and idempotent — they re-overwrite cache entries safely.

- [ ] **Step 6: Verify staging + dev paths**

Serve the project: `python3 -m http.server 8000` from `/workspaces/christopherbilg.github.io/`. Then:

1. **Dev path:** `http://localhost:8000/ontology/?env=dev` →
   - Console: three `[adapter:json] loaded …` lines.
   - `ontology.objectTypes.get('Flight').adapter` → `'json'`.
   - `ontology.cache.size` → 5300.
   - Click flight, depart, undo — all work.

2. **Staging path:** `http://localhost:8000/ontology/?env=staging` →
   - Console: `[duckdb] ready`, `[duckdb] registered flights …`, `[adapter:duckdb] loaded Flight (5000)`, plus two json lines.
   - `ontology.objectTypes.get('Flight').adapter` → `'duckdb'`.
   - `ontology.cache.size` → 5300.
   - Same UI flows work.

3. **Fallback path:** Edit `DuckDBProvider.js` line `const DUCKDB_CDN = 'https://...'` to a broken URL (e.g., `'https://cdn.jsdelivr.net/npm/nonexistent-package@1.29.0/+esm'`). Reload `?env=staging`. Expect:
   - Console: `[duckdb] init failed; falling back to JSON adapter: ...`.
   - App boots fully; flights still visible.
   - Revert the URL.

- [ ] **Step 7: Commit**

```bash
git add ontology/core/DuckDBAdapter.js ontology/core/Ontology.js \
  ontology/config/ConfigProvider.js ontology/app.js \
  ontology/env/dev/manifest.json ontology/env/staging/manifest.json ontology/env/prod/manifest.json
git commit -m "feat(ontology): Add DuckDBAdapter and wire Flight in staging/prod

Flight rows in staging and prod now load from flights.json via
DuckDB-Wasm read_json_auto, populating the same Ontology.cache that
powers every existing read path. Dev keeps Flight on JSONAdapter
for fast iteration. If DuckDB init fails (CDN unavailable, browser
feature gap), the app falls back to JSONAdapter and logs a warning."
```

---

## Task 5: `QueryBuilder.sql()` escape hatch

**Goal:** Add a `.sql(text, params)` method to `QueryBuilder` that runs raw parameterized SQL against `DuckDBProvider` and returns the results as `ObjectProxy[]` — routing each result back through `Ontology.get(type, pk)` so security and temporal filters apply.

**Files:**
- Modify: `ontology/core/QueryBuilder.js`

**Acceptance Criteria:**
- [ ] `await query().from('Flight').sql("SELECT * FROM flights WHERE status = ?", ['Scheduled']).collect()` returns proxied flight objects
- [ ] Each returned object has `.hasEdits()` (proves it's a proxy)
- [ ] Without a preceding `.from()`, `.sql()` throws `".sql() requires a preceding .from(typeName)"`
- [ ] If a Flight matched by SQL has been edited via `delayFlight`, the returned proxy shows the *edited* `departure_time`, not the underlying JSON value
- [ ] If the role is `viewer` (which hides Cancelled flights), a SQL query that would otherwise return Cancelled flights returns them filtered out
- [ ] If the time-travel slider is set to before a flight's `created_at`, that flight is filtered out of SQL results too — even though DuckDB returned it

**Verify:** Browser console with `?env=staging`:
```js
const r = await query().from('Flight').sql(
  "SELECT * FROM flights WHERE status = ? LIMIT 5",
  ['Scheduled']
).collect();
console.log(r.length, r[0].constructor.name, typeof r[0].hasEdits);
// Expected: 5 (or fewer if security filters), 'ObjectProxy', 'function'

const flight = r[0];
actions.dispatch('delayFlight', { flightId: flight.id, minutes: 30 });
const r2 = await query().from('Flight').sql(
  "SELECT * FROM flights WHERE tail_number = ?", [flight.id]
).collect();
console.log('original:', flight.departure_time, 'edited:', r2[0].departure_time);
// Expected: edited > original by 30 minutes
```

**Steps:**

- [ ] **Step 1: Add `.sql()` and update `collect()` to handle async**

Modify `ontology/core/QueryBuilder.js`. Add the import at the top:

```js
import { DuckDBProvider } from './DuckDBProvider.js';
```

Replace the existing `from()` to track the type for `.sql()`, and add `.sql()`. Also make `collect()` async to harmonize with `.sql()` results:

```js
from(typeName) {
  this._fromType = typeName;
  this._steps.push({ kind: 'from', type: typeName });
  return this;
}

sql(text, params = []) {
  if (!this._fromType) throw new Error('.sql() requires a preceding .from(typeName)');
  this._steps.push({ kind: 'sql', text, params });
  return this;
}
```

Then update `collect()` — make it async and add a branch for `'sql'`:

```js
async collect() {
  let frontier = [];
  let traversals = 0;

  for (const step of this._steps) {
    if (step.kind === 'from') {
      frontier = this.ontology.all(step.type, this._context);
    } else if (step.kind === 'startingFrom') {
      frontier = step.objects.slice();
    } else if (step.kind === 'sql') {
      const provider = DuckDBProvider.shared();
      const rows = await provider.query(step.text, step.params);
      const pk = this.ontology.objectTypes.get(this._fromType).pk;
      frontier = rows
        .map((r) => this.ontology.get(this._fromType, r[pk], this._context))
        .filter(Boolean);
    } else if (step.kind === 'traverse') {
      traversals++;
      if (traversals > this._maxDepth) {
        throw new Error(`Max traversal depth ${this._maxDepth} exceeded`);
      }
      const visited = new Set();
      const next = [];
      for (const obj of frontier) {
        if (typeof obj?.links !== 'function') continue;
        for (const target of obj.links(step.linkName)) {
          const k = `${target.typeName}:${target.id}`;
          if (visited.has(k)) continue;
          visited.add(k);
          next.push(target);
        }
      }
      frontier = next;
    } else if (step.kind === 'where') {
      frontier = frontier.filter((obj) => {
        try { return Boolean(step.predicate(obj)); }
        catch { return false; }
      });
    }
  }

  return frontier;
}

async count() {
  return (await this.collect()).length;
}
```

(Note: `collect()` and `count()` become async. Existing in-tree callers are `agent.ask` consumers and the hint-text in `index.html` footer; the in-tree call sites need to `await` if they don't already. Check `core/Agent.js` for any synchronous `query().collect()` use.)

- [ ] **Step 2: Audit callers for the async change**

Run:

```bash
grep -rn "\.collect()" /workspaces/christopherbilg.github.io/ontology --include="*.js"
grep -rn "\.count()"   /workspaces/christopherbilg.github.io/ontology --include="*.js"
```

For each call site, verify it's already inside an `async` function or is await-able. The most likely caller is `core/Agent.js`. If a synchronous call site exists, wrap it with `await` and propagate `async` outward to its callers.

If `Agent.ask()` is called from `app.js` synchronously and now returns a promise, update `app.js`'s `askAgent` function:

```js
async function askAgent(prompt) {
  if (!agent) return;
  const result = await agent.ask(prompt);
  state.aipResult = { prompt, result };
  renderAip();
}
```

…and any callsite that does `askAgent(...)` without awaiting still works (fire-and-forget is fine for UI).

- [ ] **Step 3: Verify in browser console**

Reload `?env=staging`. Run the verification snippet from the **Verify** section. Expected results match.

Test the security filter: switch role to `viewer`. Re-run the SQL query against status `'Cancelled'`:

```js
ontology.security.setRole('viewer');
const r = await query().from('Flight').sql(
  "SELECT * FROM flights WHERE status = ?", ['Cancelled']
).collect();
console.log('cancelled visible to viewer:', r.length); // 0 (viewer hides Cancelled)
ontology.security.setRole('admin');
```

Test the temporal filter: pick a flight, note its `created_at`, set the time slider to a date before that, then SQL-query for it:

```js
// e.g., a flight created on 2026-04-01:
// Set $txInput to 2026-03-15.
const r = await query().from('Flight').sql("SELECT * FROM flights LIMIT 5").asOf({ asOfTx: '2026-03-15T00:00:00Z', asOfValid: '2026-03-15T00:00:00Z' }).collect();
console.log('flights visible before creation:', r.length); // 0 — none were created yet
```

(Note: `.asOf()` already exists in `QueryBuilder` — used by `_context` in `from()`.)

- [ ] **Step 4: Commit**

```bash
git add ontology/core/QueryBuilder.js ontology/core/Agent.js ontology/app.js
git commit -m "feat(ontology): Add QueryBuilder.sql() escape hatch

Raw parameterized SQL against DuckDB; results route through
Ontology.get(type, pk) so kinetic-edit overlay, security read
filtering, and time-travel context all apply. collect() and
count() become async; updated Agent and app.js callsites."
```

(The exact files to git-add depend on which callsites needed updates in Step 2 — adjust accordingly.)

---

## Task 6: Generalized detail panel + `state.selection` refactor

**Goal:** Generalize `app.js`'s detail-panel rendering so Pilots and Airports can be selected and shown, in preparation for the graph view's click-to-select bridge. Refactor `state.selectedFlightId` to `state.selection: { type, id } | null`.

**Files:**
- Modify: `ontology/app.js` (state shape; `renderDetail`; click handlers)

**Acceptance Criteria:**
- [ ] `state.selection` replaces `state.selectedFlightId`; flight-list click sets `state.selection = { type: 'Flight', id: ... }`
- [ ] Detail panel for `Flight` looks identical to current behavior (status, departure_time, pilot_id, route, computed, links, actions)
- [ ] Detail panel for `Pilot` shows: merged state (pilot_id, name, license_level, flight_hours), computed properties (`experience_tier`, `assigned_flight_count`, `has_active_flight`), outgoing links (its flights)
- [ ] Detail panel for `Airport` shows: merged state (code, name, city, country), outgoing flights (via `flight_origin` and `flight_destination` reverse traversal — implemented as a query)
- [ ] Pilots and Airports show **no actions** (correct — none are defined for those types)
- [ ] Clicking the same item again does nothing weird (no state corruption)
- [ ] Time travel + role switching still affect the detail panel

**Verify:** Open `?env=dev` (or staging). Confirm flight selection still works. In console:

```js
appState.selection = { type: 'Pilot', id: 'P001' };
ontology.emit('action', null);  // triggers re-render
// Visual check: detail panel shows pilot info, no actions.

appState.selection = { type: 'Airport', id: 'JFK' };
ontology.emit('action', null);
// Visual check: detail panel shows airport info plus a list of outgoing flights.
```

**Steps:**

- [ ] **Step 1: Refactor `state` shape**

In `ontology/app.js`, change the `state` object:

```js
const state = {
  selection: null,   // { type: 'Flight'|'Pilot'|'Airport', id: string } | null
  lastError: null,
  context: null,
  aipResult: null,
  aipShowSchema: false,
  integrity: { findings: [], scannedAt: null, scanning: false },
};
```

Replace every `state.selectedFlightId` reference. Find them:

```bash
grep -n "selectedFlightId" /workspaces/christopherbilg.github.io/ontology/app.js
```

For each occurrence:
- `state.selectedFlightId = el.dataset.tail` → `state.selection = { type: 'Flight', id: el.dataset.tail }`
- `state.selectedFlightId` (read) → `state.selection?.type === 'Flight' ? state.selection.id : null`
- In `renderFlightList` → `f.id === (state.selection?.type === 'Flight' ? state.selection.id : null)` for the selected check
- In `renderDetail` → branch on `state.selection`, dispatch to the right renderer

- [ ] **Step 2: Split `renderDetail` into a dispatch + per-type renderers**

Replace the existing `renderDetail` function with a dispatcher and three renderers. Keep the existing flight body — just move it into `renderFlightDetail`:

```js
function renderDetail() {
  if (!state.selection) {
    $detail.innerHTML = '<div class="empty">Select a flight, pilot, or airport to see its merged state, links, and available actions.</div>';
    return;
  }
  const { type, id } = state.selection;
  if (type === 'Flight')  return renderFlightDetail(id);
  if (type === 'Pilot')   return renderPilotDetail(id);
  if (type === 'Airport') return renderAirportDetail(id);
  $detail.innerHTML = `<div class="empty">Unknown type: ${escapeHtml(type)}</div>`;
}

function renderFlightDetail(id) {
  // === existing renderDetail body, with `state.selectedFlightId` → `id` ===
  const flight = ontology.get('Flight', id, state.context);
  if (!flight) {
    $detail.innerHTML = '<div class="empty">Selected flight does not exist at this point in time.</div>';
    return;
  }
  // … rest of existing flight rendering, including action wiring …
}

function renderPilotDetail(id) {
  const pilot = ontology.get('Pilot', id, state.context);
  if (!pilot) {
    $detail.innerHTML = '<div class="empty">Selected pilot does not exist at this point in time.</div>';
    return;
  }
  const flights = pilot.links('pilot_flights') || [];
  const computedNames = ontology.computed.computedNames('Pilot');
  const computedHtml = computedNames.length
    ? computedNames.map((name) => {
        let v;
        try { v = pilot[name]; } catch (e) { v = `<error: ${e.message}>`; }
        return `<dt>${escapeHtml(name)}</dt><dd>${escapeHtml(formatComputedValue(v))}</dd>`;
      }).join('')
    : '<dt class="hint" style="grid-column:1/-1">no computed properties</dt>';

  $detail.innerHTML = `
    <div class="detail">
      <h3>${escapeHtml(pilot.name)} <span class="hint">(${escapeHtml(pilot.pilot_id)})</span></h3>
      <div class="sub">Pilot · created ${escapeHtml(formatDate(pilot.created_at))}</div>

      <div class="detail-section">
        <h4>Merged state</h4>
        <dl class="kv">
          <dt>pilot_id</dt>      <dd>${escapeHtml(pilot.pilot_id)}</dd>
          <dt>name</dt>          <dd>${escapeHtml(pilot.name)}</dd>
          <dt>license_level</dt> <dd>${escapeHtml(pilot.license_level)}</dd>
          <dt>flight_hours</dt>  <dd>${escapeHtml(String(pilot.flight_hours))}</dd>
        </dl>
      </div>

      <div class="detail-section">
        <h4>Computed</h4>
        <dl class="kv">${computedHtml}</dl>
      </div>

      <div class="detail-section">
        <h4>Flights (${flights.length})</h4>
        ${flights.length
          ? flights.slice(0, 20).map((f) => `
              <div class="link-row">
                <div>
                  <div class="type">flight_pilot</div>
                  ${escapeHtml(f.tail_number)} <span class="hint">(${escapeHtml(f.origin)} → ${escapeHtml(f.destination)} · ${escapeHtml(f.status)})</span>
                </div>
              </div>`).join('') + (flights.length > 20 ? `<div class="hint">… and ${flights.length - 20} more</div>` : '')
          : '<div class="hint">No flights linked to this pilot.</div>'}
      </div>

      <div class="detail-section">
        <h4>Actions</h4>
        <div class="hint">No actions defined for Pilot.</div>
      </div>
    </div>
  `;
}

function renderAirportDetail(id) {
  const airport = ontology.get('Airport', id, state.context);
  if (!airport) {
    $detail.innerHTML = '<div class="empty">Selected airport does not exist at this point in time.</div>';
    return;
  }
  // Flights with this airport as origin or destination — discoverable via LinkCoordinator findByProperty.
  const departures = ontology.links.findByProperty('Flight', 'origin', id, state.context);
  const arrivals   = ontology.links.findByProperty('Flight', 'destination', id, state.context);

  $detail.innerHTML = `
    <div class="detail">
      <h3>${escapeHtml(airport.name)} <span class="hint">(${escapeHtml(airport.code)})</span></h3>
      <div class="sub">Airport · ${escapeHtml(airport.city)}, ${escapeHtml(airport.country)}</div>

      <div class="detail-section">
        <h4>Merged state</h4>
        <dl class="kv">
          <dt>code</dt>    <dd>${escapeHtml(airport.code)}</dd>
          <dt>name</dt>    <dd>${escapeHtml(airport.name)}</dd>
          <dt>city</dt>    <dd>${escapeHtml(airport.city)}</dd>
          <dt>country</dt> <dd>${escapeHtml(airport.country)}</dd>
        </dl>
      </div>

      <div class="detail-section">
        <h4>Departures (${departures.length})</h4>
        ${departures.length
          ? departures.slice(0, 10).map((f) => `
              <div class="link-row">
                <div>
                  <div class="type">flight_origin</div>
                  ${escapeHtml(f.tail_number)} → ${escapeHtml(f.destination)} <span class="hint">(${escapeHtml(f.status)})</span>
                </div>
              </div>`).join('') + (departures.length > 10 ? `<div class="hint">… and ${departures.length - 10} more</div>` : '')
          : '<div class="hint">No departures.</div>'}
      </div>

      <div class="detail-section">
        <h4>Arrivals (${arrivals.length})</h4>
        ${arrivals.length
          ? arrivals.slice(0, 10).map((f) => `
              <div class="link-row">
                <div>
                  <div class="type">flight_destination</div>
                  ${escapeHtml(f.tail_number)} ← ${escapeHtml(f.origin)} <span class="hint">(${escapeHtml(f.status)})</span>
                </div>
              </div>`).join('') + (arrivals.length > 10 ? `<div class="hint">… and ${arrivals.length - 10} more</div>` : '')
          : '<div class="hint">No arrivals.</div>'}
      </div>

      <div class="detail-section">
        <h4>Actions</h4>
        <div class="hint">No actions defined for Airport.</div>
      </div>
    </div>
  `;
}
```

(Note: the `renderFlightDetail` body is the existing `renderDetail` body with `state.selectedFlightId` references replaced by the local `id` parameter. Don't omit the existing computed-properties block, links rendering, action wiring — copy it over wholesale.)

- [ ] **Step 3: Update flight-list click handler**

In the click handler inside `renderFlightList`:

```js
$flightList.querySelectorAll('.card').forEach((el) => {
  el.addEventListener('click', () => {
    state.selection = { type: 'Flight', id: el.dataset.tail };
    state.lastError = null;
    render();
  });
});
```

And update the selected-class logic earlier in the same function:

```js
const selectedId = state.selection?.type === 'Flight' ? state.selection.id : null;
// ... inside map:
const selected = f.id === selectedId ? ' selected' : '';
```

- [ ] **Step 4: Verify in browser**

1. Reload `?env=dev`. Click a flight card → detail panel shows flight (unchanged from before).
2. In console:
   ```js
   appState.selection = { type: 'Pilot', id: 'P001' };
   ontology.emit('action', null);
   ```
   → Detail panel shows pilot P001's info, computed properties, and a list of flights.
3. ```js
   appState.selection = { type: 'Airport', id: 'JFK' };
   ontology.emit('action', null);
   ```
   → Detail panel shows JFK's info plus departures and arrivals lists.
4. Move time slider to before any flight existed (e.g., 2026-01-01). Pilot detail still shows but with zero flights linked (correct — flights weren't created yet).

- [ ] **Step 5: Commit**

```bash
git add ontology/app.js
git commit -m "refactor(ontology): Generalize detail panel for Pilot and Airport

state.selectedFlightId becomes state.selection: { type, id }.
renderDetail dispatches to per-type renderers; Pilot shows
linked flights; Airport shows departures and arrivals via
LinkCoordinator.findByProperty. No actions are rendered for
Pilot/Airport (correct — none are defined). Existing Flight
detail behavior is unchanged."
```

---

## Task 7: `GraphView` module (built but not yet mounted)

**Goal:** Build the `views/GraphView.js` module that owns the `force-graph` instance, converts ontology data into nodes+links, and wires click→select. Verify in isolation by mounting it temporarily into a test container; full mount happens in Task 8.

**Files:**
- Create: `ontology/views/GraphView.js`

**Acceptance Criteria:**
- [ ] `new GraphView(canvasEl, ontology, { onSelect, getContext })` constructs without errors
- [ ] `view.mount()` subscribes to `loaded`/`action`/`undo` events
- [ ] `view.refresh()` reads from `ontology.all('Flight'|'Pilot'|'Airport', context)` (where context comes from `getContext()`) and produces a `{ nodes, links }` shape
- [ ] At staging dataset size, ~5,300 nodes and ~15,000 links are produced
- [ ] `nodes` use `Type:pk` ids; node objects carry `type`, `label`, `color`, `meta: { pk }`
- [ ] `links` reference forward link types only (`flight_pilot`, `flight_origin`, `flight_destination`) — `pilot_flights` is excluded as it's the reverse
- [ ] `view.destroy()` removes event listeners cleanly

**Verify (temporary mount):** In the browser console with `?env=staging`:

```js
const { GraphView } = await import('./views/GraphView.js');
const div = document.createElement('div');
div.style.cssText = 'position:fixed;top:50px;left:50px;width:600px;height:400px;background:#fff;border:2px solid #000;z-index:9999;';
document.body.appendChild(div);
const view = new GraphView(div, ontology, {
  onSelect: (sel) => console.log('selected:', sel),
  getContext: () => null,
});
view.mount();
view.refresh();
// Visual check: a galaxy of dots and edges renders. Click a node — selected: { type, id } logs.
// Cleanup:
// view.destroy(); div.remove();
```

**Steps:**

- [ ] **Step 1: Create the module**

Create `ontology/views/GraphView.js`:

```js
import ForceGraph from 'https://esm.sh/force-graph@1.43.0';

const NODE_COLORS = {
  Flight:  '#4f8eff',
  Pilot:   '#34c759',
  Airport: '#f5a623',
};

const STATUS_NODE_COLORS = {
  Scheduled: '#4f8eff',
  InAir:     '#b45309',
  Landed:    '#15803d',
  Cancelled: '#b91c1c',
};

const FORWARD_LINK_TYPES = ['flight_pilot', 'flight_origin', 'flight_destination'];

export class GraphView {
  constructor(canvasEl, ontology, { onSelect, getContext }) {
    this.canvasEl = canvasEl;
    this.ontology = ontology;
    this.onSelect = onSelect || (() => {});
    this.getContext = getContext || (() => null);
    this._listeners = [];
    this._fg = null;
    this._mounted = false;
  }

  mount() {
    if (this._mounted) return;
    this._fg = ForceGraph()(this.canvasEl)
      .nodeLabel((n) => `<b>${n.type}</b> · ${n.label}<br/><span style="color:#999">${n.id}</span>`)
      .nodeColor((n) => n.color)
      .nodeRelSize(4)
      .linkColor(() => 'rgba(120,120,140,0.3)')
      .linkDirectionalParticles(0)
      .cooldownTicks(100)
      .onNodeClick((node) => this.onSelect({ type: node.type, id: node.meta.pk }));

    const onLoaded = () => this.refresh();
    const onAction = () => this.refreshLight();
    const onUndo   = () => this.refreshLight();
    this.ontology.on('loaded', onLoaded);
    this.ontology.on('action', onAction);
    this.ontology.on('undo',   onUndo);
    this._listeners.push(['loaded', onLoaded], ['action', onAction], ['undo', onUndo]);

    this._mounted = true;
    if (this.ontology.loaded) this.refresh();
  }

  refresh() {
    if (!this._fg) return;
    const ctx = this.getContext();
    const nodes = [];
    const nodeIds = new Set();

    for (const type of ['Flight', 'Pilot', 'Airport']) {
      for (const obj of this.ontology.all(type, ctx)) {
        const id = `${type}:${obj.id}`;
        if (nodeIds.has(id)) continue;
        nodeIds.add(id);
        nodes.push({
          id,
          type,
          label: this._labelFor(type, obj),
          color: this._colorFor(type, obj),
          meta: { pk: obj.id },
        });
      }
    }

    const links = [];
    for (const flight of this.ontology.all('Flight', ctx)) {
      const fid = `Flight:${flight.id}`;
      for (const linkName of FORWARD_LINK_TYPES) {
        const linkDef = this.ontology.links.get(linkName);
        if (!linkDef || linkDef.source !== 'Flight') continue;
        const fkValue = flight[linkDef.fk];
        if (fkValue == null) continue;
        const tid = `${linkDef.target}:${fkValue}`;
        if (!nodeIds.has(tid)) continue;
        links.push({ source: fid, target: tid, type: linkName });
      }
    }

    this._fg.graphData({ nodes, links });
  }

  refreshLight() {
    // Topology is unchanged; only re-color nodes (status changes affect Flight color).
    if (!this._fg) return;
    const ctx = this.getContext();
    const colored = this._fg.graphData();
    for (const n of colored.nodes) {
      if (n.type !== 'Flight') continue;
      const obj = this.ontology.get('Flight', n.meta.pk, ctx);
      if (!obj) continue;
      n.color = this._colorFor('Flight', obj);
    }
    this._fg.graphData(colored);
  }

  destroy() {
    for (const [event, fn] of this._listeners) {
      // No removeListener API on Ontology — safe in a learning project, leak ignored at page lifetime.
      // Documented gap: Ontology.on has no off; future cleanup is bounded by page lifetime.
      void event; void fn;
    }
    this._listeners = [];
    if (this._fg) {
      // force-graph has no .destroy(); clear data and let GC collect.
      this._fg.graphData({ nodes: [], links: [] });
      this._fg = null;
    }
    this._mounted = false;
  }

  _labelFor(type, obj) {
    if (type === 'Flight')  return obj.tail_number;
    if (type === 'Pilot')   return obj.name || obj.pilot_id;
    if (type === 'Airport') return obj.code;
    return obj.id;
  }

  _colorFor(type, obj) {
    if (type === 'Flight') return STATUS_NODE_COLORS[obj.status] || NODE_COLORS.Flight;
    return NODE_COLORS[type];
  }
}
```

Notes the implementer should be aware of:
- The CDN URL for `force-graph` is pinned in the `import` line.
- `nodeRelSize: 4` is small enough that 5k nodes don't cover the viewport.
- `cooldownTicks: 100` stops layout simulation after 100 ticks — keeps boot cost bounded.
- `refreshLight()` is an optimization for the common case of a status-changing action: topology doesn't change, only colors do. Full `refresh()` only runs on the broader `loaded` event.
- `Ontology.on` has no `off`; we accept the listener leak at page lifetime (documented in code comment).
- The CDN import (`'https://esm.sh/force-graph@1.43.0'`) requires serving via HTTP, not file://.

- [ ] **Step 2: Verify the temporary mount**

Reload `?env=staging`. Open console. Run the verification snippet from the **Verify** section. Expected: a tiny 600×400 floating panel renders the graph; clicking nodes logs `selected: { type, id }` to console.

- [ ] **Step 3: Commit**

```bash
git add ontology/views/GraphView.js
git commit -m "feat(ontology): Add GraphView module for WebGL link analysis

force-graph (2D, pinned CDN) wrapper that subscribes to ontology
events and converts the cache into a {nodes, links} shape using
the three forward link types. Click bridge calls onSelect with
{type, id}. refreshLight() re-colors without rebuilding topology
on action/undo. Not yet mounted into the page — Task 8 wires it
in and refactors the layout."
```

---

## Task 8: Layout refactor + `app.js` wiring + remove flight list

**Goal:** Replace the flight-list panel in `index.html` with the graph canvas. Mount `GraphView`, hook up click handlers to set `state.selection`, delete `renderFlightList` and the list-only rendering paths.

**Files:**
- Modify: `ontology/index.html` (replace `<section class="panel panel-list">` block; remove `flight-list` div)
- Modify: `ontology/styles.css` (add `.panel-graph` and `#graph-canvas` styles; tweak `.layout` grid)
- Modify: `ontology/app.js` (mount GraphView; remove `renderFlightList`; render dispatch)

**Acceptance Criteria:**
- [ ] Page layout is `graph | detail | audit-log` at 60% / flex / 320px columns
- [ ] Graph canvas occupies the left panel, fills its height (viewport minus header)
- [ ] Clicking a node in the graph → detail panel populates for that type
- [ ] Removed: `renderFlightList`, the `.panel-list` block, the `<div id="flight-list">` element, and any references to them
- [ ] `viewer` role still hides Cancelled flights — they don't appear as nodes
- [ ] Time slider still hides not-yet-existing entities from the graph
- [ ] At staging size, the graph renders within ~5 seconds and stays interactive
- [ ] After dispatching `cancelFlight`, the affected node re-colors (red) without a full topology rebuild — observable via no layout jitter on small actions
- [ ] Branching: switching to a what-if branch with a hypothetical action shows that action's effect in the graph; switching back to `main` reverts

**Verify:** Open `?env=staging`. Watch graph render. Click a Pilot node → detail panel populates. Cancel a flight → its node turns red without the whole graph re-jiggling. Move time slider back → flights vanish. Switch role to viewer → Cancelled flights vanish.

**Steps:**

- [ ] **Step 1: Update `index.html` layout**

Modify `ontology/index.html`. Replace the `<main class="layout">` block:

```html
<main class="layout">
  <section class="panel panel-graph">
    <h2>Graph <span class="hint">Click a node to select. Drag to pan.</span></h2>
    <div id="graph-canvas"></div>
  </section>

  <section class="panel panel-detail">
    <div id="detail">
      <div class="empty">Click a node to see its merged state, links, and available actions.</div>
    </div>
  </section>

  <aside class="panel panel-log">
    <h2>Audit log <span class="hint">ChangeSets (Memento + Command)</span></h2>
    <div id="log" class="log"></div>
  </aside>
</main>
```

The `<section class="panel panel-list">` (with `<h2>Flights …</h2>` and the `<div id="flight-list" class="grid">`) is **deleted** — replaced by `panel-graph`.

- [ ] **Step 2: Update `styles.css`**

Modify `ontology/styles.css`. Replace the `.layout` block (currently `grid-template-columns: 1.2fr 1.4fr 1fr;`) with:

```css
.layout {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr) 320px;
  gap: 16px;
  padding: 16px;
}

@media (max-width: 1100px) {
  .layout { grid-template-columns: 1fr; }
}

.panel-graph {
  display: flex;
  flex-direction: column;
  min-height: 600px;
}

#graph-canvas {
  flex: 1;
  min-height: 540px;
  background: #fafbfc;
  border-radius: 6px;
  border: 1px solid var(--border);
  overflow: hidden;
}
```

- [ ] **Step 3: Wire `GraphView` into `app.js`**

In `ontology/app.js`:

Add the import at the top:

```js
import { GraphView } from './views/GraphView.js';
```

Remove the `$flightList` reference and the `renderFlightList` function entirely. Find them with:

```bash
grep -n "flight-list\|renderFlightList\|\$flightList" /workspaces/christopherbilg.github.io/ontology/app.js
```

Delete:
- `const $flightList = document.getElementById('flight-list');`
- The entire `function renderFlightList() { … }` body.
- The line `renderFlightList();` inside `render()`.

Add a `$graphCanvas` reference and a `graphView` variable near the other DOM references:

```js
const $graphCanvas = document.getElementById('graph-canvas');
let graphView = null;
```

In `main()`, after `await ontology.load()` (or after the fallback try/catch from Task 4), instantiate the view:

```js
graphView = new GraphView($graphCanvas, ontology, {
  onSelect: ({ type, id }) => {
    state.selection = { type, id };
    state.lastError = null;
    render();
  },
  getContext: () => state.context,
});
graphView.mount();
```

Update `render()` to remove the flight-list call:

```js
function render() {
  renderTxBadge();
  renderCRDTBadge();
  renderDetail();
  renderLog();
  renderAip();
}
```

(Note: `GraphView` self-refreshes via its own subscriptions; `render()` doesn't need to call it.)

- [ ] **Step 4: Verify the integrated UI**

Reload `?env=staging`. Verify:

1. **Layout:** three panels visible — graph (left, ~60%), detail (middle), audit log (right, ~320px). Graph canvas is tall.
2. **Graph render:** ~5,300 nodes appear in three colors (blue Scheduled flights / amber/orange InAir / green Landed / red Cancelled, plus green pilots and amber airports — collisions in palette are fine, the legend is "Flight node colors come from status; Pilot/Airport from type"). Layout settles within ~5s.
3. **Click selection:**
   - Click a flight node → flight detail panel.
   - Click a pilot node → pilot detail panel (Task 6).
   - Click an airport node → airport detail panel.
4. **Action coloring:** select a Scheduled flight → click "Depart flight" → its node color shifts (no full layout rebuild — should be a near-instant color flash, not a re-jiggle).
5. **Branching:** create branch `experiment` → cancel a flight → switch back to `main` → graph shows that flight as Scheduled again.
6. **Time travel:** set the time slider to 2026-01-01 (before any flight `created_at`) → all Flight nodes vanish; only Pilots and Airports remain.
7. **Viewer role:** switch to `viewer` → Cancelled flights disappear from the graph.
8. **Integrity worker:** click "Inject test issue" → integrity panel still shows orphan FK on N101AA1 (or the equivalent first flight tail in the new dataset).
9. **AIP intents:** "list pilots" / "depart N001AA" — still work.
10. **Multi-tab CRDT:** open a second tab → both display the same `nodeId · clk N` pair → dispatch in tab 1 → tab 2's audit log updates and graph re-colors.

If anything breaks, fix before commit.

- [ ] **Step 5: Commit**

```bash
git add ontology/index.html ontology/styles.css ontology/app.js
git commit -m "feat(ontology): Replace flight-list panel with GraphView

The graph view becomes the primary navigation surface for the
ontology. Layout shifts to graph (60%) | detail | audit-log
(320px). renderFlightList and the .panel-list HTML are deleted;
selection now flows from graph node clicks through state.selection
into the existing detail panel. force-graph subscribes to
ontology events and self-refreshes on action/undo/loaded."
```

---

## Task 9: Final verification sweep + footer docs update

**Goal:** Walk both verification checklists from the spec (Phase A and Phase B) end-to-end. Update the `index.html` footer's "What this demonstrates" list with two new bullets describing the Adapter and GraphView patterns. Capture any rough edges as follow-ups.

**Files:**
- Modify: `ontology/index.html` (footer `<ul class="arch">` — add two bullets)

**Acceptance Criteria:**
- [ ] All Phase A verification items from spec §6 pass on `?env=staging`
- [ ] All Phase B verification items from spec §6 pass on `?env=staging`
- [ ] All Phase A verification items pass on `?env=dev` (which uses JSONAdapter for Flight)
- [ ] Footer has two new bullets in the "What this demonstrates" list
- [ ] No console errors on a clean reload

**Verify:** Walk every checkbox in spec §6 Phase A and Phase B. Take a quick screenshot of the page (mental note OK) — ensure layout is clean, no overlapping elements, graph is visible.

**Steps:**

- [ ] **Step 1: Phase A verification (DuckDB) — run on `?env=staging`**

Walk through every item in spec §6 Phase A:

- [ ] **Boot sanity:** `manifest-badge` reads as expected; `console.info` shows `[duckdb] ready` once.
- [ ] `ontology.cache.size === 5300` (5000 + 200 + 100). Confirm via console.
- [ ] `Array.from(ontology.cache.keys()).filter(k => k.startsWith('Flight:')).length === 5000`.
- [ ] **Adapter pattern:**
  - `ontology.objectTypes.get('Flight').adapter === 'duckdb'` (staging).
  - Switch env to dev → reload → `=== 'json'`. UI behavior identical.
- [ ] **`.sql()` escape hatch:**
  ```js
  await query().from('Flight').sql(
    "SELECT * FROM flights WHERE status = 'Scheduled' LIMIT 5"
  ).collect()
  ```
  Returns 5 ObjectProxy objects. Verify `r[0].hasEdits` is a function.
- [ ] **Kinetic overlay survives SQL:** delay one of those flights via `actions.dispatch('delayFlight', { flightId, minutes: 30 })`; re-run SQL; result reflects new departure_time.
- [ ] **Time travel:** move slider to before all flights' `created_at`; both `ontology.all('Flight')` and the SQL query return zero proxies (filtered through `Ontology.get(_, _, ctx)`).
- [ ] **Regression sweep:** branching create/switch/merge; integrity worker inject test issue; AIP intents `depart`, `pilots to LAX`, `list pilots`; role switching `admin → viewer → admin`; multi-tab CRDT with second tab open.

- [ ] **Step 2: Phase B verification (Graph) — run on `?env=staging`**

Walk through every item in spec §6 Phase B:

- [ ] ~5,300 nodes visible; three+ colors distinguishable; ~15k edges visible; layout settles in < 5s.
- [ ] Hover a node → tooltip shows type, label, id.
- [ ] Click Flight node → flight detail panel.
- [ ] Click Pilot node → pilot detail panel with computed properties + linked flights.
- [ ] Click Airport node → airport detail panel with departures + arrivals.
- [ ] Cancel a flight → that node's color updates without full topology rebuild.
- [ ] Switch to a `what-if` branch → graph reflects branch state; switch back → reverts.
- [ ] Time travel: backward slider hides not-yet-existing entities.
- [ ] Resize window → canvas resizes without breaking detail panel.
- [ ] `viewer` role hides Cancelled flights from the graph.
- [ ] Performance: cooldown finishes within ~5s; no main-thread lockup over 200ms; dragging nodes feels smooth on a typical laptop.

If any item fails, fix it. If the fix is small, include it in this task's commit; if the fix is structural, note it in §3 ("Follow-ups") below before commit.

- [ ] **Step 3: Update the footer "What this demonstrates" list**

Modify `ontology/index.html`. Find the `<ul>` inside `<section class="arch">`. Add two new bullets — place the **Adapter** bullet immediately after the existing `<strong>Adapter</strong>` bullet (replacing it, since that one currently misrepresents what's there), and add **Graph view** at a sensible place (e.g., after the existing CRDT bullet or near the integrity-worker bullet — pick wherever flow-wise it fits).

Replace the existing line:

```html
<li><strong>Adapter</strong> — each object type binds to a backing JSON source via a <code>backingData</code> URL and primary key.</li>
```

with:

```html
<li><strong>Adapter</strong> — <code>BackingAdapter</code> defines a small interface (<code>load()</code>, <code>getRow()</code>, <code>allRows()</code>); <code>JSONAdapter</code> fetches static JSON, <code>DuckDBAdapter</code> registers the same JSON in DuckDB-Wasm's virtual FS and queries it via <code>read_json_auto</code>. Both populate <code>Ontology.cache</code>, so every read path (<code>ObjectProxy</code>, computed properties, integrity scan) is unaware of the source. Per-environment selection lives in <code>env/{env}/manifest.json</code> under <code>adapters</code>; <code>dev</code> uses JSON for fast iteration, <code>staging</code> and <code>prod</code> push <code>Flight</code> through DuckDB. Try <code>ontology.objectTypes.get('Flight').adapter</code>.</li>
<li><strong>OLAP escape hatch</strong> — <code>QueryBuilder.sql(text, params)</code> runs raw parameterized SQL against DuckDB-Wasm; results route through <code>Ontology.get(type, pk)</code> so the kinetic-edit overlay, security read filter, and time-travel context all still apply. Try <code>await query().from('Flight').sql("SELECT * FROM flights WHERE status = ?", ['Scheduled']).collect()</code>.</li>
```

Then add this new bullet (place it after the integrity-worker bullet for narrative flow, or near the existing CRDT bullet — both are fine):

```html
<li><strong>WebGL graph</strong> — <code>views/GraphView.js</code> mounts a <code>force-graph</code> 2D canvas as the primary navigation surface. Subscribes to <code>loaded</code>/<code>action</code>/<code>undo</code> events and rebuilds <code>{nodes, links}</code> from the same ontology read APIs the rest of the UI uses, so security filtering, time travel, and branching all flow through it for free. Click a node to drive the detail panel via <code>state.selection: { type, id }</code>.</li>
```

- [ ] **Step 4: Final clean reload**

Reload `?env=staging` with browser cache cleared. Verify:
- No console errors.
- All three new footer bullets render correctly with code snippets formatted.
- Page works end-to-end from a cold load.

- [ ] **Step 5: Commit**

```bash
git add ontology/index.html
git commit -m "docs(ontology): Update footer with Adapter/SQL/GraphView bullets

Document the three new patterns demonstrated by this iteration
in the in-page 'What this demonstrates' list, consistent with
the project's existing pedagogical style."
```

- [ ] **Step 6: (Optional) Capture follow-ups**

If the verification sweep surfaced rough edges that aren't worth blocking on, capture them as a one-liner section near the bottom of `tools/README.md` (or skip if everything is clean). Common candidates:
- Unmount/cleanup gap on `Ontology.on` (no `off`; documented in `GraphView.destroy()`).
- Edge styling — currently uniform; per-link-type color was a §7 open question.
- Pilot/Airport detail panels show only first 10–20 linked flights; full pagination is a stretch.

---

## Self-Review

After writing this plan, here's the spec-coverage check:

| Spec section | Covered by task(s) |
|---|---|
| §1 Goals | Task 9 verifies all success criteria |
| §1 Non-goals | Implicit — no task introduces P2P, LLM, WebGPU, write-path-through-DuckDB |
| §2 File map | Tasks 1, 2, 3, 4, 5, 6, 7, 8 collectively produce every file in the map |
| §2 Boot sequence | Task 4 step 5 (`setupOntology`); Task 4 step 6 verifies |
| §2 Read paths | Task 5 (.sql), Task 1 (cache invariant) |
| §3 BackingAdapter | Task 1 |
| §3 JSONAdapter | Task 1 |
| §3 DuckDBAdapter | Task 4 |
| §3 DuckDBProvider | Task 3 |
| §3 QueryBuilder.sql | Task 5 |
| §3 Integrity worker (no change) | Task 9 verification |
| §3 Synthetic data generation | Task 2 |
| §4 GraphView | Task 7 |
| §4 index.html layout refactor | Task 8 |
| §4 Detail panel for Pilot/Airport | Task 6 |
| §4 Library loading via CDN | Tasks 3, 7 (pinned imports) |
| §5 Risk 1 off-ramp (DuckDB fallback) | Task 4 step 5 |
| §5 Risk 2 mitigations (cooldownTicks, refreshLight) | Task 7 |
| §5 Risk 3 off-ramp (minimal Pilot/Airport detail) | Task 6 (full version implemented; off-ramp not needed) |
| §6 Phase A verification | Task 9 step 1 |
| §6 Phase B verification | Task 9 step 2 |
| §7 Documentation surface | Task 9 step 3 (footer); Task 2 step 3 (tools/README) |

No gaps identified. No placeholders or "implement later" markers. Type/method names checked across tasks: `BackingAdapter.load/getRow/allRows/getSchema`, `DuckDBProvider.shared/init/registerJSON/query`, `GraphView.constructor(canvasEl, ontology, { onSelect, getContext })`, `state.selection: { type, id }` — all consistent.

The plan is approximately 9 tasks ≈ 9 commits, fits the day budget, and each task is independently verifiable and committable.
