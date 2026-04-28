const ACTION_VERB_RE = /^(depart|land|cancel|delay|reassign)\b/i;

const PK_FIELD = {
  Flight:  'tail_number',
  Pilot:   'pilot_id',
  Airport: 'code',
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
}

function cardForItem(type, item) {
  if (type === 'Flight') {
    return {
      pk:       item.tail_number,
      headline: item.tail_number,
      subline:  `${item.origin} → ${item.destination} · ${item.status}`,
    };
  }
  if (type === 'Pilot') {
    return {
      pk:       item.pilot_id,
      headline: item.name || item.pilot_id,
      subline:  `${item.pilot_id}${item.experience_tier ? ` · ${item.experience_tier}` : ''}${item.flight_hours != null ? ` · ${item.flight_hours} hrs` : ''}`,
    };
  }
  if (type === 'Airport') {
    return {
      pk:       item.code,
      headline: `${item.name} (${item.code})`,
      subline:  `${item.city}, ${item.country}`,
    };
  }
  return { pk: item.id || '', headline: String(item.id || '?'), subline: type };
}

export class Omnibar {
  constructor({ agent, ontology, onSelect, getContext }) {
    this.agent = agent;
    this.ontology = ontology;
    this.onSelect = onSelect || (() => {});
    this.getContext = getContext || (() => null);
    this._root = document.getElementById('omnibar-root');
    this._modal = null;
    this._input = null;
    this._results = null;
    this._highlightIdx = -1;
    this._lastResult = null;
    this._closeTimer = null;
    this._debouncedInput = debounce(() => this._submit(), 120);
    this._boundDocKeydown = (e) => this._onModalKeydown(e);
  }

  open() {
    if (this._modal) return;
    if (!this._root) {
      console.warn('[Omnibar] #omnibar-root not found in DOM');
      return;
    }

    this._root.hidden = false;
    this._root.innerHTML = `
      <div class="omnibar-backdrop">
        <div class="omnibar-modal" role="dialog" aria-modal="true">
          <input class="omnibar-input" type="text" placeholder="Ask the agent…" autocomplete="off" />
          <div class="omnibar-results"></div>
          <div class="omnibar-hint">Esc to close · ↑↓ to navigate · Enter to activate</div>
        </div>
      </div>
    `;

    this._modal   = this._root.querySelector('.omnibar-modal');
    this._input   = this._root.querySelector('.omnibar-input');
    this._results = this._root.querySelector('.omnibar-results');

    this._root.querySelector('.omnibar-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('omnibar-backdrop')) this.close();
    });

    this._input.addEventListener('input', () => {
      this._cancelCloseTimer();
      this._debouncedInput();
    });
    this._input.addEventListener('keydown', this._boundDocKeydown);

