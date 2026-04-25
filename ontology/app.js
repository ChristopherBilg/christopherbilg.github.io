import { Ontology } from './core/Ontology.js';
import { ActionEngine } from './core/ActionEngine.js';
import { Agent } from './core/Agent.js';
import { ConfigProvider } from './config/ConfigProvider.js';
import { LocalState } from './store/LocalState.js';

const ontology = new Ontology();
const actions = new ActionEngine(ontology);
let agent = null;
let config = null;

function setupOntology() {
  ontology.defineObject('Airport', { backingData: config.resolveDataSource('Airport'), pk: 'code' });
  ontology.defineObject('Pilot',   { backingData: config.resolveDataSource('Pilot'),   pk: 'pilot_id' });
  ontology.defineObject('Flight',  { backingData: config.resolveDataSource('Flight'),  pk: 'tail_number' });

  ontology.links.define('flight_pilot',       { source: 'Flight', target: 'Pilot',   fk: 'pilot_id' });
  ontology.links.define('flight_origin',      { source: 'Flight', target: 'Airport', fk: 'origin' });
  ontology.links.define('flight_destination', { source: 'Flight', target: 'Airport', fk: 'destination' });
  ontology.links.define('pilot_flights',      { source: 'Pilot',  target: 'Flight',  fk: 'pilot_id', direction: 'reverse' });
}

const FLIGHT_STATES = {
  Scheduled: { next: ['InAir', 'Cancelled'] },
  InAir:     { next: ['Landed'] },
  Landed:    { next: [] },
  Cancelled: { next: [] },
};

function canTransition(from, to) {
  return FLIGHT_STATES[from]?.next.includes(to) ?? false;
}

function registerActions() {
  const f = config.features();

  actions.define('departFlight', {
    objectType: 'Flight',
    idParam: 'flightId',
    description: 'Transition a Scheduled flight to InAir.',
    params: { flightId: { type: 'string', description: 'tail_number of the Flight' } },
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
    description: 'Transition an InAir flight to Landed.',
    params: { flightId: { type: 'string', description: 'tail_number of the Flight' } },
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
      description: 'Mark a Scheduled flight as Cancelled with a required reason.',
      params: {
        flightId: { type: 'string', description: 'tail_number of the Flight' },
        reason:   { type: 'string', description: 'why the flight is being cancelled' },
      },
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
      description: 'Reassign the pilot of a Scheduled flight.',
      params: {
        flightId:   { type: 'string', description: 'tail_number of the Flight' },
        newPilotId: { type: 'string', description: 'pilot_id of the replacement pilot' },
      },
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
      description: 'Push back the departure time of a Scheduled flight.',
      params: {
        flightId: { type: 'string', description: 'tail_number of the Flight' },
        minutes:  { type: 'number', description: 'minutes to add to departure_time' },
      },
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

const ACTION_VERBS = {
  departFlight: 'Flight departed',
  landFlight: 'Flight landed',
  cancelFlight: 'Flight cancelled',
  reassignPilot: 'Pilot reassigned',
  delayFlight: 'Flight delayed',
};

function notify(msg, kind = 'info') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

function registerEffectHandlers() {
  actions.use((cs) => {
    console.info('[ontology:action]', cs.action, cs.changes);
  });

  actions.use((cs) => {
    const verb = ACTION_VERBS[cs.action] || cs.action;
    notify(`${verb} · ${cs.objectType}:${cs.objectId}`);
  });
}

const TIME_PRESETS = [
  { label: 'Now',         value: null },
  { label: '2026-04-22',  value: '2026-04-22T00:00:00Z' },
  { label: '2026-04-15',  value: '2026-04-15T00:00:00Z' },
  { label: '2026-01-15',  value: '2026-01-15T00:00:00Z' },
  { label: '2026-01-01',  value: '2026-01-01T00:00:00Z' },
];

const state = {
  selectedFlightId: null,
  lastError: null,
  context: null,
  aipResult: null,
  aipShowSchema: false,
  integrity: { findings: [], scannedAt: null, scanning: false },
};

let integrityWorker = null;

const $flightList = document.getElementById('flight-list');
const $detail = document.getElementById('detail');
const $log = document.getElementById('log');
const $manifestBadge = document.getElementById('manifest-badge');
const $resetBtn = document.getElementById('reset-btn');
const $txInput = document.getElementById('tx-input');
const $txNow = document.getElementById('tx-now');
const $txBadge = document.getElementById('tx-badge');
const $txPresets = document.getElementById('tx-presets');
const $aipPrompt = document.getElementById('aip-prompt');
const $aipAsk = document.getElementById('aip-ask');
const $aipSchemaToggle = document.getElementById('aip-schema-toggle');
const $aipExamples = document.getElementById('aip-examples');
const $aipOutput = document.getElementById('aip-output');
const $aipSchema = document.getElementById('aip-schema');
const $integrityBadge = document.getElementById('integrity-badge');
const $integrityFindings = document.getElementById('integrity-findings');
const $integrityRescan = document.getElementById('integrity-rescan');
const $integrityInject = document.getElementById('integrity-inject');

$resetBtn.addEventListener('click', () => {
  if (!confirm('Clear all kinetic edits from localStorage?')) return;
  LocalState.clear();
  state.lastError = null;
  ontology.emit('undo', null);
});

function setContextFromIso(iso) {
  if (!iso) {
    state.context = null;
    $txInput.value = '';
  } else {
    state.context = { asOfTx: iso, asOfValid: iso };
    $txInput.value = isoToLocalInput(iso);
  }
  state.lastError = null;
  render();
}

function isoToLocalInput(iso) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

$txInput.addEventListener('change', () => {
  if (!$txInput.value) {
    setContextFromIso(null);
  } else {
    const iso = new Date($txInput.value).toISOString();
    state.context = { asOfTx: iso, asOfValid: iso };
    state.lastError = null;
    render();
  }
});

$txNow.addEventListener('click', () => setContextFromIso(null));

function renderTxPresets() {
  $txPresets.innerHTML = TIME_PRESETS.map(
    (p, i) => `<button class="btn btn-ghost btn-tiny" data-preset="${i}">${escapeHtml(p.label)}</button>`,
  ).join('');
  $txPresets.querySelectorAll('[data-preset]').forEach((el) => {
    el.addEventListener('click', () => {
      const preset = TIME_PRESETS[Number(el.dataset.preset)];
      setContextFromIso(preset.value);
    });
  });
}

$aipAsk.addEventListener('click', () => askAgent($aipPrompt.value));
$aipPrompt.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    askAgent($aipPrompt.value);
  }
});
$aipSchemaToggle.addEventListener('click', () => {
  state.aipShowSchema = !state.aipShowSchema;
  renderAip();
});

