import { BackingAdapter } from './BackingAdapter.js';

export class JSONAdapter extends BackingAdapter {
  async load() {
    const url = this.config.backingData;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    const rows = await res.json();
    for (const row of rows) {
      this.ontology.cache.set(`${this.typeName}:${row[this.config.pk]}`, row);
    }
    console.info(`[adapter:json] loaded ${this.typeName} (${rows.length})`);
  }
}
