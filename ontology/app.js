import { Ontology } from './core/Ontology.js';
import { ActionEngine } from './core/ActionEngine.js';
import { LocalState } from './store/LocalState.js';

const ontology = new Ontology();
const actions = new ActionEngine(ontology);

ontology.defineObject('Airport', {
  backingData: './data/airports.json',
  pk: 'code',
});

ontology.defineObject('Pilot', {
  backingData: './data/pilots.json',
  pk: 'pilot_id',
});

ontology.defineObject('Flight', {
  backingData: './data/flights.json',
  pk: 'tail_number',
});

ontology.defineLink('flight_pilot',       { source: 'Flight', target: 'Pilot',   fk: 'pilot_id' });
ontology.defineLink('flight_origin',      { source: 'Flight', target: 'Airport', fk: 'origin' });
ontology.defineLink('flight_destination', { source: 'Flight', target: 'Airport', fk: 'destination' });
ontology.defineLink('pilot_flights',      { source: 'Pilot',  target: 'Flight',  fk: 'pilot_id', direction: 'reverse' });

const FLIGHT_STATES = {
  Scheduled: { next: ['InAir', 'Cancelled'] },
  InAir:     { next: ['Landed'] },
  Landed:    { next: [] },
  Cancelled: { next: [] },
};

function canTransition(from, to) {
  return FLIGHT_STATES[from]?.next.includes(to) ?? false;
}

let manifest = { features: {} };

async function loadManifest() {
  try {
    const res = await fetch('./manifest.json');
    manifest = await res.json();
  } catch {
    manifest = { version: 'unknown', environment: 'unknown', features: {} };
  }
}

function registerActions() {
  const f = manifest.features || {};

  actions.define('departFlight', {
    objectType: 'Flight',
    idParam: 'flightId',
    availableWhen: (flight) => flight.status === 'Scheduled',
    validate: (flight) => {
      if (!canTransition(flight.status, 'InAir')) {
        return `Cannot depart a flight in state "${flight.status}"`;
      }
      return null;
    },
    apply: () => ({ status: 'InAir' }),
  });

  actions.define('landFlight', {
    objectType: 'Flight',
    idParam: 'flightId',
    availableWhen: (flight) => flight.status === 'InAir',
    validate: (flight) => {
      if (!canTransition(flight.status, 'Landed')) {
        return `Cannot land a flight in state "${flight.status}"`;
      }
      return null;
    },
    apply: () => ({ status: 'Landed' }),
  });

  if (f.allowCancellation) {
    actions.define('cancelFlight', {
      objectType: 'Flight',
      idParam: 'flightId',
      availableWhen: (flight) => flight.status === 'Scheduled',
      validate: (flight, params) => {
        if (!canTransition(flight.status, 'Cancelled')) {
          return `Cannot cancel a flight in state "${flight.status}"`;
        }
        if (!params.reason || !params.reason.trim()) {
          return 'Cancellation reason is required';
        }
        return null;
      },
      apply: (_flight, params) => ({
        status: 'Cancelled',
        cancellation_reason: params.reason.trim(),
      }),
    });
  }

  if (f.allowPilotReassignment) {
    actions.define('reassignPilot', {
      objectType: 'Flight',
      idParam: 'flightId',
      availableWhen: (flight) => flight.status === 'Scheduled',
      validate: (flight, params, ont) => {
        if (flight.status !== 'Scheduled') {
          return 'Pilots can only be reassigned on Scheduled flights';
        }
        if (!params.newPilotId) return 'newPilotId is required';
        if (params.newPilotId === flight.pilot_id) {
          return 'Selected pilot is already assigned';
        }
        const pilot = ont.get('Pilot', params.newPilotId);
        if (!pilot) return `Pilot "${params.newPilotId}" does not exist`;
        return null;
      },
      apply: (_flight, params) => ({ pilot_id: params.newPilotId }),
    });
  }

  if (f.allowDelay) {
    actions.define('delayFlight', {
      objectType: 'Flight',
      idParam: 'flightId',
      availableWhen: (flight) => flight.status === 'Scheduled',
      validate: (flight, params) => {
        const m = Number(params.minutes);
        if (!Number.isFinite(m) || m <= 0) return 'Delay must be a positive number of minutes';
        if (flight.status !== 'Scheduled') return 'Can only delay Scheduled flights';
        return null;
      },
      apply: (flight, params) => {
        const minutes = Number(params.minutes);
        const base = new Date(flight.departure_time);
        const next = new Date(base.getTime() + minutes * 60_000);
        return { departure_time: next.toISOString() };
      },
    });
  }
}

