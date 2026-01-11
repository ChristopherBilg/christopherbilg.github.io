/**
 * Environment for Lisp Interpreter
 *
 * The environment module provides lexical scoping through a chain of
 * environment frames. Each frame contains variable bindings and a
 * reference to its parent (enclosing) scope.
 *
 * Design Patterns Used:
 * - Chain of Responsibility: Variable lookup traverses the parent chain
 *   until a binding is found or the chain ends.
 * - Prototype Pattern: Child environments inherit from parent environments,
 *   similar to JavaScript's prototype chain.
 */

/**
 * EnvironmentError class - Custom error for environment-related issues.
 */
export class EnvironmentError extends Error {
  /**
   * Creates a new EnvironmentError.
   *
   * @param {string} message - Error description
   */
  constructor(message) {
    super(`Environment Error: ${message}`);
    this.name = "EnvironmentError";
  }
}

/**
 * Environment class - Represents a lexical scope.
 *
 * Each environment has a reference to its parent (enclosing) scope,
 * forming a chain that implements lexical scoping. Variable lookup
 * starts in the current environment and traverses up the parent chain
 * until a binding is found.
 *
 * Usage:
 *   const global = new Environment();
 *   global.define("x", 10);
 *
 *   const local = global.extend();
 *   local.define("y", 20);
 *
 *   local.lookup("x"); // => 10 (found in parent)
 *   local.lookup("y"); // => 20 (found in current)
 */
export class Environment {
  /**
   * Creates a new Environment.
   *
   * @param {Environment|null} parent - The enclosing environment
   */
  constructor(parent = null) {
    this.parent = parent;
    this.bindings = new Map();
  }

  /**
   * Defines a new variable in the current scope.
   * If the variable already exists in this scope, it will be overwritten.
   *
   * @param {string} name - Variable name
   * @param {*} value - Variable value
   * @returns {Environment} This environment (for chaining)
   */
  define(name, value) {
    this.bindings.set(name, value);
    return this;
  }

  /**
   * Defines multiple variables at once.
   *
   * @param {Object} bindings - Object mapping names to values
   * @returns {Environment} This environment (for chaining)
   */
  defineAll(bindings) {
    for (const [name, value] of Object.entries(bindings)) {
      this.define(name, value);
    }
    return this;
  }

  /**
   * Sets a variable's value, searching up the scope chain.
   * The variable must already be defined somewhere in the chain.
   *
   * @param {string} name - Variable name
   * @param {*} value - New value
   * @returns {Environment} The environment where the variable was found
   * @throws {EnvironmentError} If variable is not defined
   */
  set(name, value) {
    if (this.bindings.has(name)) {
      this.bindings.set(name, value);
      return this;
    }
    if (this.parent !== null) {
      return this.parent.set(name, value);
    }
    throw new EnvironmentError(`Undefined variable: ${name}`);
  }

  /**
   * Looks up a variable's value, searching up the scope chain.
   *
   * @param {string} name - Variable name
   * @returns {*} The variable's value
   * @throws {EnvironmentError} If variable is not defined
   */
  lookup(name) {
    if (this.bindings.has(name)) {
      return this.bindings.get(name);
    }
    if (this.parent !== null) {
      return this.parent.lookup(name);
    }
    throw new EnvironmentError(`Undefined variable: ${name}`);
  }

  /**
   * Checks if a variable is defined in the current scope only.
   *
   * @param {string} name - Variable name
   * @returns {boolean} True if defined in current scope
   */
  hasOwn(name) {
    return this.bindings.has(name);
  }

  /**
   * Checks if a variable is defined in any scope (current or ancestors).
   *
   * @param {string} name - Variable name
   * @returns {boolean} True if defined
   */
  isDefined(name) {
    if (this.bindings.has(name)) {
      return true;
    }
    if (this.parent !== null) {
      return this.parent.isDefined(name);
    }
    return false;
  }

  /**
   * Finds the environment where a variable is defined.
   *
   * @param {string} name - Variable name
   * @returns {Environment|null} The environment containing the variable, or null
   */
  find(name) {
    if (this.bindings.has(name)) {
      return this;
    }
    if (this.parent !== null) {
      return this.parent.find(name);
    }
    return null;
  }

  /**
   * Creates a child environment with this as the parent.
   *
   * @returns {Environment} New child environment
   */
  extend() {
    return new Environment(this);
  }