$integrityRescan.addEventListener('click', () => requestIntegrityScan());

$integrityInject.addEventListener('click', () => {
  LocalState.appendChangeSet({
    id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    action: '__test_orphan',
    objectType: 'Flight',
    objectId: 'N101AA',
    params: { flightId: 'N101AA' },
    changes: { pilot_id: 'P999_BOGUS' },
    created_at: new Date().toISOString(),
    valid_from: new Date().toISOString(),
  });
  ontology.emit('action', null);
  notify('Injected orphan FK on N101AA', 'warn');
});

function startIntegrityWorker() {
  try {
    integrityWorker = new Worker('./workers/integrity.js', { type: 'module' });
    integrityWorker.addEventListener('message', (ev) => {
      if (ev.data?.type === 'findings') {
        state.integrity = {
          findings: ev.data.findings,
          scannedAt: ev.data.scannedAt,
          scanning: false,
        };
        renderIntegrity();
      }
    });
    integrityWorker.addEventListener('error', (err) => {
      console.warn('[integrity] worker error:', err.message);
      state.integrity = {
        findings: [],
        scannedAt: null,
        scanning: false,
        error: err.message,
      };
      renderIntegrity();
    });
  } catch (err) {
    console.warn('[integrity] worker unavailable:', err.message);
    integrityWorker = null;
  }
}

function getScanPayload() {
  const objects = {};
  for (const [name, cfg] of ontology.objectTypes) {
    const rows = [];
    const prefix = `${name}:`;
    for (const [key, row] of ontology.cache) {
      if (key.startsWith(prefix)) rows.push(row);
    }
    objects[name] = { pk: cfg.pk, rows };
  }
  return {
    objects,
    links: ontology.links.getSchema(),
    changesets: actions.history(),
  };
}

function requestIntegrityScan() {
  if (!integrityWorker || !ontology.loaded) return;
  state.integrity.scanning = true;
  renderIntegrity();
  integrityWorker.postMessage({ type: 'scan', payload: getScanPayload() });
}