const state = {
  selectedFlightId: null,
  lastError: null,
};

const $flightList = document.getElementById('flight-list');
const $detail = document.getElementById('detail');
const $log = document.getElementById('log');
const $manifestBadge = document.getElementById('manifest-badge');
const $resetBtn = document.getElementById('reset-btn');

$resetBtn.addEventListener('click', () => {
  if (!confirm('Clear all kinetic edits from localStorage?')) return;
  LocalState.clear();
  state.lastError = null;
  ontology.emit('undo', null);
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
}

function renderFlightList() {
  const flights = ontology.all('Flight');
  flights.sort((a, b) => a.tail_number.localeCompare(b.tail_number));

  $flightList.innerHTML = flights
    .map((f) => {
      const selected = f.id === state.selectedFlightId ? ' selected' : '';
      const edited = f.hasEdits() ? '<span class="edit-flag">kinetic</span>' : '';
      return `
        <div class="card${selected}" data-tail="${escapeHtml(f.id)}">
          <div class="card-head">
            <span class="tail">${escapeHtml(f.tail_number)}</span>
            <span class="status status-${escapeHtml(f.status)}">${escapeHtml(f.status)}</span>
          </div>
          <div class="card-head">
            <span class="route">${escapeHtml(f.origin)} → ${escapeHtml(f.destination)}</span>
            ${edited}
          </div>
        </div>
      `;
    })
    .join('');

  $flightList.querySelectorAll('.card').forEach((el) => {
    el.addEventListener('click', () => {
      state.selectedFlightId = el.dataset.tail;
      state.lastError = null;
      render();
    });
  });
}

function renderDetail() {
  if (!state.selectedFlightId) {
    $detail.innerHTML = '<div class="empty">Select a flight to see its merged state, links, and available actions.</div>';
    return;
  }

  const flight = ontology.get('Flight', state.selectedFlightId);
  if (!flight) {
    $detail.innerHTML = '<div class="empty">Flight not found.</div>';
    return;
  }

  const pilot = flight.links('flight_pilot')[0];
  const origin = flight.links('flight_origin')[0];
  const destination = flight.links('flight_destination')[0];
  const available = actions.availableFor(flight);
  const edits = ontology.getEdits('Flight', flight.id);

  const allPilots = ontology.all('Pilot');

  const actionsHtml = available.length
    ? available.map((a) => renderActionRow(flight, a, allPilots)).join('')
    : '<div class="hint">No actions available in current state.</div>';

  const linksHtml = `
    <div class="link-row">
      <div>
        <div class="type">flight_pilot</div>
        ${pilot ? `${escapeHtml(pilot.name)} <span class="hint">(${escapeHtml(pilot.pilot_id)} · ${escapeHtml(pilot.license_level)} · ${pilot.flight_hours.toLocaleString()} hrs)</span>` : '<span class="hint">unassigned</span>'}
      </div>
    </div>
    <div class="link-row">
      <div>
        <div class="type">flight_origin</div>
        ${origin ? `${escapeHtml(origin.name)} <span class="hint">(${escapeHtml(origin.code)} · ${escapeHtml(origin.city)})</span>` : '<span class="hint">unknown</span>'}
      </div>
    </div>
    <div class="link-row">
      <div>
        <div class="type">flight_destination</div>
        ${destination ? `${escapeHtml(destination.name)} <span class="hint">(${escapeHtml(destination.code)} · ${escapeHtml(destination.city)})</span>` : '<span class="hint">unknown</span>'}
      </div>
    </div>
  `;

  $detail.innerHTML = `
    <div class="detail">
      <h3>${escapeHtml(flight.tail_number)} — ${escapeHtml(flight.origin)} → ${escapeHtml(flight.destination)}</h3>
      <div class="sub">Flight · base + ${edits.length} kinetic edit${edits.length === 1 ? '' : 's'}</div>

      <div class="detail-section">
        <h4>Merged state</h4>
        <dl class="kv">
          <dt>status</dt>         <dd><span class="status status-${escapeHtml(flight.status)}">${escapeHtml(flight.status)}</span></dd>
          <dt>departure_time</dt> <dd>${escapeHtml(formatDate(flight.departure_time))}</dd>
          <dt>pilot_id</dt>       <dd>${escapeHtml(flight.pilot_id ?? '—')}</dd>
          <dt>origin</dt>         <dd>${escapeHtml(flight.origin)}</dd>
          <dt>destination</dt>    <dd>${escapeHtml(flight.destination)}</dd>
          ${flight.cancellation_reason ? `<dt>cancellation_reason</dt><dd>${escapeHtml(flight.cancellation_reason)}</dd>` : ''}
        </dl>
      </div>

      <div class="detail-section">
        <h4>Links</h4>
        ${linksHtml}
      </div>

      <div class="detail-section">
        <h4>Actions</h4>
        <div class="actions">${actionsHtml}</div>
        ${state.lastError ? `<div class="error">${escapeHtml(state.lastError)}</div>` : ''}
      </div>
    </div>
  `;

  $detail.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      const actionName = el.dataset.action;
      const form = el.closest('.action-row');
      const params = { flightId: flight.id };
      form.querySelectorAll('[data-param]').forEach((input) => {
        params[input.dataset.param] = input.value;
      });
      try {
        actions.dispatch(actionName, params);
        state.lastError = null;
      } catch (err) {
        state.lastError = err.message;
        render();
      }
    });
  });
}