  /**
   * Creates a child environment with initial bindings.
   *
   * @param {Object} bindings - Object mapping names to values
   * @returns {Environment} New child environment with bindings
   */
  extendWith(bindings) {
    const child = this.extend();
    child.defineAll(bindings);
    return child;
  }

  /**
   * Creates a child environment binding parameter names to argument values.
   * Useful for function application.
   *
   * @param {string[]} params - Parameter names
   * @param {*[]} args - Argument values
   * @returns {Environment} New child environment with parameter bindings
   */
  extendWithParams(params, args) {
    const child = this.extend();
    for (let i = 0; i < params.length; i++) {
      child.define(params[i], args[i]);
    }
    return child;
  }

  /**
   * Returns an array of all variable names defined in this scope.
   *
   * @returns {string[]} Array of variable names
   */
  keys() {
    return Array.from(this.bindings.keys());
  }

  /**
   * Returns an array of all variable names in this scope and all ancestors.
   *
   * @returns {string[]} Array of all accessible variable names
   */
  allKeys() {
    const keys = new Set(this.keys());
    if (this.parent !== null) {
      for (const key of this.parent.allKeys()) {
        keys.add(key);
      }
    }
    return Array.from(keys);
  }

  /**
   * Returns the depth of this environment in the scope chain.
   * The global environment has depth 0.
   *
   * @returns {number} Depth in scope chain
   */
  depth() {
    if (this.parent === null) {
      return 0;
    }
    return 1 + this.parent.depth();
  }

  /**
   * Returns a string representation of the environment for debugging.
   *
   * @returns {string} String representation
   */
  toString() {
    const bindings = this.keys()
      .map((k) => `${k}: ${this.bindings.get(k)}`)
      .join(", ");
    const parentInfo = this.parent ? ` -> parent(depth=${this.parent.depth()})` : "";
    return `Environment{${bindings}}${parentInfo}`;
  }

  /**
   * Creates a new global environment (no parent).
   * Static factory method.
   *
   * @returns {Environment} New global environment
   */
  static global() {
    return new Environment(null);
  }
}

/**
 * LispFunction class - Represents a user-defined function (lambda).
 *
 * A Lisp function captures its lexical environment (closure) at the time
 * of definition, allowing it to access variables from enclosing scopes
 * even after those scopes have exited.
 */
export class LispFunction {
  /**
   * Creates a new Lisp function.
   *
   * @param {string[]} params - Parameter names
   * @param {ASTNode} body - Function body (AST node)
   * @param {Environment} closure - Lexical environment at definition time
   * @param {string|null} name - Optional function name (for recursion and debugging)
   */
  constructor(params, body, closure, name = null) {
    this.params = params;
    this.body = body;
    this.closure = closure;
    this.name = name;
  }

  /**
   * Returns the arity (number of parameters) of the function.
   *
   * @returns {number} Number of parameters
   */
  arity() {
    return this.params.length;
  }

  /**
   * Returns a string representation of the function.
   *
   * @returns {string} String representation
   */
  toString() {
    const name = this.name ? this.name : "lambda";
    const params = this.params.join(" ");
    return `<function:${name}(${params})>`;
  }
}

/**
 * LispMacro class - Represents a macro.
 *
 * Macros are like functions but receive their arguments unevaluated.
 * They transform code at expansion time, returning new code to be evaluated.
 * This enables powerful metaprogramming capabilities.
 */
export class LispMacro {
  /**
   * Creates a new Lisp macro.
   *
   * @param {string[]} params - Parameter names
   * @param {ASTNode} body - Macro body (AST node)
   * @param {Environment} closure - Lexical environment at definition time
   * @param {string} name - Macro name
   */
  constructor(params, body, closure, name) {
    this.params = params;
    this.body = body;
    this.closure = closure;
    this.name = name;
  }

  /**
   * Returns the arity (number of parameters) of the macro.
   *
   * @returns {number} Number of parameters
   */
  arity() {
    return this.params.length;
  }

  /**
   * Returns a string representation of the macro.
   *
   * @returns {string} String representation
   */
  toString() {
    const params = this.params.join(" ");
    return `<macro:${this.name}(${params})>`;
  }
}

/**
 * Creates a variadic arithmetic operation.
 *
 * @param {Function} op - Binary operation function
 * @param {number} identity - Identity value for the operation
 * @returns {Function} Variadic function
 */
