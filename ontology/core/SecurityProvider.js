const STORAGE_KEY = 'ontology:role';

const ROLES = {
  viewer: {
    label: 'viewer',
    actions: new Set(),
    readFilters: {
      Flight: (row) => row.status !== 'Cancelled',
    },
  },
  dispatcher: {
    label: 'dispatcher',
    actions: new Set(['departFlight', 'landFlight', 'delayFlight']),
    readFilters: {},
  },
  admin: {
    label: 'admin',
    actions: '*',
    readFilters: {},
  },
};

export class SecurityProvider {
  constructor() {
    let initial = 'admin';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ROLES[stored]) initial = stored;
    } catch {}
    this.role = initial;
    this.listeners = [];
    this._installStorageListener();
  }

  _installStorageListener() {
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', (ev) => {
      if (ev.key !== STORAGE_KEY) return;
      const next = ev.newValue;
      if (!next || !ROLES[next] || next === this.role) return;
      this.role = next;
      for (const cb of this.listeners) cb(next);
    });
  }

  setRole(role) {
    if (!ROLES[role]) throw new Error(`Unknown role: ${role}`);
    if (role === this.role) return;
    this.role = role;
    try { localStorage.setItem(STORAGE_KEY, role); } catch {}
    for (const cb of this.listeners) cb(role);
  }

  onChange(cb) {
    this.listeners.push(cb);
  }

  canDispatch(actionName) {
    const r = ROLES[this.role];
    if (!r) return false;
    if (r.actions === '*') return true;
    return r.actions.has(actionName);
  }

  canRead(typeName, row) {
    const r = ROLES[this.role];
    if (!r) return true;
    const filter = r.readFilters[typeName];
    if (!filter) return true;
    return filter(row);
  }

  permissions() {
    const r = ROLES[this.role];
    if (!r) return { actions: [], readFilters: [] };
    return {
      actions: r.actions === '*' ? '*' : Array.from(r.actions),
      readFilters: Object.keys(r.readFilters),
    };
  }

  static knownRoles() {
    return Object.keys(ROLES);
  }
}
