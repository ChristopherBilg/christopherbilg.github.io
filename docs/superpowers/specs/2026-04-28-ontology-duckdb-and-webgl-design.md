# Ontology — DuckDB-Wasm storage adapter and WebGL graph view

**Date:** 2026-04-28
**Project:** `ontology/` (Palantir-lite static-file learning project)
**Scope:** Two coordinated additions, one combined implementation phase, single day budget.

---

## 1. Goals & non-goals

### Goals

1. Demonstrate two new patterns by extending the project's "gallery of patterns" framing:
   - **Adapter pattern** with two real implementations (`JSONAdapter`, `DuckDBAdapter`).
   - **Graph link analysis view** as a primary navigation surface for the ontology.
2. Grow the dataset to a size where the new patterns are visibly worth their dependencies: ~5,000 Flights, ~200 Pilots, ~100 Airports.
3. Preserve every existing demonstrated pattern unchanged: ChangeSet/Memento, branching, time travel, computed properties, constraints, security, integrity worker, CRDT clock, AIP stub, environment manifests.

### Non-goals

1. No production-grade scale. Target is smooth interaction at ~5k Flights on a typical laptop.
2. No graph algorithms (PageRank, shortest-path, betweenness centrality) in v1. Stretch only.
3. No write path through DuckDB. DuckDB is base-read-only; kinetic edits stay in `localStorage` exactly as today.
4. No replacement of the existing fluent JS `QueryBuilder`. The new `.sql()` method is purely additive.
5. No P2P sync, no LLM, no WebGPU. Those sub-projects stay roadmap entries (see §7).
6. No new web server, build server, or hosted infra. Static files only — same as today.

### Success criteria

- Existing AIP intents (`depart N101AA`, `pilots to LAX`, `list pilots`) still produce sensible results against the larger dataset.
- New: `query().from('Flight').sql("SELECT * FROM flights WHERE status = 'Scheduled' AND destination = 'LAX'").collect()` returns proxied flight objects with kinetic edits applied.
- New: graph view loads, renders ~5,300 nodes / ~15k edges at interactive frame rates, click selects in detail panel, hover shows tooltip.
- Time travel still works against both DuckDB-backed Flights and JSON-backed Pilots/Airports.
- Integrity worker still flags injected orphan FKs across the new dataset, with no worker code changes.

---

## 2. Architecture overview

### File map after this iteration

Additions marked with **★**.

```
ontology/
├── index.html                 (layout refactor: graph replaces flight-list panel)
├── app.js                     (wires GraphView, swaps Flight adapter to DuckDB)
├── styles.css                 (graph panel styling)
├── core/
│   ├── Ontology.js            (defineObject accepts { adapter }; load() delegates)
│   ├── BackingAdapter.js      ★ interface: load(), getRow(), allRows(), getSchema()
│   ├── JSONAdapter.js         ★ wraps existing fetch+cache logic
│   ├── DuckDBAdapter.js       ★ uses DuckDBProvider; serves rows via SQL
│   ├── DuckDBProvider.js      ★ singleton: db handle, parquet registration, query()
│   ├── QueryBuilder.js        (+ .sql(text, params) method)
│   ├── ObjectProxy.js         (unchanged)
│   ├── LinkCoordinator.js     (unchanged)
│   ├── ActionEngine.js        (unchanged)
│   ├── ConstraintEngine.js    (unchanged)
│   ├── ComputedRegistry.js    (unchanged)
│   ├── BranchManager.js       (unchanged)
│   ├── CRDTClock.js           (unchanged)
│   ├── SecurityProvider.js    (unchanged)
│   └── Agent.js               (unchanged)
├── views/                     ★ new directory
│   └── GraphView.js           ★ owns canvas, force-graph instance, selection bridge
├── store/
│   └── LocalState.js          (unchanged)
├── workers/
│   └── integrity.js           (no code change; consumes ontology.cache snapshot uniformly across adapters)
├── config/
│   └── ConfigProvider.js      (unchanged)
├── data/
│   ├── airports.json          (regenerated, 100 rows)
│   ├── pilots.json            (regenerated, 200 rows)
│   ├── flights.json           (kept as fallback / dev fast-load, 5k rows)
│   └── flights.parquet        ★ generated artifact, committed
├── tools/                     ★ new directory
│   ├── generate-data.mjs      ★ Node script: deterministic synthetic dataset
│   └── README.md              ★ regeneration instructions and pinned library versions
└── env/
    ├── dev/manifest.json      (Flight `adapter: "json"` for fast iteration)
    ├── staging/manifest.json  (Flight `adapter: "duckdb"`)
    └── prod/manifest.json     (Flight `adapter: "duckdb"`)
```