function renderIntegrity() {
  if (!$integrityBadge) return;
  const { findings, scannedAt, scanning, error } = state.integrity;

  if (error) {
    $integrityBadge.textContent = `worker error`;
    $integrityBadge.classList.add('badge-warn');
    $integrityFindings.innerHTML = `<div class="error">${escapeHtml(error)}</div>`;
    return;
  }
  if (scanning) {
    $integrityBadge.textContent = 'scanning…';
    $integrityBadge.classList.remove('badge-warn');
    return;
  }
  if (!scannedAt) {
    $integrityBadge.textContent = 'awaiting scan…';
    $integrityBadge.classList.remove('badge-warn');
    $integrityFindings.innerHTML = '';
    return;
  }

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warnCount = findings.filter((f) => f.severity === 'warn').length;

  if (findings.length === 0) {
    $integrityBadge.textContent = `clean · scanned ${formatDate(scannedAt)}`;
    $integrityBadge.classList.remove('badge-warn');
    $integrityFindings.innerHTML = '<div class="hint">No issues detected.</div>';
    return;
  }

  $integrityBadge.textContent = `${errorCount} error${errorCount === 1 ? '' : 's'} · ${warnCount} warn${warnCount === 1 ? '' : 's'} · scanned ${formatDate(scannedAt)}`;
  $integrityBadge.classList.add('badge-warn');

  $integrityFindings.innerHTML = findings
    .map(
      (f) => `
    <div class="finding finding-${escapeHtml(f.severity)}">
      <div class="finding-head">
        <span class="finding-severity">${escapeHtml(f.severity)}</span>
        <span class="finding-type">${escapeHtml(f.type)}</span>
      </div>
      <div class="finding-message">${escapeHtml(f.message)}</div>
    </div>
  `,
    )
    .join('');
}

function askAgent(prompt) {
  if (!agent) return;
  const result = agent.ask(prompt);
  state.aipResult = { prompt, result };
  renderAip();
}

function renderAipExamples() {
  if (!agent) return;
  const examples = agent.examples();
  $aipExamples.innerHTML = examples
    .map((ex) => `<button class="btn btn-ghost btn-tiny" data-example="${escapeHtml(ex)}">${escapeHtml(ex)}</button>`)
    .join('');
  $aipExamples.querySelectorAll('[data-example]').forEach((el) => {
    el.addEventListener('click', () => {
      $aipPrompt.value = el.dataset.example;
      askAgent(el.dataset.example);
    });
  });
}

function renderAip() {
  if (!agent) {
    $aipOutput.innerHTML = '<div class="hint">Loading…</div>';
    return;
  }

  if (!state.aipResult) {
    $aipOutput.innerHTML = '<div class="hint">Type a phrase or click an example above. The agent matches your prompt against an intent table, then dispatches a typed Action through the same pipeline as the UI buttons.</div>';
  } else {
    const { prompt, result } = state.aipResult;
    if (result.error) {
      $aipOutput.innerHTML = `
        <div class="aip-trace">
          <div class="aip-trace-line"><span class="aip-arrow">→</span> ${escapeHtml(prompt)}</div>
          <div class="aip-trace-line aip-error"><span class="aip-arrow">✗</span> ${escapeHtml(result.error)}</div>
        </div>`;
    } else if (result.kind === 'read') {
      $aipOutput.innerHTML = `
        <div class="aip-trace">
          <div class="aip-trace-line"><span class="aip-arrow">→</span> ${escapeHtml(prompt)}</div>
          <div class="aip-trace-line"><span class="aip-arrow">✓</span> matched intent <code>${escapeHtml(result.intent)}</code> · read query</div>
          <pre class="aip-payload">${escapeHtml(JSON.stringify(result.result, null, 2))}</pre>
        </div>`;
    } else {
      $aipOutput.innerHTML = `
        <div class="aip-trace">
          <div class="aip-trace-line"><span class="aip-arrow">→</span> ${escapeHtml(prompt)}</div>
          <div class="aip-trace-line"><span class="aip-arrow">✓</span> matched intent <code>${escapeHtml(result.intent)}</code> · dispatched <code>${escapeHtml(result.action)}</code></div>
          <pre class="aip-payload">${escapeHtml(JSON.stringify(result.result, null, 2))}</pre>
        </div>`;
    }
  }

  if (state.aipShowSchema) {
    $aipSchema.hidden = false;
    $aipSchema.textContent = JSON.stringify(agent.getSchema(), null, 2);
    $aipSchemaToggle.textContent = 'Hide schema';
  } else {
    $aipSchema.hidden = true;
    $aipSchemaToggle.textContent = 'View schema';
  }
}

