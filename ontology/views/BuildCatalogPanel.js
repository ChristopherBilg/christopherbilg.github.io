// ontology/views/BuildCatalogPanel.js
// Render the build history table for one dataset. Pure DOM — no framework.

import { attachColumnLineagePopover } from './ColumnLineagePopover.js';

const STATUS_LABEL = { ok: 'ok', skipped: 'skipped', failed: 'failed', building: 'building' };
const STATUS_COLOR = { ok: '#15803d', skipped: '#6b7280', failed: '#b91c1c', building: '#2563eb' };

export function renderBuildCatalogPanel(container, { dataset, transform, catalog, branchList, asOfTx = null, rows = [], transformSpec = null }) {
  // Sweep any orphaned popover tooltips left over from a previous render
  // mid-hover (a build event fires while hovering an ⓘ — the icon dies
  // with the panel's innerHTML rewrite but the body-attached tooltip
  // survives). Cheap defensive sweep on every panel render.
  document.querySelectorAll('.lineage-tooltip').forEach((el) => el.remove());
  const records = [];
  for (const branch of branchList) {
    for (const r of catalog.history(transform, branch)) {
      if (asOfTx && r.startedAt > asOfTx) continue;
      records.push(r);
    }
  }
  records.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  const html = `
    <div class="catalog-header">
      <h3>Build catalog · ${escapeHtml(dataset)}</h3>
      <div class="hint">Transform: <code>${escapeHtml(transform)}</code></div>
    </div>
    ${records.length === 0
      ? '<div class="empty">No builds yet — click <strong>Build</strong> in the topbar.</div>'
      : `
        <table class="catalog-table">
          <thead>
            <tr>
              <th>Build</th><th>Branch</th><th>Started</th>
              <th>Duration</th><th>Status</th><th>Rows</th>
              <th>asOfTx</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${records.map(rowHtml).join('')}
          </tbody>
        </table>
      `}
  `;
  container.innerHTML = html;
  if (rows && rows.length) {
    container.appendChild(renderRowsPreview(rows, transformSpec));
  }
}

function renderRowsPreview(rows, spec) {
  const wrap = document.createElement('div');
  wrap.className = 'rows-preview';
  const cols = Object.keys(rows[0]);
  const table = document.createElement('table');
  table.className = 'catalog-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const col of cols) {
    const th = document.createElement('th');
    th.textContent = col;
    if (spec) attachColumnLineagePopover(th, { outputCol: col, refs: spec.lineage?.[col] });
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const row of rows.slice(0, 50)) {
    const tr = document.createElement('tr');
    for (const col of cols) {
      const td = document.createElement('td');
      td.textContent = row[col] == null ? '' : String(row[col]);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function rowHtml(r) {
  const note = r.status === 'skipped' ? (r.skippedReason || '')
             : r.status === 'failed'  ? (r.error || '')
             : '';
  return `
    <tr>
      <td><code>${escapeHtml(r.id)}</code></td>
      <td>${escapeHtml(r.branch)}</td>
      <td>${escapeHtml(r.startedAt?.slice(11, 19) || '—')}</td>
      <td>${r.durationMs ? r.durationMs + 'ms' : '—'}</td>
      <td style="color:${STATUS_COLOR[r.status] || '#000'}"><strong>${STATUS_LABEL[r.status] || r.status}</strong></td>
      <td>${r.rowCount ?? '—'}</td>
      <td>${escapeHtml(r.asOfTx || 'live')}</td>
      <td>${escapeHtml(note)}</td>
    </tr>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}