A new project-root `package.json` with one script (`"gen-data": "node tools/generate-data.mjs"`) and one devDependency (`parquetjs-lite`). `node_modules/` is git-ignored. The static-file premise at runtime is preserved — no Node, no bundler, no server.

### Boot sequence

```
1. ConfigProvider.load(env)                                  [unchanged]
2. ontology.defineObject('Airport', { adapter: 'json',   backingData, pk: 'code' })
   ontology.defineObject('Pilot',   { adapter: 'json',   backingData, pk: 'pilot_id' })
   ontology.defineObject('Flight',  { adapter: 'duckdb', backingData, pk: 'tail_number' })
                                       ↑↑↑ new field, defaults to 'json' if omitted
3. registerConstraints / registerComputed / registerActions / registerEffectHandlers
4. ontology.load()                                           ← per-type adapter.load() in parallel
       │── JSONAdapter.load(Airport)  → fetch JSON, populate cache
       │── JSONAdapter.load(Pilot)    → fetch JSON, populate cache
       └── DuckDBAdapter.load(Flight) → DuckDBProvider.init() → register flights.parquet
                                       → CREATE OR REPLACE VIEW flights AS SELECT * FROM read_parquet(...)
                                       → SELECT * to populate cache (Map keyed Flight:tail_number)
5. agent / integrityWorker / GraphView all subscribe to 'loaded' and refresh
```

### Read paths after boot

```
Ontology.get('Flight', 'N101AA')
 → adapter.getRow('N101AA')              ← cache hit (populated at load by either adapter)
 → ObjectProxy overlays kinetic edits     ← unchanged
 → returns proxy

query().from('Flight').where(p).collect()
 → JS-side filter over cache              ← unchanged

query().from('Flight').sql("SELECT * FROM flights WHERE …", params).collect()
 → DuckDBProvider.query(sql, params)
 → for each result row, look up cache via Ontology.get(type, pk)
 → returns ObjectProxy[] with kinetic overlay AND security/temporal filtering applied
```

### Key invariant

`Ontology.cache` (the `Map`) remains the single source of truth that every read pipeline consumes. **Both adapters populate it at load time.** `ObjectProxy`, computed dependency tracking, integrity scanning, and time travel are unaware of which adapter produced a row. That's what keeps every existing pattern working unchanged.

---

## 3. Subsystem 1 — DuckDB-Wasm + Parquet storage

### `core/BackingAdapter.js` — interface

```js
class BackingAdapter {
  constructor(typeName, config, ontology) { ... }
  async load()        // populates ontology.cache for this type
  getRow(id)          // sync; reads from ontology.cache
  allRows()           // sync iterator over this type's rows in cache
  getSchema()         // returns { pk, properties: [...] } — used by Ontology.getSchema()
}
```

The contract is deliberately narrow. **All adapters write into `ontology.cache` during `load()`.** The adapter exists to demonstrate *how the data got there*, not to replace the cache.

### `core/JSONAdapter.js`

Pure refactor lifting the fetch-and-populate code currently in `Ontology.load`:

```js
async load() {
  const res = await fetch(this.config.backingData);
  if (!res.ok) throw new Error(`Failed to load ${this.config.backingData}: ${res.status}`);
  const rows = await res.json();
  for (const row of rows) {
    this.ontology.cache.set(`${this.typeName}:${row[this.config.pk]}`, row);
  }
}
```

