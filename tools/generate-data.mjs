// Pure Node (no dependencies) — emits the JSON dataset consumed by both
// the JSONAdapter (dev) and the DuckDBAdapter (staging/prod, which reads
// the same file via DuckDB-Wasm's read_json_auto). Re-runs are
// deterministic via a seeded PRNG.
//
// Usage: `node tools/generate-data.mjs`

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
];

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
  if (i <= 70)       hours = range(200, 2999);
  else if (i <= 140) hours = range(3000, 7999);
  else                hours = range(8000, 18000);
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
