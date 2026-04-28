const BUTTON_META = {
  departFlight:   { label: 'Depart flight', className: 'btn btn-primary' },
  landFlight:     { label: 'Land flight',   className: 'btn btn-primary' },
  cancelFlight:   { label: 'Cancel flight', className: 'btn btn-danger'  },
  reassignPilot:  { label: 'Reassign pilot', className: 'btn'            },
  delayFlight:    { label: 'Delay',          className: 'btn'            },
};

function humanize(actionName) {
  return actionName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildRefOption(obj) {
  const label = obj.name ?? obj.code ?? obj.id;
  const value = obj.id;
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)} (${escapeHtml(value)})</option>`;
}

function buildInputHtml(name, paramSpec, ontology, getContext) {
  const placeholder = paramSpec.description ? `placeholder="${escapeHtml(paramSpec.description)}"` : '';
  const required = paramSpec.optional ? '' : 'required';

  if (paramSpec.ref) {
    if (!ontology.objectTypes.has(paramSpec.ref)) {
      console.warn(`[ActionForm] unknown ref target "${paramSpec.ref}" — falling back to text input`);
      return `<input type="text" data-param="${escapeHtml(name)}" placeholder="${escapeHtml(paramSpec.ref)} (unknown type — falling back to text)" ${required} />`;
    }
    const objs = ontology.all(paramSpec.ref, getContext());
    const options = objs.map((o) => buildRefOption(o)).join('');
    return `<select data-param="${escapeHtml(name)}" ${required}>${options}</select>`;
  }

  if (Array.isArray(paramSpec.enum)) {
    const options = paramSpec.enum
      .map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)
      .join('');
    return `<select data-param="${escapeHtml(name)}" ${required}>${options}</select>`;
  }

  if (paramSpec.type === 'number') {
    return `<input type="number" data-param="${escapeHtml(name)}" ${placeholder} ${required} style="width:120px" />`;
  }

  return `<input type="text" data-param="${escapeHtml(name)}" ${placeholder} ${required} />`;
}

export function renderActionForm(action, contextObj, $container, deps) {
  const { ontology, actions, state, render, getContext } = deps;
  const meta = BUTTON_META[action.name] || { label: humanize(action.name), className: 'btn' };
  if (!BUTTON_META[action.name]) {
    console.warn(`[ActionForm] no BUTTON_META entry for action "${action.name}" — using fallback`);
  }

  const inputsHtml = Object.entries(action.params || {})
    .filter(([name]) => name !== action.idParam)
    .map(([name, spec]) => buildInputHtml(name, spec, ontology, getContext))
    .join('');

  const $row = document.createElement('div');
  $row.className = 'action-row';
  $row.innerHTML = `
    ${inputsHtml}
    <button class="${escapeHtml(meta.className)}" data-action="${escapeHtml(action.name)}">${escapeHtml(meta.label)}</button>
  `;

  const $button = $row.querySelector('button[data-action]');
  $button.addEventListener('click', (ev) => {
    ev.preventDefault();
    const params = { [action.idParam]: contextObj.id };
    $row.querySelectorAll('[data-param]').forEach((input) => {
      params[input.dataset.param] = input.value;
    });
    try {
      actions.dispatch(action.name, params);
      state.lastError = null;
    } catch (err) {
      state.lastError = err.message;
      render();
    }
  });

  $container.appendChild($row);
}