Equivalent behavior to today. `Pilot` and `Airport` use this.

### `core/DuckDBAdapter.js`

```js
async load() {
  const provider = DuckDBProvider.shared();
  await provider.init();
  await provider.registerParquet(this.tableName, this.config.backingData);
  const rows = await provider.query(`SELECT * FROM ${this.tableName}`);
  for (const row of rows) {
    this.ontology.cache.set(`${this.typeName}:${row[this.config.pk]}`, row);
  }
}
```

The cache is hydrated once at boot from a single `SELECT *`. **DuckDB stays alive after boot** — it powers `query().sql(...)`. The hydrated cache is what powers every other read.

`backingData` URL points to `data/flights.parquet` (manifest-resolvable, same mechanism as JSON paths today). `tableName` defaults to lowercase pluralized type name (`Flight` → `flights`).

### `core/DuckDBProvider.js` — singleton

Responsibilities:
- Lazy-init the DuckDB-Wasm bundle (loaded from a CDN — pinned version) on first call to `shared()`.
- `init()` is idempotent and safe to await from multiple adapters in parallel.
- `registerParquet(name, url)` fetches the file, registers it in DuckDB's virtual filesystem, then `CREATE OR REPLACE VIEW ${name} AS SELECT * FROM read_parquet('${vfsPath}')`.
- `query(sql, params=[])` executes parameterized SQL via prepared statements; returns plain row objects.
- **No string interpolation into SQL anywhere in the codebase.** Parameter binding is non-negotiable.

CDN URL is pinned (e.g., `@duckdb/duckdb-wasm@1.x` from jsDelivr). We accept the third-party load at boot in exchange for not vendoring ~30 MB of Wasm.

### `core/QueryBuilder.js` — `.sql()` escape hatch

```js
async sql(text, params = []) {
  const typeName = this._fromType;
  if (!typeName) throw new Error('.sql() requires a preceding .from(typeName)');
  const rows = await DuckDBProvider.shared().query(text, params);
  const pk = this.ontology.objectTypes.get(typeName).pk;
  return rows
    .map(r => this.ontology.get(typeName, r[pk]))    // applies security + temporal + proxy overlay
    .filter(Boolean);                                  // drops rows the security filter hides
}
```

Returns `ObjectProxy[]` so kinetic-edit overlay still applies. **A row returned by DuckDB can still be filtered out by the `viewer` role's read filter or by time-travel context, exactly like JS-side queries.** The SQL hatch does not escape from the existing security/temporal pipeline — that's a deliberate property of routing through `Ontology.get()` rather than returning raw rows.

### Integrity worker handling

`getScanPayload()` iterates `ontology.cache` exactly as today. Both adapters have already populated it. The worker is unaware of adapter type. **No worker code changes are required.**

### Synthetic data generation — `tools/generate-data.mjs`

Zero-dep Node script using `node:crypto` for deterministic seeding and `parquetjs-lite` (devDependency only) for Parquet emission. Deterministic seed so `npm run gen-data` always produces the same bytes — keeps diffs clean. Generates:

- `data/airports.json` — 100 real-airport-flavored rows (IATA-style codes, real city names, realistic `latitude`/`longitude`).
- `data/pilots.json` — 200 rows; license tiers distributed; `flight_hours` follows a long-tail distribution so the existing `experience_tier` computed property has all three tiers populated (novice / experienced / veteran).
- `data/flights.json` — 5,000 rows (kept for `dev` env quick-load via `JSONAdapter`).
- `data/flights.parquet` — same 5,000 rows in Parquet format.
- Status mix: ~60% Scheduled, ~15% InAir, ~20% Landed, ~5% Cancelled.
- Pilot/Origin/Destination FKs always reference real ids, so the integrity worker shows zero orphans on a clean dataset (the "Inject test issue" button is the demo).

`package.json`:

