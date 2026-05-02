// ontology/views/ColumnLineagePopover.js

export function attachColumnLineagePopover(thEl, { outputCol, refs }) {
  thEl.classList.add('has-lineage-info');

  const icon = document.createElement('span');
  icon.className = 'lineage-info-icon';
  icon.textContent = ' ⓘ';
  thEl.appendChild(icon);

  let tooltip = null;
  icon.addEventListener('mouseenter', () => {
    tooltip = document.createElement('div');
    tooltip.className = 'lineage-tooltip';
    tooltip.innerHTML = refs && refs.length
      ? `<strong>${escapeHtml(outputCol)}</strong> ← ${refs.map(escapeHtml).join(', ')}`
      : `<strong>${escapeHtml(outputCol)}</strong> ← <em>(not declared)</em>`;
    document.body.appendChild(tooltip);
    const r = icon.getBoundingClientRect();
    tooltip.style.left = `${r.left + window.scrollX}px`;
    tooltip.style.top  = `${r.bottom + window.scrollY + 4}px`;
  });
  icon.addEventListener('mouseleave', () => {
    tooltip?.remove();
    tooltip = null;
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}
