// ontology/views/BuildCatalogPanel.js
// Render the build history table for one dataset. Pure DOM — no framework.

const STATUS_LABEL = { ok: 'ok', skipped: 'skipped', failed: 'failed', building: 'building' };
const STATUS_COLOR = { ok: '#15803d', skipped: '#6b7280', failed: '#b91c1c', building: '#2563eb' };

export function renderBuildCatalogPanel(container, { dataset, transform, catalog, branchList }) {
  const records = [];
  for (const branch of branchList) {
    for (const r of catalog.history(transform, branch)) records.push(r);
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