```json
{
  "private": true,
  "scripts": { "gen-data": "node tools/generate-data.mjs" },
  "devDependencies": { "parquetjs-lite": "^x.y.z" }
}
```

`node_modules/` is git-ignored. The runtime served by GitHub Pages is unaffected.

---

## 4. Subsystem 2 — WebGL graph view

### `views/GraphView.js`

Single module owning everything graph-related.

**Constructor:**

```js
new GraphView(canvasEl, ontology, { onSelect })
```

**Lifecycle:**

```
constructor(canvasEl, ontology, { onSelect })
  └─ stores refs; binds force-graph instance to canvasEl

mount()
  └─ ontology.on('loaded', () => this.refresh())
     ontology.on('action',  () => this.refreshLight())   // edits don't change topology
     ontology.on('undo',    () => this.refreshLight())

refresh()
  └─ rebuilds nodes + edges from scratch (handles new objects, deletes, branches)

refreshLight()
  └─ does NOT rebuild topology; only updates node colors/labels for status changes
```

**Data shape passed to `force-graph`:**

```js
{
  nodes: [
    { id: 'Flight:N101AA',  type: 'Flight',  label: 'N101AA',          color: '#4f8eff', meta: { pk: 'N101AA' } },
    { id: 'Pilot:P001',     type: 'Pilot',   label: 'Skylar Reyes',    color: '#34c759', meta: { pk: 'P001'    } },
    { id: 'Airport:LAX',    type: 'Airport', label: 'LAX',             color: '#f5a623', meta: { pk: 'LAX'     } },
    ...
  ],
  links: [
    { source: 'Flight:N101AA', target: 'Pilot:P001',   type: 'flight_pilot'      },
    { source: 'Flight:N101AA', target: 'Airport:JFK',  type: 'flight_origin'     },
    { source: 'Flight:N101AA', target: 'Airport:LAX',  type: 'flight_destination' },
    ...
  ]
}
```

Node id namespacing (`Type:pk`) prevents id collisions across types and gives a clean reverse lookup when click handlers fire.

**Edge construction** uses `LinkCoordinator`'s declared link types, but only the three forward types — `flight_pilot`, `flight_origin`, `flight_destination`. The `pilot_flights` link is the *reverse* of `flight_pilot` and would duplicate edges. ~5,000 × 3 = ~15k edges.

**Click → select bridge:**

```js
fg.onNodeClick(node => {
  this.onSelect({ type: node.type, id: node.meta.pk });
});
```

`app.js` provides the `onSelect` callback that updates `state.selection: { type, id }` (small refactor from `state.selectedFlightId`) so Pilots and Airports can also drive the detail panel.

**Hover tooltip:** delegated to `force-graph`'s built-in `nodeLabel` (an HTML string showing type + id + key fields).

**Visibility & time travel:** `refresh()` reads via `ontology.all('Flight', state.context)` (and the same for Pilot/Airport), so the time-travel slider hides nodes that wouldn't have existed at that point. Security filtering also flows through naturally because `ontology.all` already applies the role's read filter. The `viewer` role can't see Cancelled flights *in the graph* either — consistent with the rest of the UI.

### `index.html` layout refactor

The existing 3-pane grid (`flight-list | detail | audit-log`) becomes:

```html
<main class="layout">
  <section class="panel panel-graph">
    <h2>Graph <span class="hint">Click a node to select. Drag to pan.</span></h2>
    <div id="graph-canvas"></div>      <!-- force-graph mounts here -->
  </section>
  <section class="panel panel-detail">
    <div id="detail">…</div>            <!-- unchanged -->
  </section>
  <aside class="panel panel-log">
    <h2>Audit log …</h2>
    <div id="log" class="log"></div>    <!-- unchanged -->
  </aside>
</main>
```

`styles.css` updates: `.layout` grid becomes `60% 1fr 320px`; `.panel-graph` height fills viewport minus header.

The `flight-list` div, `renderFlightList()`, and the flight-list-driven selection plumbing are **deleted**. The graph is the new index.

### Detail panel — Pilot and Airport

