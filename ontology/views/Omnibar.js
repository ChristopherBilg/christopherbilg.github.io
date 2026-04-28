const ACTION_VERB_RE = /^(depart|land|cancel|delay|reassign)\b/i;

const PK_FIELD = {
  Flight:  'tail_number',
  Pilot:   'pilot_id',
  Airport: 'code',
};

function pkOf(type, item) {
  return PK_FIELD[type] ? item[PK_FIELD[type]] : (item.id || '');
}

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
  const pk = pkOf(type, item);
  if (type === 'Flight') {
    return {
      pk,
      headline: item.tail_number,
      subline:  `${item.origin} → ${item.destination} · ${item.status}`,
    };
  }
  if (type === 'Pilot') {
    return {
      pk,
      headline: item.name || item.pilot_id,
      subline:  `${item.pilot_id}${item.experience_tier ? ` · ${item.experience_tier}` : ''}${item.flight_hours != null ? ` · ${item.flight_hours} hrs` : ''}`,
    };
  }
  if (type === 'Airport') {
    return {
      pk,
      headline: `${item.name} (${item.code})`,
      subline:  `${item.city}, ${item.country}`,
    };
  }
  return { pk, headline: String(pk || '?'), subline: type };
}

export class Omnibar {
  constructor({ agent, ontology, onSelect, getContext }) {
    // ontology is accepted for API symmetry with other views and to leave room
    // for future fuzzy object search (B2 follow-up); not stored, since v1
    // routes everything through agent.ask.
    void ontology;
    this.agent = agent;
    this.onSelect = onSelect || (() => {});
    this.getContext = getContext || (() => null);
    this._root = document.getElementById('omnibar-root');
    this._modal = null;
    this._input = null;
    this._results = null;
    this._highlightIdx = -1;
    this._closeTimer = null;
    this._submitGen = 0;
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
        <div class="omnibar-modal" role="dialog" aria-modal="true" aria-label="Command palette">
          <input class="omnibar-input" type="text" placeholder="Ask the agent…" autocomplete="off" aria-label="Ask the agent" />
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
    // Capture key events on the document so Escape/Arrow/Enter still work
    // when focus moves off the input (e.g., to a result card or chip).
    document.addEventListener('keydown', this._boundDocKeydown, true);

    this._renderEmptyState();
    this._input.focus();
  }

  close() {
    if (!this._modal) return;
    document.removeEventListener('keydown', this._boundDocKeydown, true);
    this._cancelCloseTimer();
    this._modal = null;
    this._input = null;
    this._results = null;
    this._highlightIdx = -1;
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
    // From uninitialized (-1), ArrowDown should land on 0 and ArrowUp on
    // the last card; the modular formula otherwise lands one off.
    const start = this._highlightIdx === -1 ? (delta > 0 ? -1 : 0) : this._highlightIdx;
    const next = ((start + delta) + cards.length) % cards.length;
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

    // Generation token — discard responses that resolve out-of-order behind a
    // newer query (debounce only spaces invocations; it doesn't cancel a slow
    // in-flight ask when the user types again).
    const gen = ++this._submitGen;

    let result;
    try {
      result = await this.agent.ask(text);
    } catch (err) {
      if (!this._modal || gen !== this._submitGen) return;
      this._renderError(err.message || String(err));
      return;
    }
    if (!this._modal || gen !== this._submitGen) return;

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
        this.onSelect({ type: t, id });
        this.close();
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
