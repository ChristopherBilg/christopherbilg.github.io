const BRANCHES_KEY = 'ontology:branches';
const CURRENT_KEY = 'ontology:current_branch';

export class BranchManager {
  constructor() {
    this.branches = this._loadBranches();
    this.currentBranch = this._loadCurrent();
    if (!this.branches.includes(this.currentBranch)) {
      this.currentBranch = 'main';
    }
    this.listeners = [];
    this._installStorageListener();
  }

  _installStorageListener() {
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', (ev) => {
      if (ev.key !== BRANCHES_KEY && ev.key !== CURRENT_KEY) return;
      const prevCurrent = this.currentBranch;
      const prevList = this.branches.join(',');
      this.branches = this._loadBranches();
      this.currentBranch = this._loadCurrent();
      if (!this.branches.includes(this.currentBranch)) this.currentBranch = 'main';
      if (prevCurrent !== this.currentBranch) {
        this._emit('switch', this.currentBranch);
      } else if (prevList !== this.branches.join(',')) {
        this._emit('sync', this.currentBranch);
      }
    });
  }

  _loadBranches() {
    try {
      const raw = localStorage.getItem(BRANCHES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {}
    return ['main'];
  }

  _loadCurrent() {
    try { return localStorage.getItem(CURRENT_KEY) || 'main'; }
    catch { return 'main'; }
  }

  _persist() {
    try {
      localStorage.setItem(BRANCHES_KEY, JSON.stringify(this.branches));
      localStorage.setItem(CURRENT_KEY, this.currentBranch);
    } catch {}
  }

  list() {
    return this.branches.slice();
  }

  has(name) {
    return this.branches.includes(name);
  }

  isMain() {
    return this.currentBranch === 'main';
  }

  activeBranches() {
    if (this.currentBranch === 'main') return new Set(['main']);
    return new Set(['main', this.currentBranch]);
  }

  create(name) {
    if (!name || !/^[a-z0-9_-]+$/i.test(name)) {
      throw new Error('Branch names must be alphanumeric, dash, or underscore');
    }
    if (this.branches.includes(name)) throw new Error(`Branch "${name}" already exists`);
    this.branches.push(name);
    this._persist();
    this._emit('create', name);
  }

  switchTo(name) {
    if (!this.branches.includes(name)) throw new Error(`Unknown branch: ${name}`);
    if (name === this.currentBranch) return;
    this.currentBranch = name;
    this._persist();
    this._emit('switch', name);
  }

  discard(name, localState) {
    if (name === 'main') throw new Error('Cannot discard main branch');
    if (!this.branches.includes(name)) throw new Error(`Unknown branch: ${name}`);
    const remaining = localState.getAllChangeSets().filter((cs) => (cs.branchId || 'main') !== name);
    localState.replaceAll(remaining);
    this.branches = this.branches.filter((b) => b !== name);
    if (this.currentBranch === name) this.currentBranch = 'main';
    this._persist();
    this._emit('discard', name);
  }

  merge(name, localState) {
    if (name === 'main') throw new Error('Cannot merge main into itself');
    if (!this.branches.includes(name)) throw new Error(`Unknown branch: ${name}`);
    const all = localState.getAllChangeSets().map((cs) =>
      (cs.branchId || 'main') === name ? { ...cs, branchId: 'main' } : cs,
    );
    localState.replaceAll(all);
    this.branches = this.branches.filter((b) => b !== name);
    if (this.currentBranch === name) this.currentBranch = 'main';
    this._persist();
    this._emit('merge', name);
  }

  onChange(cb) {
    this.listeners.push(cb);
  }

  _emit(kind, branch) {
    for (const cb of this.listeners) cb(kind, branch);
  }
}