function makeVariadicOp(op, identity) {
  return (...args) => {
    if (args.length === 0) return identity;
    return args.reduce(op);
  };
}

/**
 * Deep equality check for Lisp values.
 *
 * @param {*} a - First value
 * @param {*} b - Second value
 * @returns {boolean} True if deeply equal
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }
  return false;
}

/**
 * Checks if a value is truthy in Lisp.
 * In Lisp, everything is truthy except #f (false) and nil (null).
 *
 * @param {*} value - Value to check
 * @returns {boolean} True if truthy
 */
export function isTruthy(value) {
  return value !== false && value !== null;
}

/**
 * Converts a Lisp value to its string representation.
 *
 * @param {*} value - Value to stringify
 * @returns {string} String representation
 */
export function stringify(value) {
  if (value === null) return "nil";
  if (value === true) return "#t";
  if (value === false) return "#f";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "function") return "<builtin>";
  if (value instanceof LispFunction) return value.toString();
  if (value instanceof LispMacro) return value.toString();
  if (typeof value === "symbol") return Symbol.keyFor(value) || value.toString();
  if (Array.isArray(value)) {
    return `(${value.map((v) => stringify(v)).join(" ")})`;
  }
  return String(value);
}

/**
 * Creates a global environment with all built-in functions and constants.
 *
 * This function sets up the standard Lisp environment with:
 * - Constants (nil, null, pi, e)
 * - Arithmetic operations (+, -, *, /, modulo, etc.)
 * - Comparison operations (=, <, >, <=, >=, eq?, equal?)
 * - Boolean operations (not)
 * - Type predicates (null?, number?, string?, list?, etc.)
 * - List operations (cons, car, cdr, list, append, etc.)
 * - String operations (string-append, substring, etc.)
 * - Higher-order functions (map, filter, reduce, for-each)
 * - I/O operations (display, print, newline)
 * - FFI functions for JavaScript interop (optional)
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.applyFunction - Function to apply user-defined functions
 * @param {Function} options.output - Output function (default: console.log)
 * @param {boolean} options.enableFFI - Whether to enable FFI functions (default: true)
 * @param {Object} options.globalObject - Global object for FFI (default: window or global)
 * @returns {Environment} Global environment with builtins
 */
