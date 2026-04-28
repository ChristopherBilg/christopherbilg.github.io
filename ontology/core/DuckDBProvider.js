const DUCKDB_CDN = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm';

let instance = null;

export class DuckDBProvider {
  constructor() {
    this._db = null;
    this._conn = null;
    this._initPromise = null;
    this._registered = new Set();
  }

  static shared() {
    if (!instance) instance = new DuckDBProvider();
    return instance;
  }

  async init() {
    if (this._conn) return;
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      const duckdb = await import(DUCKDB_CDN);
      const bundles = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(bundles);
      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }),
      );
      const worker = new Worker(workerUrl);
      const logger = new duckdb.ConsoleLogger();
      this._db = new duckdb.AsyncDuckDB(logger, worker);
      await this._db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(workerUrl);
      this._conn = await this._db.connect();
      console.info('[duckdb] ready');
    })();
    return this._initPromise;
  }

  async registerJSON(name, url) {
    await this.init();
    if (this._registered.has(name)) return;
    const absoluteUrl = new URL(url, window.location.href).toString();
    const res = await fetch(absoluteUrl);
    if (!res.ok) throw new Error(`Failed to fetch ${absoluteUrl}: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const vfsName = `${name}.json`;
    await this._db.registerFileBuffer(vfsName, buf);
    await this._conn.query(
      `CREATE OR REPLACE VIEW ${name} AS SELECT * FROM read_json_auto('${vfsName}')`,
    );
    this._registered.add(name);
    console.info(`[duckdb] registered ${name} (${buf.byteLength} bytes)`);
  }

  async query(sql, params = []) {
    await this.init();
    let result;
    if (params.length === 0) {
      result = await this._conn.query(sql);
    } else {
      const stmt = await this._conn.prepare(sql);
      try {
        result = await stmt.query(...params);
      } finally {
        await stmt.close();
      }
    }
    return this._toPlainRows(result);
  }

  _toPlainRows(arrowResult) {
    const rows = [];
    for (const row of arrowResult.toArray()) {
      const plain = {};
      for (const [k, v] of Object.entries(row.toJSON ? row.toJSON() : row)) {
        plain[k] = typeof v === 'bigint' ? Number(v) : v;
      }
      rows.push(plain);
    }
    return rows;
  }
}