function renderActionRow(flight, { name, spec }, pilots) {
  switch (name) {
    case 'departFlight':
      return `<div class="action-row">
        <button class="btn btn-primary" data-action="departFlight">Depart flight</button>
        <span class="hint">Scheduled → InAir</span>
      </div>`;
    case 'landFlight':
      return `<div class="action-row">
        <button class="btn btn-primary" data-action="landFlight">Land flight</button>
        <span class="hint">InAir → Landed</span>
      </div>`;
    case 'cancelFlight':
      return `<div class="action-row">
        <input type="text" data-param="reason" placeholder="Cancellation reason" />
        <button class="btn btn-danger" data-action="cancelFlight">Cancel flight</button>
      </div>`;
    case 'reassignPilot': {
      const options = pilots
        .filter((p) => p.pilot_id !== flight.pilot_id)
        .map((p) => `<option value="${escapeHtml(p.pilot_id)}">${escapeHtml(p.name)} (${escapeHtml(p.pilot_id)})</option>`)
        .join('');
      return `<div class="action-row">
        <select data-param="newPilotId">${options}</select>
        <button class="btn" data-action="reassignPilot">Reassign pilot</button>
      </div>`;
    }
    case 'delayFlight':
      return `<div class="action-row">
        <input type="number" data-param="minutes" placeholder="Minutes" min="1" value="30" style="width:100px" />
        <button class="btn" data-action="delayFlight">Delay</button>
      </div>`;
    default:
      return `<div class="action-row">
        <button class="btn" data-action="${escapeHtml(name)}">${escapeHtml(name)}</button>
      </div>`;
  }
}

function renderLog() {
  const history = actions.history().slice().reverse();
  if (!history.length) {
    $log.innerHTML = '<div class="hint">No actions dispatched yet.</div>';
    return;
  }
  $log.innerHTML = history
    .map(
      (cs) => `
    <div class="log-item">
      <div class="head">
        <span class="action-name">${escapeHtml(cs.action)}</span>
        <button class="btn undo-btn" data-undo="${escapeHtml(cs.id)}">undo</button>
      </div>
      <div class="target">${escapeHtml(cs.objectType)}:${escapeHtml(cs.objectId)} · ${escapeHtml(formatDate(cs.timestamp))}</div>
      <div class="changes">${escapeHtml(JSON.stringify(cs.changes, null, 2))}</div>
    </div>
  `,
    )
    .join('');

  $log.querySelectorAll('[data-undo]').forEach((el) => {
    el.addEventListener('click', () => {
      actions.undo(el.dataset.undo);
    });
  });
}

function renderManifestBadge() {
  const { version, environment, features } = manifest;
  const enabled = Object.entries(features || {})
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ');
  $manifestBadge.textContent = `v${version ?? '?'} · ${environment ?? '?'} · ${enabled || 'no features'}`;
}

function render() {
  renderFlightList();
  renderDetail();
  renderLog();
}

ontology.on('loaded', render);
ontology.on('action', render);
ontology.on('undo', render);

(async function main() {
  await loadManifest();
  renderManifestBadge();
  registerActions();
  await ontology.load();
})();

window.ontology = ontology;
window.actions = actions;
