import ForceGraph from 'https://esm.sh/force-graph@1.43.0';

const NODE_COLORS = {
  Flight:  '#4f8eff',
  Pilot:   '#34c759',
  Airport: '#f5a623',
};

const STATUS_NODE_COLORS = {
  Scheduled: '#4f8eff',
  InAir:     '#b45309',
  Landed:    '#15803d',
  Cancelled: '#b91c1c',
};

const FORWARD_LINK_TYPES = ['flight_pilot', 'flight_origin', 'flight_destination'];

export class GraphView {
  constructor(canvasEl, ontology, { onSelect, getContext }) {
    this.canvasEl = canvasEl;
    this.ontology = ontology;
    this.onSelect = onSelect || (() => {});
    this.getContext = getContext || (() => null);
    this._listeners = [];
    this._fg = null;
    this._mounted = false;
  }

  mount() {
    if (this._mounted) return;
    this._fg = ForceGraph()(this.canvasEl)
      .nodeLabel((n) => `<b>${n.type}</b> · ${n.label}<br/><span style="color:#999">${n.id}</span>`)
      .nodeColor((n) => n.color)
      .nodeRelSize(4)
      .linkColor(() => 'rgba(120,120,140,0.3)')
      .linkDirectionalParticles(0)
      .cooldownTicks(100)
      .onNodeClick((node) => this.onSelect({ type: node.type, id: node.meta.pk }));

    const onLoaded = () => this.refresh();
    const onAction = () => this.refreshLight();
    const onUndo   = () => this.refreshLight();
    this.ontology.on('loaded', onLoaded);
    this.ontology.on('action', onAction);
    this.ontology.on('undo',   onUndo);
    this._listeners.push(['loaded', onLoaded], ['action', onAction], ['undo', onUndo]);

    this._mounted = true;
    if (this.ontology.loaded) this.refresh();
  }

  refresh() {
    if (!this._fg) return;
    const ctx = this.getContext();
    const nodes = [];
    const nodeIds = new Set();

    for (const type of ['Flight', 'Pilot', 'Airport']) {
      for (const obj of this.ontology.all(type, ctx)) {
        const id = `${type}:${obj.id}`;
        if (nodeIds.has(id)) continue;
        nodeIds.add(id);
        nodes.push({
          id,
          type,
          label: this._labelFor(type, obj),
          color: this._colorFor(type, obj),
          meta: { pk: obj.id },
        });
      }
    }

    const links = [];
    for (const flight of this.ontology.all('Flight', ctx)) {
      const fid = `Flight:${flight.id}`;
      for (const linkName of FORWARD_LINK_TYPES) {
        const linkDef = this.ontology.links.get(linkName);
        if (!linkDef || linkDef.source !== 'Flight') continue;
        const fkValue = flight[linkDef.fk];
        if (fkValue == null) continue;
        const tid = `${linkDef.target}:${fkValue}`;
        if (!nodeIds.has(tid)) continue;
        links.push({ source: fid, target: tid, type: linkName });
      }
    }

    this._fg.graphData({ nodes, links });
  }

  refreshLight() {
    if (!this._fg) return;
    const ctx = this.getContext();
    const colored = this._fg.graphData();
    for (const n of colored.nodes) {
      if (n.type !== 'Flight') continue;
      const obj = this.ontology.get('Flight', n.meta.pk, ctx);
      if (!obj) continue;
      n.color = this._colorFor('Flight', obj);
    }
    this._fg.graphData(colored);
  }

  destroy() {
    // Ontology.on has no off; listeners leak until page unload (acceptable for this demo).
    this._listeners = [];
    if (this._fg) {
      this._fg.graphData({ nodes: [], links: [] });
      this._fg = null;
    }
    this._mounted = false;
  }

  _labelFor(type, obj) {
    if (type === 'Flight')  return obj.tail_number;
    if (type === 'Pilot')   return obj.name || obj.pilot_id;
    if (type === 'Airport') return obj.code;
    return obj.id;
  }

  _colorFor(type, obj) {
    if (type === 'Flight') return STATUS_NODE_COLORS[obj.status] || NODE_COLORS.Flight;
    return NODE_COLORS[type];
  }
}
