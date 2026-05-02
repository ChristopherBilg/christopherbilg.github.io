// ontology/views/LineagePanel.js
// Lineage DAG view. Datasets are nodes; transforms are edges (input -> output).
// Reuses force-graph (already imported by GraphView).

import ForceGraph from 'https://esm.sh/force-graph@1.43.0';

const COLORS = {
  fresh:        '#15803d',
  stale:        '#f59e0b',
  building:     '#2563eb',
  failed:       '#b91c1c',
  'never-built':'#6b7280',
  inherited:    '#15803d', // dashed border drawn via renderNodeCanvasObject
};

export class LineagePanel {
  constructor({ root, summaryEl, expandBtn, ontology, buildEngine, onSelect }) {
    this.root = root;
    this.summaryEl = summaryEl;
    this.expandBtn = expandBtn;
    this.ontology = ontology;
    this.buildEngine = buildEngine;
    this.onSelect = onSelect;
    this.expanded = false;
    this._fg = null;
    this._mounted = false;
    this._building = new Set();
  }

  mount() {
    if (this._mounted) return;
    this._mounted = true;
    this.expandBtn.addEventListener('click', () => this.toggle());

    const ont = this.ontology;
    ont.on('loaded',         () => this.refresh());
    ont.on('action',         () => this.refresh());
    ont.on('undo',           () => this.refresh());
    ont.on('build:start',    ({ transform, branch }) => {
      this._building.add(`${transform}::${branch}`);
      this.refresh();
    });
    ont.on('build',         (r) => { this._building.delete(`${r.transform}::${r.branch}`); this.refresh(); });
    ont.on('build:skipped', (r) => { this._building.delete(`${r.transform}::${r.branch}`); this.refresh(); });
    ont.on('build:failed',  (r) => { this._building.delete(`${r.transform}::${r.branch}`); this.refresh(); });
    ont.branches?.onChange?.(() => this.refresh());

    this.refresh();
  }

  toggle() {
    this.expanded = !this.expanded;
    this.root.classList.toggle('expanded', this.expanded);
    this.expandBtn.textContent = this.expanded ? '▼ Lineage' : '▶ Lineage';
    if (this.expanded && !this._fg) this._initGraph();
    if (this.expanded) this.refresh();
  }

  _initGraph() {
    const canvas = this.root.querySelector('.lineage-canvas');
    this._fg = ForceGraph()(canvas)
      .nodeLabel((n) => `${n.id} · ${n.state}`)
      .nodeCanvasObject((n, ctx, scale) => {
        const r = 6;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[n.state] || '#999';
        ctx.fill();
        if (n.state === 'inherited') {
          ctx.setLineDash([3, 2]);
          ctx.strokeStyle = '#15803d';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = '#cfd2da';
        ctx.font = `${12 / scale}px sans-serif`;
        ctx.fillText(n.id, n.x + r + 2, n.y + 4 / scale);
      })
      .linkColor(() => 'rgba(120,120,140,0.4)')
      .onNodeClick((n) => this.onSelect({ name: n.id, transform: n.transform }));
  }

  refresh() {
    const ont = this.ontology;
    const branch = ont.branches?.currentBranch || 'main';
    const txByOutput = ont.transformsByOutput();

    let staleCount = 0;
    let lastBuildIso = null;
    const nodes = [];
    for (const [name, ds] of ont.datasets) {
      const transformName = txByOutput.get(name) || null;
      const state = this._stateOf(name, ds, transformName, branch);
      if (state === 'stale') staleCount++;
      const lr = transformName ? this.buildEngine.catalog.latest(transformName, branch) : null;
      if (lr?.finishedAt && (!lastBuildIso || lr.finishedAt > lastBuildIso)) {
        lastBuildIso = lr.finishedAt;
      }
      nodes.push({ id: name, state, transform: transformName });
    }

    const links = [];
    for (const [tName, spec] of ont.transforms) {
      for (const inp of spec.inputs) {
        links.push({ source: inp, target: spec.output, transform: tName });
      }
    }

    this.summaryEl.textContent = `${ont.datasets.size} datasets · ${staleCount} stale${lastBuildIso ? ` · last build ${this._rel(lastBuildIso)}` : ''}`;

    if (this._fg) this._fg.graphData({ nodes, links });
  }

  _stateOf(name, ds, transformName, branch) {
    if (ds.source.kind === 'raw') return 'fresh';
    if (!transformName) return 'never-built';
    if (this._building.has(`${transformName}::${branch}`)) return 'building';
    const latest = this.buildEngine.catalog.latest(transformName, branch);
    if (!latest) {
      // Branch read-through: if the parent branch (main) has a build, mark inherited.
      const fallback = this.buildEngine.catalog.latestSuccessful(transformName, 'main');
      if (fallback && branch !== 'main') return 'inherited';
      return 'never-built';
    }
    if (latest.status === 'failed') return 'failed';
    if (this.buildEngine.catalog.getStaleHint(transformName, branch)) return 'stale';
    return 'fresh';
  }

  _rel(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return `${Math.round(d)}s ago`;
    if (d < 3600) return `${Math.round(d / 60)}m ago`;
    return `${Math.round(d / 3600)}h ago`;
  }
}

export function buildAllStaleHandler(buildEngine, ontology, getContext) {
  return async () => {
    const branch = ontology.branches.currentBranch;
    const context = getContext ? getContext() : null;
    const txs = [];
    for (const [tName] of ontology.transforms) {
      if (buildEngine.catalog.getStaleHint(tName, branch)) txs.push(tName);
    }
    for (const tName of txs) {
      try { await buildEngine.build(tName, context); } catch (e) { console.error(e); }
    }
  };
}
