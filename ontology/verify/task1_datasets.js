// ontology/verify/task1_datasets.js
// Run AFTER the app has loaded (datasets are registered during `Ontology.load`).
import { assert, summary } from './_assert.js';

const ont = globalThis.ontology; // app.js exposes this on window for console use

assert('ontology.datasets is a Map', ont.datasets instanceof Map);
assert('Flight dataset registered',  ont.datasets.has('Flight'));
assert('Pilot dataset registered',   ont.datasets.has('Pilot'));
assert('Airport dataset registered', ont.datasets.has('Airport'));

const flight = ont.datasets.get('Flight');
assert('Dataset.pk is correct',      flight.pk === 'tail_number');
assert('Dataset.kind is raw',        flight.source.kind === 'raw');

const rows = flight.rows();
assert('Dataset.rows() returns array', Array.isArray(rows));
assert('Dataset.rows() non-empty',     rows.length > 0);

const sample = rows[0];
const oneByPk = flight.getRow(sample.tail_number);
assert('Dataset.getRow(pk) returns same row', oneByPk === sample);
assert('Dataset.getRow(missing) returns null', flight.getRow('NOPE_NOT_REAL') == null);

// Object-type registration kept its old shape and gained `dataset`.
const flightType = ont.objectTypes.get('Flight');
assert('objectType keeps adapter field', flightType.adapter === 'json' || flightType.adapter === 'duckdb');
assert('objectType has dataset binding', flightType.dataset === 'Flight');

summary();
