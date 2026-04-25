const NODE_ID_KEY = 'ontology:node_id';
const CHANNEL_NAME = 'ontology-crdt';

export class CRDTClock {
  constructor() {
    this.nodeId = this._loadOrCreateNodeId();
    this.lamport = 0;
    this.listeners = [];
    this.channel = null;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.addEventListener('message', (ev) => this._onChannelMessage(ev.data));
      } catch {
        this.channel = null;
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (ev) => {
        if (ev.key && ev.key.startsWith('ontology:')) {
          this._notify('storage', null);
        }
      });
    }
  }

  _loadOrCreateNodeId() {
    try {
      let id = sessionStorage.getItem(NODE_ID_KEY);
      if (!id) {
        id = (crypto.randomUUID && crypto.randomUUID().slice(0, 8)) || `n${Math.random().toString(36).slice(2, 8)}`;
        sessionStorage.setItem(NODE_ID_KEY, id);
      }
      return id;
    } catch {
      return `n${Math.random().toString(36).slice(2, 8)}`;
    }
  }

  tick() {
    this.lamport++;
    return this.lamport;
  }

  observe(remoteLamport) {
    if (typeof remoteLamport === 'number') {
      this.lamport = Math.max(this.lamport, remoteLamport) + 1;
    }
    return this.lamport;
  }

  publish(changeSet) {
    if (!this.channel) return;
    try { this.channel.postMessage({ type: 'changeset', changeSet }); }
    catch {}
  }

  publishReset() {
    if (!this.channel) return;
    try { this.channel.postMessage({ type: 'reset' }); }
    catch {}
  }

  publishUndo(changeSet) {
    if (!this.channel) return;
    try { this.channel.postMessage({ type: 'undo', changeSet }); }
    catch {}
  }

  onMessage(cb) {
    this.listeners.push(cb);
  }

  _onChannelMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'changeset') {
      this.observe(msg.changeSet?.lamport);
      this._notify('changeset', msg.changeSet);
    } else if (msg.type === 'undo') {
      this._notify('undo', msg.changeSet);
    } else if (msg.type === 'reset') {
      this._notify('reset', null);
    }
  }

  _notify(kind, payload) {
    for (const cb of this.listeners) cb(kind, payload);
  }

  status() {
    return { nodeId: this.nodeId, lamport: this.lamport, channel: !!this.channel };
  }
}

export function crdtCompare(a, b) {
  const la = a.lamport ?? 0;
  const lb = b.lamport ?? 0;
  if (la !== lb) return la - lb;
  return String(a.nodeId || '').localeCompare(String(b.nodeId || ''));
}