Currently the detail panel renders only for `Flight`. With the graph clicking through to Pilots and Airports, we need minimal renderers — same shape (`merged state`, `links`, `computed`, `actions`) but smaller. The actions section is empty for Pilot/Airport (no actions are currently defined for those types). Links section iterates outgoing link types via `LinkCoordinator.outgoingFor(type)` — already type-generic. Computed iterates `ontology.computed.computedNames(typeName)` — already type-generic.

The render function generalizes to `renderObjectDetail(typeName, id)` that switches on type only for the actions block.

### Library loading

`force-graph` from CDN (e.g., `esm.sh` or `jsDelivr`, pinned version), imported in `views/GraphView.js`:

```js
import ForceGraph from 'https://esm.sh/force-graph@1.x';
```

No build step, no bundler. Same model as DuckDB-Wasm.

### Performance ceiling

At ~5,300 nodes / ~15k edges, `force-graph` will animate the layout for a few seconds at boot, then settle. We use its built-in `cooldownTicks: 100` to stop the simulation early. After cooldown, frame cost is dominated by render, which is GPU-accelerated. **No virtualization or culling needed at this scale.** Pushing to 50k+ nodes is a different design conversation (see §7).

---

## 5. Risks, off-ramps, and rollback

### Risk 1: DuckDB-Wasm boot failure

**Failure mode:** CDN unavailable, browser doesn't support required Wasm features, or `flights.parquet` 404s.

**Off-ramp:** `DuckDBAdapter.load()` catches init failure and falls back to `JSONAdapter` against `data/flights.json` (which is kept around for exactly this reason). A console warning surfaces; the UI's `manifest-badge` shows `flight·json-fallback`. The `.sql()` method becomes a no-op that throws a clear "DuckDB unavailable" error rather than silently returning stale results.

**Rollback to remove DuckDB entirely:** delete `core/DuckDBAdapter.js` + `core/DuckDBProvider.js`, change `Flight` definition back to `adapter: 'json'`, drop `.sql()` from `QueryBuilder`. Other adapters and the graph view continue working. **The Adapter abstraction is the rollback story** — that's why we built it.

### Risk 2: Performance at 5k Flights

**Failure mode:** `force-graph` layout takes too long to settle; UI feels unresponsive at first paint.

**Mitigations baked into the design:**
- `cooldownTicks: 100` on `force-graph` caps simulation work.
- Topology rebuild only on `loaded` events (not every action). Status-change events trigger `refreshLight()` which only updates node attributes.
- The DuckDB hydration `SELECT *` runs once at boot; Flight list reads are cache hits afterward.

**Off-ramp:** if the graph still struggles, render a "Loading layout…" placeholder that fades out when the simulation cools. If structurally too slow, dial dataset back to 1,000 Flights — single line change in `tools/generate-data.mjs`.

### Risk 3: Pilot/Airport detail-panel refactor scope creep

**Failure mode:** generalizing the existing Flight-specific detail render to handle Pilot and Airport balloons.

**Mitigations:**
- Refactor is mechanical — extract Flight-rendering into a generic `renderObjectDetail(typeName, id)` that switches on type only for the actions block.
- Computed-property and links rendering are already type-generic.

**Off-ramp:** if the refactor balloons, ship v1 with graph-clicks-on-Pilot/Airport showing only a minimal `{ type, id, key fields }` snippet. Skip the full computed/links/actions sections for non-Flight types. Document the limitation in a "What's next" footnote.

### Things explicitly NOT a risk

- ChangeSet / kinetic edits / branching / time travel — untouched, no regression vector.
- AIP agent / intent matching — untouched.
- Integrity worker — `getScanPayload` reads `ontology.cache` directly; adapter type is invisible to it.
- CRDT clock / multi-tab BroadcastChannel — untouched.
- Security read filtering — applies uniformly to graph view via `ontology.all(type, context)`.
- Environment manifest / role switching — `adapter` is a new field that defaults to `'json'` if missing.

The design is structured so that breaking the new code degrades to old behavior, not a broken page.

