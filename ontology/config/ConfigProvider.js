const KNOWN_ENVS = ['dev', 'staging', 'prod'];
const DEFAULT_ENV = 'dev';

export class ConfigProvider {
  constructor(envOverride) {
    this.env = envOverride || readEnvFromUrl() || DEFAULT_ENV;
    if (!KNOWN_ENVS.includes(this.env)) this.env = DEFAULT_ENV;
    this.manifestUrl = `./env/${this.env}/manifest.json`;
    this.manifest = null;
  }

  async load() {
    try {
      const res = await fetch(this.manifestUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.manifest = await res.json();
    } catch (err) {
      console.warn(`[ConfigProvider] failed to load ${this.manifestUrl}:`, err.message);
      this.manifest = { version: 'unknown', environment: this.env, features: {}, dataSources: {} };
    }
    return this.manifest;
  }

  resolveDataSource(typeName) {
    const sources = this.manifest?.dataSources || {};
    if (sources[typeName]) return sources[typeName];
    return `./data/${typeName.toLowerCase()}s.json`;
  }

  resolveAdapter(typeName) {
    const adapters = this.manifest?.adapters || {};
    return adapters[typeName] || 'json';
  }

  features() {
    return this.manifest?.features || {};
  }

  meta() {
    return {
      env: this.env,
      version: this.manifest?.version,
      environment: this.manifest?.environment,
    };
  }

  static knownEnvs() {
    return KNOWN_ENVS.slice();
  }

  switchTo(env) {
    if (!KNOWN_ENVS.includes(env)) throw new Error(`Unknown env: ${env}`);
    const url = new URL(window.location.href);
    url.searchParams.set('env', env);
    window.location.href = url.toString();
  }
}

function readEnvFromUrl() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('env');
}
