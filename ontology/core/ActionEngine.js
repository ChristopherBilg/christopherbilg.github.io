import { LocalState } from '../store/LocalState.js';

export class ActionEngine {
  constructor(ontology) {
    this.ontology = ontology;
    this.definitions = new Map();
    this.middlewares = [];

    this.middlewares.push(authorizeMW);
    this.middlewares.push(resolveTargetMW);
    this.middlewares.push(validateMW);
    this.middlewares.push(preprocessMW);
    this.middlewares.push(computeChangesMW);
    this.middlewares.push(constraintsMW);
    this.middlewares.push(buildChangeSetMW);
    this.middlewares.push(persistMW);
  }

  define(name, spec) {
    if (!spec.objectType) throw new Error(`Action "${name}" missing objectType`);
    if (!spec.idParam) throw new Error(`Action "${name}" missing idParam`);
    if (typeof spec.apply !== 'function') throw new Error(`Action "${name}" missing apply()`);
    this.definitions.set(name, spec);
  }

  has(name) {
    return this.definitions.has(name);
  }

  list() {
    return Array.from(this.definitions.keys());
  }

  use(handler) {
    if (typeof handler !== 'function') throw new Error('handler must be a function');
    if (handler.length >= 2) {
      this.middlewares.push(handler);
    } else {
      this.middlewares.push((ctx, next) => {
        if (ctx.changeSet) handler(ctx.changeSet, ctx.ontology);
        next();
      });
    }
    return this;
  }

  availableFor(target) {
    const out = [];
    const sec = this.ontology.security;
    for (const [name, spec] of this.definitions) {
      if (spec.objectType !== target.typeName) continue;
      if (spec.availableWhen && !spec.availableWhen(target, this.ontology)) continue;
      if (sec && !sec.canDispatch(name)) continue;
      out.push({ name, spec });
    }
    return out;
  }

  dispatch(name, params) {
    const spec = this.definitions.get(name);
    if (!spec) throw new Error(`Unknown action: ${name}`);

    const ctx = { name, spec, params, ontology: this.ontology, engine: this };

    let i = 0;
    const next = () => {
      if (i >= this.middlewares.length) return;
      const mw = this.middlewares[i++];
      mw(ctx, next);
    };
    next();

    if (ctx.changeSet) this.ontology.emit('action', ctx.changeSet);
    return ctx.changeSet || null;
  }

  undo(changeSetId) {
    const removed = LocalState.removeChangeSet(changeSetId);
    if (removed) {
      this.ontology.emit('undo', removed);
      this.ontology.clock?.publishUndo(removed);
    }
    return removed;
  }

  history() {
    return LocalState.getAllChangeSets();
  }

  getSchema() {
    const out = {};
    for (const [name, spec] of this.definitions) {
      out[name] = {
        objectType: spec.objectType,
        idParam: spec.idParam,
        params: spec.params || { [spec.idParam]: { type: 'string' } },
        description: spec.description || null,
      };
    }
    return out;
  }
}

function authorizeMW(ctx, next) {
  const sec = ctx.ontology.security;
  if (sec && !sec.canDispatch(ctx.name)) {
    throw new Error(`Permission denied: role "${sec.role}" cannot dispatch "${ctx.name}"`);
  }
  next();
}

function resolveTargetMW(ctx, next) {
  ctx.objectId = ctx.params[ctx.spec.idParam];
  ctx.target = ctx.ontology.get(ctx.spec.objectType, ctx.objectId);
  if (!ctx.target) throw new Error(`Target not found: ${ctx.spec.objectType}:${ctx.objectId}`);
  next();
}

function validateMW(ctx, next) {
  if (ctx.spec.validate) {
    const err = ctx.spec.validate(ctx.target, ctx.params, ctx.ontology);
    if (err) throw new Error(err);
  }
  next();
}

function preprocessMW(ctx, next) {
  if (ctx.spec.preprocess) {
    ctx.spec.preprocess(ctx.target, ctx.params, ctx.ontology);
  }
  next();
}

function computeChangesMW(ctx, next) {
  const changes = ctx.spec.apply(ctx.target, ctx.params, ctx.ontology);
  if (!changes || typeof changes !== 'object') {
    throw new Error(`Action "${ctx.name}" must return a changes object`);
  }
  ctx.changes = changes;
  next();
}

function constraintsMW(ctx, next) {
  const ce = ctx.ontology.constraints;
  if (!ce) return next();
  const violation = ce.check(ctx.target, ctx.changes);
  if (violation) {
    throw new Error(`Constraint "${violation.constraint}": ${violation.message}`);
  }
  next();
}

function buildChangeSetMW(ctx, next) {
  const createdAt = new Date().toISOString();
  const validFrom = ctx.spec.validFrom
    ? ctx.spec.validFrom(ctx.target, ctx.params, ctx.ontology) || createdAt
    : createdAt;

  const clock = ctx.ontology.clock;
  const lamport = clock ? clock.tick() : 0;
  const nodeId = clock?.nodeId || 'local';

  ctx.changeSet = {
    id: (crypto.randomUUID && crypto.randomUUID()) || `cs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action: ctx.name,
    objectType: ctx.spec.objectType,
    objectId: ctx.objectId,
    params: ctx.params,
    changes: ctx.changes,
    created_at: createdAt,
    valid_from: validFrom,
    branchId: ctx.ontology.branches?.currentBranch || 'main',
    lamport,
    nodeId,
  };
  next();
}

function persistMW(ctx, next) {
  LocalState.appendChangeSet(ctx.changeSet);
  next();
}