    this._renderEmptyState();
    this._input.focus();
  }

  close() {
    if (!this._modal) return;
    this._cancelCloseTimer();
    this._modal = null;
    this._input = null;
    this._results = null;
    this._highlightIdx = -1;
    this._lastResult = null;
    this._root.innerHTML = '';
    this._root.hidden = true;
  }

  destroy() {
    this.close();
  }

  _cancelCloseTimer() {
    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }
  }

  _onModalKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._cycleHighlight(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._cycleHighlight(-1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      this._activateHighlighted();
      return;
    }
    // Any other keystroke clears a pending auto-close timer.
    this._cancelCloseTimer();
  }

  _cycleHighlight(delta) {
    const cards = this._results.querySelectorAll('.omnibar-result-card');
    if (!cards.length) return;
    const next = ((this._highlightIdx + delta) + cards.length) % cards.length;
    cards.forEach((c, i) => c.classList.toggle('is-highlighted', i === next));
    this._highlightIdx = next;
  }

  _activateHighlighted() {
    const cards = this._results.querySelectorAll('.omnibar-result-card');
    if (!cards.length) return;
    const target = cards[this._highlightIdx >= 0 ? this._highlightIdx : 0];
    target.click();
  }

  _renderEmptyState() {
    const examples = this.agent.examples ? this.agent.examples() : [];
    if (!examples.length) {
      this._results.innerHTML = '<div class="omnibar-empty">No example intents available.</div>';
      return;
    }
    this._results.innerHTML = `
      <div class="omnibar-empty">
        <div class="omnibar-empty-label">Try one of these:</div>
        <div class="omnibar-chips">
          ${examples.map((ex) => `<button class="omnibar-chip" data-example="${escapeHtml(ex)}">${escapeHtml(ex)}</button>`).join('')}
        </div>
      </div>
    `;
    this._results.querySelectorAll('.omnibar-chip').forEach((el) => {
      el.addEventListener('click', () => {
        this._input.value = el.dataset.example;
        this._submit();
      });
    });
  }

  async _submit() {
    if (!this._modal) return;
    const text = (this._input.value || '').trim();
    if (!text) {
      this._renderEmptyState();
      return;
    }

    if (this.getContext() !== null && ACTION_VERB_RE.test(text)) {
      this._renderError("Time-travel view is read-only — actions are disabled. Click 'Now' to re-enable.");
      return;
    }

    let result;
    try {
      result = await this.agent.ask(text);
    } catch (err) {
      if (!this._modal) return;
      this._renderError(err.message || String(err));
      return;
    }
    if (!this._modal) return;

    this._lastResult = result;
    if (result.error) {
      this._renderError(result.error);
      return;
    }
    if (result.kind === 'read') {
      this._renderRead(result);
      return;
    }
    if (result.kind === 'action') {
      this._renderActionSuccess(result);
      return;
    }
    this._renderError(`Unrecognized result shape: ${JSON.stringify(result)}`);
  }

  _renderRead(result) {
    const payload = result.result;
    const type = payload.type;

    let cards;
    if (Array.isArray(payload.items)) {
      cards = payload.items.map((item) => cardForItem(type, item));
    } else if (payload.state) {
      cards = [cardForItem(type, payload.state)];
    } else {
      this._renderError('Read intent returned no items or state.');
      return;
    }

    if (!cards.length) {
      this._results.innerHTML = `<div class="omnibar-empty">No results for <code>${escapeHtml(this._input.value)}</code>.</div>`;
      return;
    }

    this._results.innerHTML = cards
      .map((c) => `
        <div class="omnibar-result-card" data-type="${escapeHtml(type)}" data-pk="${escapeHtml(c.pk)}">
          <div class="omnibar-result-head">
            <span class="omnibar-type-badge">${escapeHtml(type)}</span>
            <span class="omnibar-headline">${escapeHtml(c.headline)}</span>
          </div>
          <div class="omnibar-subline">${escapeHtml(c.subline)}</div>
        </div>
      `).join('');

    this._highlightIdx = -1;
    this._results.querySelectorAll('.omnibar-result-card').forEach((el) => {
      el.addEventListener('click', () => {
        const t = el.dataset.type;
        const id = el.dataset.pk;
        this.close();
        this.onSelect({ type: t, id });
      });
    });
  }

  _renderActionSuccess(result) {
    const csId = result.result?.id || '?';
    this._results.innerHTML = `
      <div class="omnibar-result-card omnibar-result-success">
        <div class="omnibar-result-head">
          <span class="omnibar-type-badge">action</span>
          <span class="omnibar-headline">Dispatched <code>${escapeHtml(result.action)}</code></span>
        </div>
        <div class="omnibar-subline">ChangeSet <code>${escapeHtml(csId)}</code></div>
      </div>
    `;
    this._cancelCloseTimer();
    this._closeTimer = setTimeout(() => this.close(), 800);
  }

  _renderError(message) {
    this._cancelCloseTimer();
    this._results.innerHTML = `
      <div class="omnibar-result-card omnibar-result-error">
        <div class="omnibar-result-head">
          <span class="omnibar-type-badge">error</span>
          <span class="omnibar-headline">${escapeHtml(message)}</span>
        </div>
      </div>
    `;
  }
}