---

## 6. Testing & verification strategy

The project has no automated test suite; verification is manual via UI and console. Strategy is a **verification checklist** walked before declaring each phase done. Patterned after how the project already invites verification ("Try `branches.list()` in the console").

### Phase A — DuckDB adapter (verify before starting WebGL)

**Boot sanity:**
- `manifest-badge` reads `… · v? · …` and `console.info` shows `[duckdb] ready` once.
- `window.ontology.cache.size` ≥ 5,300 (Flight 5,000 + Pilot 200 + Airport 100).
- `Array.from(ontology.cache.keys()).filter(k => k.startsWith('Flight:')).length === 5000`.

**Adapter pattern wiring:**
- `ontology.objectTypes.get('Flight').adapter === 'duckdb'`.
- `ontology.objectTypes.get('Pilot').adapter` is `'json'` (or undefined defaulting to json).
- Switch env to `dev` (forces JSON for fast reload) → page reloads with `flight·json` in `manifest-badge` → all other behavior identical.

**`.sql()` escape hatch:**
```js
await query().from('Flight').sql(
  "SELECT * FROM flights WHERE status = 'Scheduled' AND destination = 'LAX'"
).collect()
// Returns ObjectProxy[] for Flights destined to LAX.
// Each result has .hasEdits() and computed properties working — proves they're proxies, not raw rows.
```

**Kinetic overlay survives the SQL path:**
- Dispatch `delayFlight` on a flight matched by the SQL above.
- Re-run the same SQL query.
- The result for that flight should show the *delayed* `departure_time`, not the parquet base value. Proves the proxy overlay applies post-SQL.

**Time travel still works:**
- Move time slider before a known ChangeSet.
- Both `ontology.all('Flight')` and the SQL query path should respect the temporal filter.

**Regression sweep — existing patterns:**
- `branches.create('what-if'); branches.switchTo('what-if')` → dispatch action → switch back to `main` → action invisible.
- Click "Inject test issue" → integrity panel shows orphan FK on N101AA.
- AIP intents `depart N101AA`, `pilots to LAX`, `list pilots` produce sensible results against the larger dataset.
- Switch role to `viewer` → Cancelled flights disappear from the cache view.
- Open second tab → both show same `nodeId · clk N` pair; dispatch in tab 1 → tab 2's audit log updates.

### Phase B — Graph view (verify after Phase A green)

**Render:**
- ~5,300 nodes visible. Three colors distinguishable. Edges visible. Layout settles in < 5s.
- Hover any node → tooltip shows type + id + a key field.

**Selection bridge:**
- Click a Flight node → detail panel shows that flight, identical to the old click-from-list flow.
- Click a Pilot node → detail panel shows pilot data (computed: `experience_tier`, `assigned_flight_count`, `has_active_flight`; links to flights).
- Click an Airport node → detail panel shows airport data; outgoing-flight links visible.

**Topology refresh on action:**
- Dispatch `cancelFlight` → that flight's node updates color (Cancelled status) without full layout rebuild.
- Switch to a branch with a hypothetical action → graph reflects branch state.

**Time travel:**
- Move slider backward → flights/pilots that didn't exist yet vanish from the graph.

**Layout sanity:**
- Resize window — graph canvas resizes without breaking detail panel.
- `viewer` role hides Cancelled flights from the graph too. Switching back to `admin` restores them.

**Performance:**
- During force-graph cooldown, browser stays responsive; no main-thread lockup over 200 ms.
- After cooldown, dragging nodes feels smooth (60 fps target on a typical laptop).

### What we will NOT verify

- Cross-browser compatibility beyond the implementer's primary browser. Filing a bug if Safari/Firefox breaks is fine; chasing it is out of scope.
- Mobile / touch — graph view is desktop-only for v1; the page already isn't mobile-optimized.
- Stress at 50k+ nodes. Out of scope per §1 non-goals.

---

## 7. Open questions, deferred items, future work

### Open questions for *during* implementation (do not block this spec)

