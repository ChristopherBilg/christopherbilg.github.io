import { BackingAdapter } from './BackingAdapter.js';
import { DuckDBProvider } from './DuckDBProvider.js';

export class DuckDBAdapter extends BackingAdapter {
  get tableName() {
    return this.config.tableName || `${this.typeName.toLowerCase()}s`;
  }

  async load() {
    const provider = DuckDBProvider.shared();
    await provider.init();
    await provider.registerJSON(this.tableName, this.config.backingData);
    const rows = await provider.query(`SELECT * FROM ${this.tableName}`);
    for (const row of rows) {
      this.ontology.cache.set(`${this.typeName}:${row[this.config.pk]}`, row);
    }
    console.info(`[adapter:duckdb] loaded ${this.typeName} (${rows.length})`);
  }
}