export function createGlobalEnvironment(options = {}) {
  const { applyFunction = null, output = console.log, enableFFI = true, globalObject } = options;

  const env = new Environment();

  // ============================================================
  // Constants
  // ============================================================
  env.define("nil", null);
  env.define("null", null);
  env.define("pi", Math.PI);
  env.define("e", Math.E);

  // ============================================================
  // Arithmetic Operations
  // ============================================================
  env.define(
    "+",
    makeVariadicOp((a, b) => a + b, 0)
  );
  env.define("-", (...args) => {
    if (args.length === 0) throw new EnvironmentError("-: expected at least 1 argument");
    if (args.length === 1) return -args[0];
    return args.reduce((a, b) => a - b);
  });
  env.define(
    "*",
    makeVariadicOp((a, b) => a * b, 1)
  );
  env.define("/", (...args) => {
    if (args.length === 0) throw new EnvironmentError("/: expected at least 1 argument");
    if (args.length === 1) return 1 / args[0];
    return args.reduce((a, b) => a / b);
  });
  env.define("modulo", (a, b) => ((a % b) + b) % b); // True modulo (always positive)
  env.define("remainder", (a, b) => a % b);
  env.define("abs", Math.abs);
  env.define("min", (...args) => Math.min(...args));
  env.define("max", (...args) => Math.max(...args));
  env.define("floor", Math.floor);
  env.define("ceiling", Math.ceil);
  env.define("round", Math.round);
  env.define("truncate", Math.trunc);
  env.define("sqrt", Math.sqrt);
  env.define("expt", Math.pow);
  env.define("log", Math.log);
  env.define("exp", Math.exp);
  env.define("sin", Math.sin);
  env.define("cos", Math.cos);
  env.define("tan", Math.tan);
  env.define("asin", Math.asin);
  env.define("acos", Math.acos);
  env.define("atan", Math.atan);
  env.define("random", Math.random);

  // ============================================================
  // Comparison Operations
  // ============================================================
  env.define("=", (a, b) => a === b);
  env.define("<", (a, b) => a < b);
  env.define(">", (a, b) => a > b);
  env.define("<=", (a, b) => a <= b);
  env.define(">=", (a, b) => a >= b);
  env.define("eq?", (a, b) => a === b);
  env.define("eqv?", (a, b) => a === b);
  env.define("equal?", (a, b) => deepEqual(a, b));
  env.define("zero?", (a) => a === 0);
  env.define("positive?", (a) => a > 0);
  env.define("negative?", (a) => a < 0);
  env.define("odd?", (a) => a % 2 !== 0);
  env.define("even?", (a) => a % 2 === 0);

  // ============================================================
  // Boolean Operations
  // ============================================================
  env.define("not", (a) => !isTruthy(a));

  // ============================================================
  // Type Predicates
  // ============================================================
  env.define("null?", (a) => a === null);
  env.define("boolean?", (a) => typeof a === "boolean");
  env.define("number?", (a) => typeof a === "number");
  env.define("integer?", (a) => Number.isInteger(a));
  env.define("real?", (a) => typeof a === "number");
  env.define("string?", (a) => typeof a === "string");
  env.define("symbol?", (a) => typeof a === "symbol");
  env.define("pair?", (a) => Array.isArray(a) && a.length > 0);
  env.define("list?", (a) => Array.isArray(a));
  env.define("procedure?", (a) => typeof a === "function" || a instanceof LispFunction);

  // ============================================================
  // List Operations
  // ============================================================
  env.define("cons", (a, b) => [a, ...(Array.isArray(b) ? b : [b])]);
  env.define("car", (a) => {
    if (!Array.isArray(a) || a.length === 0) {
      throw new EnvironmentError("car: expected non-empty list");
    }
    return a[0];
  });
  env.define("cdr", (a) => {
    if (!Array.isArray(a) || a.length === 0) {
      throw new EnvironmentError("cdr: expected non-empty list");
    }
    return a.slice(1);
  });
  env.define("caar", (a) => a[0][0]);
  env.define("cadr", (a) => a[1]);
  env.define("cdar", (a) => a[0].slice(1));
  env.define("cddr", (a) => a.slice(2));
  env.define("caaar", (a) => a[0][0][0]);
  env.define("caadr", (a) => a[1][0]);
  env.define("cadar", (a) => a[0][1]);
  env.define("caddr", (a) => a[2]);
  env.define("cdaar", (a) => a[0][0].slice(1));
  env.define("cdadr", (a) => a[1].slice(1));
  env.define("cddar", (a) => a[0].slice(2));
  env.define("cdddr", (a) => a.slice(3));
  env.define("list", (...args) => args);
  env.define("make-list", (n, fill = null) => Array(n).fill(fill));
  env.define("length", (a) => {
    if (!Array.isArray(a)) {
      throw new EnvironmentError("length: expected list");
    }
    return a.length;
  });
  env.define("append", (...lists) => lists.flat());
  env.define("reverse", (a) => [...a].reverse());
  env.define("list-ref", (list, n) => list[n]);
  env.define("list-tail", (list, n) => list.slice(n));
  env.define("list-head", (list, n) => list.slice(0, n));
  env.define("nth", (n, list) => list[n]);
  env.define("first", (a) => a[0]);
  env.define("second", (a) => a[1]);
  env.define("third", (a) => a[2]);
  env.define("fourth", (a) => a[3]);
  env.define("fifth", (a) => a[4]);
  env.define("rest", (a) => a.slice(1));
  env.define("last", (a) => a[a.length - 1]);
  env.define("butlast", (a) => a.slice(0, -1));
  env.define("member", (item, list) => {
    const idx = list.findIndex((x) => deepEqual(x, item));
    return idx === -1 ? false : list.slice(idx);
  });
  env.define("memq", (item, list) => {
    const idx = list.indexOf(item);
    return idx === -1 ? false : list.slice(idx);
  });
  env.define("assoc", (key, alist) => {
    const pair = alist.find((p) => deepEqual(p[0], key));
    return pair || false;
  });
  env.define("assq", (key, alist) => {
    const pair = alist.find((p) => p[0] === key);
    return pair || false;
  });

  // ============================================================
  // String Operations
  // ============================================================
  env.define("string-append", (...args) => args.join(""));
  env.define("string-length", (s) => s.length);
  env.define("string-ref", (s, i) => s[i]);
  env.define("substring", (s, start, end) => s.substring(start, end));
  env.define("string=?", (a, b) => a === b);
  env.define("string<?", (a, b) => a < b);
  env.define("string>?", (a, b) => a > b);
  env.define("string<=?", (a, b) => a <= b);
  env.define("string>=?", (a, b) => a >= b);
  env.define("string-upcase", (s) => s.toUpperCase());
  env.define("string-downcase", (s) => s.toLowerCase());
  env.define("string-trim", (s) => s.trim());
  env.define("string-split", (s, delim = " ") => s.split(delim));
  env.define("string-join", (list, delim = "") => list.join(delim));
  env.define("string->number", (s) => {
    const n = parseFloat(s);
    return isNaN(n) ? false : n;
  });
  env.define("number->string", (n, radix = 10) => n.toString(radix));
  env.define("string->list", (s) => s.split(""));
  env.define("list->string", (list) => list.join(""));
  env.define("symbol->string", (sym) => Symbol.keyFor(sym) || "");
  env.define("string->symbol", (s) => Symbol.for(s));

  // ============================================================
  // Higher-Order Functions
  // ============================================================
  if (applyFunction) {
    env.define("map", (fn, ...lists) => {
      if (lists.length === 1) {
        return lists[0].map((x) => applyFunction(fn, [x]));
      }
      const len = Math.min(...lists.map((l) => l.length));
      const result = [];
      for (let i = 0; i < len; i++) {
        result.push(
          applyFunction(
            fn,
            lists.map((l) => l[i])
          )
        );
      }
      return result;
    });
    env.define("filter", (fn, list) => list.filter((x) => isTruthy(applyFunction(fn, [x]))));
    env.define("reject", (fn, list) => list.filter((x) => !isTruthy(applyFunction(fn, [x]))));
    env.define("reduce", (fn, init, list) => list.reduce((acc, x) => applyFunction(fn, [acc, x]), init));
    env.define("fold-left", (fn, init, list) => list.reduce((acc, x) => applyFunction(fn, [acc, x]), init));
    env.define("fold-right", (fn, init, list) => list.reduceRight((acc, x) => applyFunction(fn, [x, acc]), init));
    env.define("for-each", (fn, ...lists) => {
      if (lists.length === 1) {
        lists[0].forEach((x) => applyFunction(fn, [x]));
      } else {
        const len = Math.min(...lists.map((l) => l.length));
        for (let i = 0; i < len; i++) {
          applyFunction(
            fn,
            lists.map((l) => l[i])
          );
        }
      }
      return null;
    });
    env.define("find", (fn, list) => list.find((x) => isTruthy(applyFunction(fn, [x]))) ?? false);
    env.define("any", (fn, list) => list.some((x) => isTruthy(applyFunction(fn, [x]))));
    env.define("every", (fn, list) => list.every((x) => isTruthy(applyFunction(fn, [x]))));
    env.define("apply", (fn, args) => applyFunction(fn, args));
    env.define(
      "compose",
      (...fns) =>
        (x) =>
          fns.reduceRight((acc, fn) => applyFunction(fn, [acc]), x)
    );
  }

  // ============================================================
  // I/O Operations
  // ============================================================
  env.define("display", (x) => {
    output(typeof x === "string" ? x : stringify(x));
    return null;
  });
  env.define("write", (x) => {
    output(stringify(x));
    return null;
  });
  env.define("print", (x) => {
    output(stringify(x));
    return null;
  });
  env.define("newline", () => {
    output("");
    return null;
  });

  // ============================================================
  // Utility Functions
  // ============================================================
  env.define("identity", (x) => x);
  env.define("const", (x) => () => x);
  env.define("error", (msg) => {
    throw new EnvironmentError(String(msg));
  });
  env.define(
    "gensym",
    (() => {
      let counter = 0;
      return (prefix = "g") => Symbol.for(`${prefix}${counter++}`);
    })()
  );

  // ============================================================
  // FFI (Foreign Function Interface)
  // ============================================================
  // FFI functions are registered separately via registerFFI() from ffi.js
  // This allows synchronous environment creation while keeping FFI optional.
  // To enable FFI, call:
  //   import { registerFFI } from "./ffi.js";
  //   registerFFI(env, { applyFunction, globalObject });

  // Store options for later FFI registration
  env._ffiOptions = { applyFunction, globalObject, enableFFI };

  return env;
}