1. **Exact pinned versions** of `@duckdb/duckdb-wasm` and `force-graph` from CDN. Pick latest stable at implementation time; record in `tools/README.md`.
2. **`flights.parquet` row group size.** Defaults are fine for 5k rows. Tuning is a stretch.
3. **Edge styling in the graph** — uniform thin lines vs. per-link-type color. Recommend per-link-type for visual structure; final color choices are styling-not-architecture.
4. **Detail panel for Pilot/Airport** — exact field selection and order. The mechanical refactor described in §4 covers structure; *which fields show first* is a polish call during implementation.
5. **`tools/generate-data.mjs` seed source** — fixed integer for now; `process.env.SEED` override is a one-liner if needed.

### Explicitly deferred (roadmap, not this iteration)

| Item | Where it'd go | Why deferred |
|---|---|---|
| WebRTC + Yjs P2P sync | new `core/PeerSync.js`, replaces BroadcastChannel | Highest-risk integration with branching/Memento; would always overflow a one-day budget. |
| WebGPU local LLM (WebLLM) | new `core/LocalAgent.js`, swap with `Agent.js` | Model download size, GPU detection, fallback path. Mostly additive but heavy. |
| Graph algorithms (PageRank, shortest-path) | switch to `cytoscape.js`, or add `core/GraphAnalysis.js` | Skipped per Q5 answer; v1 ships rendering only. |
| Push WHERE predicates into SQL | typed predicate API on `QueryBuilder` | `.sql()` ships the cleaner half; compiler half is deferrable. |
| Production-scale dataset (100k+) | streaming Parquet loads, dynamic graph LOD | Different design conversation. |
| Move flight list back as a slide-in drawer | `views/ListDrawer.js` | Decision was "graph IS the index"; only revisit if the graph turns out not to suffice. |
| DuckDB-Wasm in a Worker | move DuckDB out of main thread | Only matters if main-thread queries cause jank; not expected at 5k rows. |

### Documentation surface

- `index.html` footer's "What this demonstrates" `<ul>` gets two new bullets:
  - **Adapter** — explains the `BackingAdapter` interface and the JSON/DuckDB pair.
  - **Graph view** — explains `views/GraphView.js`, its event subscription, and the click→select bridge.
- `tools/README.md` covers regenerating the dataset and where the pinned library versions live.
- No separate user-facing docs file. The footer is the user-facing doc, consistent with existing project style.

---

## Decision log

Decisions made during brainstorming, recorded so the rationale survives:

| # | Decision | Why |
|---|---|---|
| 1 | Scope limited to 2 of the 4 Gemini blueprint subsystems (DuckDB-Wasm, WebGL graph) | One-day budget; WebRTC and WebGPU LLM are higher-risk and largely independent. |
| 2 | Mid-scale synthetic dataset (~5k Flights, 200 Pilots, 100 Airports) | Tiny data makes both libraries look like overkill; aspirational scale (100k+) blows the day. |
| 3 | Coexistence: Flight → DuckDB; Pilot, Airport → JSON | Demonstrates the Adapter pattern with two real implementations. |
| 4 | Edits stay in `localStorage`; DuckDB stores base rows only | Keeps every existing pattern (branching, time travel, Memento, CRDT, integrity worker) untouched. |
| 5 | `QueryBuilder` stays JS; add `.sql()` escape hatch | Smallest-delta way to expose DuckDB power; doesn't rewrite the existing builder. |
| 6 | `force-graph` (2D), no graph algorithms | Cleanest 2D link analysis; smallest integration cost; algorithms deferred to roadmap. |
| 7 | Graph replaces flight-list panel (graph IS the new index) | Honest commitment to the new view; less layout code than maintaining both. |
| 8 | All 3 object types as nodes; 3 forward link types as edges | Pilot↔Flight↔Airport links are the structural value of the ontology; rendering only Flights would be 5k disconnected dots. |
| 9 | Approach 2 ("Modular") | Matches project's "every new file teaches something" framing; line budget fits a focused day. |