function isReadOnly() {
  return state.context !== null;
}

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
  const flights = ontology.all('Flight', state.context);
  flights.sort((a, b) => a.tail_number.localeCompare(b.tail_number));

  if (!flights.length) {
    $flightList.innerHTML = '<div class="hint">No flights existed at this point in time.</div>';
    return;
  }

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

  const flight = ontology.get('Flight', state.selectedFlightId, state.context);
  if (!flight) {
    $detail.innerHTML = '<div class="empty">Selected flight does not exist at this point in time.</div>';
    return;
  }

  const pilot = flight.links('flight_pilot')[0];
  const origin = flight.links('flight_origin')[0];
  const destination = flight.links('flight_destination')[0];
  const edits = ontology.getEdits('Flight', flight.id, state.context);

  let actionsHtml;
  if (isReadOnly()) {
    actionsHtml = '<div class="hint">Time-travel view is read-only. Click <strong>Now</strong> to re-enable actions.</div>';
  } else {
    const available = actions.availableFor(flight);
    const allPilots = ontology.all('Pilot');
    actionsHtml = available.length
      ? available.map((a) => renderActionRow(flight, a, allPilots)).join('')
      : '<div class="hint">No actions available in current state.</div>';
  }

  const linksHtml = `
    <div class="link-row">
      <div>
        <div class="type">flight_pilot</div>
        ${pilot ? `${escapeHtml(pilot.name)} <span class="hint">(${escapeHtml(pilot.pilot_id)} · ${escapeHtml(pilot.license_level)} · ${pilot.flight_hours.toLocaleString()} hrs)</span>` : '<span class="hint">unassigned at this point in time</span>'}
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
      <div class="sub">Flight · created ${escapeHtml(formatDate(flight.created_at))} · ${edits.length} kinetic edit${edits.length === 1 ? '' : 's'}</div>

      <div class="detail-section">
        <h4>Merged state</h4>
        <dl class="kv">
          <dt>status</dt>         <dd><span class="status status-${escapeHtml(flight.status)}">${escapeHtml(flight.status)}</span></dd>
          <dt>departure_time</dt> <dd>${escapeHtml(formatDate(flight.departure_time))}</dd>
          <dt>pilot_id</dt>       <dd>${escapeHtml(flight.pilot_id ?? '—')}</dd>
          <dt>origin</dt>         <dd>${escapeHtml(flight.origin)}</dd>
          <dt>destination</dt>    <dd>${escapeHtml(flight.destination)}</dd>
          <dt>created_at</dt>     <dd>${escapeHtml(formatDate(flight.created_at))}</dd>
          <dt>valid_from</dt>     <dd>${escapeHtml(formatDate(flight.valid_from))}</dd>
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

function renderActionRow(flight, { name }, pilots) {
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
  let history = actions.history();
  if (state.context) {
    history = history.filter((cs) => {
      if (state.context.asOfTx && cs.created_at > state.context.asOfTx) return false;
      if (state.context.asOfValid && cs.valid_from > state.context.asOfValid) return false;
      return true;
    });
  }
  history = history.slice().reverse();

  if (!history.length) {
    $log.innerHTML = '<div class="hint">No actions visible at this point in time.</div>';
    return;
  }
  const undoVisible = !isReadOnly();
  $log.innerHTML = history
    .map(
      (cs) => `
    <div class="log-item">
      <div class="head">
        <span class="action-name">${escapeHtml(cs.action)}</span>
        ${undoVisible ? `<button class="btn undo-btn" data-undo="${escapeHtml(cs.id)}">undo</button>` : ''}
      </div>
      <div class="target">${escapeHtml(cs.objectType)}:${escapeHtml(cs.objectId)} · tx ${escapeHtml(formatDate(cs.created_at))}${cs.valid_from && cs.valid_from !== cs.created_at ? ` · valid ${escapeHtml(formatDate(cs.valid_from))}` : ''}</div>
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
  const meta = config.meta();
  const features = config.features();
  const enabled = Object.entries(features).filter(([, v]) => v).map(([k]) => k).join(', ');
  $manifestBadge.textContent = `${meta.env} · v${meta.version ?? '?'} · ${enabled || 'no features'}`;
}

function renderEnvSwitcher() {
  const $envSelect = document.getElementById('env-select');
  if (!$envSelect) return;
  $envSelect.innerHTML = ConfigProvider.knownEnvs()
    .map((e) => `<option value="${e}"${e === config.env ? ' selected' : ''}>${e}</option>`)
    .join('');
  $envSelect.addEventListener('change', () => config.switchTo($envSelect.value));
}

function renderTxBadge() {
  if (!state.context) {
    $txBadge.textContent = 'live';
    $txBadge.classList.remove('badge-warn');
  } else {
    $txBadge.textContent = `as of ${formatDate(state.context.asOfTx)}`;
    $txBadge.classList.add('badge-warn');
  }
}

function render() {
  renderTxBadge();
  renderFlightList();
  renderDetail();
  renderLog();
  renderAip();
}

ontology.on('loaded', render);
ontology.on('action', render);
ontology.on('undo', render);
ontology.on('loaded', requestIntegrityScan);
ontology.on('action', requestIntegrityScan);
ontology.on('undo', requestIntegrityScan);

(async function main() {
  config = new ConfigProvider();
  await config.load();
  renderManifestBadge();
  renderEnvSwitcher();
  renderTxPresets();
  setupOntology();
  registerActions();
  registerEffectHandlers();
  startIntegrityWorker();
  await ontology.load();
  agent = new Agent(ontology, actions);
  renderAipExamples();
  renderAip();
  renderIntegrity();
})();

window.ontology = ontology;
window.actions = actions;
window.links = ontology.links;
window.appState = state;
Object.defineProperty(window, 'agent', { get: () => agent });
Object.defineProperty(window, 'config', { get: () => config });
