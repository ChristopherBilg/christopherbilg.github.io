/**
 * Foreign Function Interface (FFI) for Lisp Interpreter
 *
 * This module provides interoperability between Lisp and JavaScript,
 * enabling access to browser APIs, DOM manipulation, and JavaScript objects.
 *
 * Design Patterns Used:
 * - Adapter Pattern: Converts between Lisp values and JavaScript values
 * - Facade Pattern: Provides a simplified interface to complex browser APIs
 * - Proxy Pattern: Wraps JavaScript objects for safe access from Lisp
 */

import { LispFunction } from "./environment.js";

/**
 * FFIError class - Custom error for FFI-related issues.
 */
export class FFIError extends Error {
  /**
   * Creates a new FFIError.
   *
   * @param {string} message - Error description
   */
  constructor(message) {
    super(`FFI Error: ${message}`);
    this.name = "FFIError";
  }
}

/**
 * JSObject wrapper - Wraps a JavaScript object for use in Lisp.
 * This allows Lisp code to distinguish between native JS objects
 * and Lisp data structures.
 */
export class JSObject {
  /**
   * Creates a new JSObject wrapper.
   *
   * @param {*} value - The JavaScript value to wrap
   */
  constructor(value) {
    this.value = value;
  }

  /**
   * Returns the wrapped value.
   *
   * @returns {*} The wrapped JavaScript value
   */
  unwrap() {
    return this.value;
  }

  /**
   * Returns a string representation.
   *
   * @returns {string} String representation
   */
  toString() {
    if (this.value === null) return "<js:null>";
    if (this.value === undefined) return "<js:undefined>";
    if (typeof this.value === "function") return "<js:function>";
    if (this.value instanceof HTMLElement) {
      const tag = this.value.tagName.toLowerCase();
      const id = this.value.id ? `#${this.value.id}` : "";
      const cls = this.value.className ? `.${this.value.className.split(" ").join(".")}` : "";
      return `<js:element ${tag}${id}${cls}>`;
    }
    if (Array.isArray(this.value)) return `<js:array[${this.value.length}]>`;
    if (typeof this.value === "object") {
      const name = this.value.constructor?.name || "Object";
      return `<js:${name}>`;
    }
    return `<js:${typeof this.value}>`;
  }
}

/**
 * Converts a Lisp value to a JavaScript value.
 *
 * @param {*} value - Lisp value to convert
 * @returns {*} JavaScript value
 */
export function lispToJS(value) {
  // Already a JS object wrapper - unwrap it
  if (value instanceof JSObject) {
    return value.unwrap();
  }

  // Lisp function - wrap in JS function
  if (value instanceof LispFunction) {
    // Return a marker that the caller can handle
    return { __lispFunction: value };
  }

  // Symbol - convert to string
  if (typeof value === "symbol") {
    return Symbol.keyFor(value) || value.toString();
  }

  // Array (Lisp list) - recursively convert
  if (Array.isArray(value)) {
    return value.map(lispToJS);
  }

  // Primitives pass through
  return value;
}

/**
 * Converts a JavaScript value to a Lisp value.
 *
 * @param {*} value - JavaScript value to convert
 * @param {boolean} wrapObjects - Whether to wrap objects in JSObject (default: true)
 * @returns {*} Lisp value
 */
export function jsToLisp(value, wrapObjects = true) {
  // null/undefined -> Lisp nil
  if (value === null || value === undefined) {
    return null;
  }

  // Primitives pass through
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }

  // Arrays - recursively convert to Lisp lists
  if (Array.isArray(value)) {
    return value.map((v) => jsToLisp(v, wrapObjects));
  }

  // Functions and objects - wrap in JSObject
  if (wrapObjects) {
    return new JSObject(value);
  }

  return value;
}

/**
 * Creates FFI functions for the global environment.
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.applyFunction - Function to apply Lisp functions
 * @param {Object} options.globalObject - The global object (window in browser, global in Node)
 * @returns {Object} Object containing FFI function definitions
 */
export function createFFIFunctions(options = {}) {
  const { applyFunction = null, globalObject = typeof window !== "undefined" ? window : global } = options;

  const ffi = {};

  // ============================================================
  // Global Object Access
  // ============================================================

  /**
   * Get a global variable by name.
   * (js-global "window") -> <js:Window>
   * (js-global "document") -> <js:HTMLDocument>
   */
  ffi["js-global"] = (name) => {
    if (typeof name !== "string") {
      throw new FFIError("js-global: expected string name");
    }
    const value = globalObject[name];
    return jsToLisp(value);
  };

  /**
   * Get the global object itself.
   * (js-window) -> <js:Window>
   */
  ffi["js-window"] = () => jsToLisp(globalObject);

  // ============================================================
  // Property Access
  // ============================================================

  /**
   * Get a property from a JavaScript object.
   * (js-get obj "property") -> value
   * (js-get obj "nested" "property") -> value
   */
  ffi["js-get"] = (obj, ...path) => {
    let current = obj instanceof JSObject ? obj.unwrap() : lispToJS(obj);

    for (const key of path) {
      if (current === null || current === undefined) {
        return null;
      }
      const keyStr = typeof key === "symbol" ? Symbol.keyFor(key) : String(key);
      current = current[keyStr];
    }

    return jsToLisp(current);
  };

  /**
   * Set a property on a JavaScript object.
   * (js-set! obj "property" value) -> value
   */
  ffi["js-set!"] = (obj, key, value) => {
    const target = obj instanceof JSObject ? obj.unwrap() : lispToJS(obj);
    const keyStr = typeof key === "symbol" ? Symbol.keyFor(key) : String(key);
    const jsValue = lispToJS(value);

    target[keyStr] = jsValue;
    return value;
  };

  /**
   * Delete a property from a JavaScript object.
   * (js-delete! obj "property") -> #t/#f
   */
  ffi["js-delete!"] = (obj, key) => {
    const target = obj instanceof JSObject ? obj.unwrap() : lispToJS(obj);
    const keyStr = typeof key === "symbol" ? Symbol.keyFor(key) : String(key);
    return delete target[keyStr];
  };

  /**
   * Check if an object has a property.
   * (js-has? obj "property") -> #t/#f
   */
  ffi["js-has?"] = (obj, key) => {
    const target = obj instanceof JSObject ? obj.unwrap() : lispToJS(obj);
    const keyStr = typeof key === "symbol" ? Symbol.keyFor(key) : String(key);
    return keyStr in target;
  };

  /**
   * Get all keys of a JavaScript object.
   * (js-keys obj) -> ("key1" "key2" ...)
   */
  ffi["js-keys"] = (obj) => {
    const target = obj instanceof JSObject ? obj.unwrap() : lispToJS(obj);
    return Object.keys(target);
  };

  // ============================================================
  // Method Calling
  // ============================================================

  /**
   * Call a method on a JavaScript object.
   * (js-call obj "method" arg1 arg2 ...) -> result
   */
  ffi["js-call"] = (obj, method, ...args) => {
    const target = obj instanceof JSObject ? obj.unwrap() : lispToJS(obj);
    const methodName = typeof method === "symbol" ? Symbol.keyFor(method) : String(method);

    if (typeof target[methodName] !== "function") {
      throw new FFIError(`js-call: ${methodName} is not a function`);
    }

    // Convert Lisp functions to JS callbacks
    const jsArgs = args.map((arg) => {
      if (arg instanceof LispFunction && applyFunction) {
        return (...jsArgs) => {
          const lispArgs = jsArgs.map((a) => jsToLisp(a));
          return lispToJS(applyFunction(arg, lispArgs));
        };
      }
      return lispToJS(arg);
    });

    const result = target[methodName](...jsArgs);
    return jsToLisp(result);
  };

  /**
   * Call a function (not a method) from JavaScript.
   * (js-apply fn arg1 arg2 ...) -> result
   */
  ffi["js-apply"] = (fn, ...args) => {
    const jsFn = fn instanceof JSObject ? fn.unwrap() : lispToJS(fn);

    if (typeof jsFn !== "function") {
      throw new FFIError("js-apply: expected a function");
    }

    const jsArgs = args.map((arg) => {
      if (arg instanceof LispFunction && applyFunction) {
        return (...jsArgs) => {
          const lispArgs = jsArgs.map((a) => jsToLisp(a));
          return lispToJS(applyFunction(arg, lispArgs));
        };
      }
      return lispToJS(arg);
    });

    const result = jsFn(...jsArgs);
    return jsToLisp(result);
  };

  // ============================================================
  // Object Creation
  // ============================================================

  /**
   * Create a new JavaScript object.
   * (js-object) -> {}
   * (js-object "key1" val1 "key2" val2) -> {key1: val1, key2: val2}
   */
  ffi["js-object"] = (...pairs) => {
    const obj = {};
    for (let i = 0; i < pairs.length; i += 2) {
      const key = typeof pairs[i] === "symbol" ? Symbol.keyFor(pairs[i]) : String(pairs[i]);
      obj[key] = lispToJS(pairs[i + 1]);
    }
    return new JSObject(obj);
  };

  /**
   * Create a new JavaScript array.
   * (js-array 1 2 3) -> [1, 2, 3]
   */
  ffi["js-array"] = (...elements) => {
    return new JSObject(elements.map(lispToJS));
  };

  /**
   * Instantiate a JavaScript constructor.
   * (js-new Constructor arg1 arg2 ...) -> instance
   */
  ffi["js-new"] = (constructor, ...args) => {
    const Ctor = constructor instanceof JSObject ? constructor.unwrap() : lispToJS(constructor);

    if (typeof Ctor !== "function") {
      throw new FFIError("js-new: expected a constructor function");
    }

    const jsArgs = args.map(lispToJS);
    const instance = new Ctor(...jsArgs);
    return jsToLisp(instance);
  };

  // ============================================================
  // Type Checking and Conversion
  // ============================================================

  /**
   * Check if a value is a wrapped JavaScript object.
   * (js-object? x) -> #t/#f
   */
  ffi["js-object?"] = (x) => x instanceof JSObject;

  /**
   * Get the JavaScript typeof a value.
   * (js-typeof obj) -> "object"/"function"/"string"/etc.
   */
  ffi["js-typeof"] = (obj) => {
    const value = obj instanceof JSObject ? obj.unwrap() : lispToJS(obj);
    return typeof value;
  };

  /**
   * Check if a value is an instance of a constructor.
   * (js-instanceof? obj Constructor) -> #t/#f
   */
  ffi["js-instanceof?"] = (obj, constructor) => {
    const value = obj instanceof JSObject ? obj.unwrap() : lispToJS(obj);
    const Ctor = constructor instanceof JSObject ? constructor.unwrap() : lispToJS(constructor);
    return value instanceof Ctor;
  };

  /**
   * Unwrap a JSObject to get its raw JavaScript value.
   * (js-unwrap obj) -> raw JS value (be careful!)
   */
  ffi["js-unwrap"] = (obj) => {
    if (obj instanceof JSObject) {
      return obj.unwrap();
    }
    return lispToJS(obj);
  };

  /**
   * Wrap a value in a JSObject.
   * (js-wrap value) -> <js:...>
   */
  ffi["js-wrap"] = (value) => {
    if (value instanceof JSObject) {
      return value;
    }
    return new JSObject(value);
  };

  // ============================================================
  // DOM Manipulation (Browser-specific)
  // ============================================================

  if (typeof document !== "undefined") {
    /**
     * Query selector - find a single element.
     * (query-selector "div.class") -> <js:element>
     * (query-selector parent "div.class") -> <js:element>
     */
    ffi["query-selector"] = (selectorOrParent, selector) => {
      let parent, sel;
      if (selector === undefined) {
        parent = document;
        sel = selectorOrParent;
      } else {
        parent = selectorOrParent instanceof JSObject ? selectorOrParent.unwrap() : selectorOrParent;
        sel = selector;
      }
      const element = parent.querySelector(sel);
      return element ? new JSObject(element) : null;
    };

    /**
     * Query selector all - find all matching elements.
     * (query-selector-all "div.class") -> (<js:element> ...)
     */
    ffi["query-selector-all"] = (selectorOrParent, selector) => {
      let parent, sel;
      if (selector === undefined) {
        parent = document;
        sel = selectorOrParent;
      } else {
        parent = selectorOrParent instanceof JSObject ? selectorOrParent.unwrap() : selectorOrParent;
        sel = selector;
      }
      const elements = parent.querySelectorAll(sel);
      return Array.from(elements).map((el) => new JSObject(el));
    };

    /**
     * Get element by ID.
     * (get-element-by-id "myId") -> <js:element>
     */
    ffi["get-element-by-id"] = (id) => {
      const element = document.getElementById(id);
      return element ? new JSObject(element) : null;
    };

    /**
     * Create a new DOM element.
     * (create-element "div") -> <js:element>
     */
    ffi["create-element"] = (tagName) => {
      return new JSObject(document.createElement(tagName));
    };

    /**
     * Create a text node.
     * (create-text-node "Hello") -> <js:Text>
     */
    ffi["create-text-node"] = (text) => {
      return new JSObject(document.createTextNode(text));
    };

    /**
     * Append a child element.
     * (append-child! parent child) -> child
     */
    ffi["append-child!"] = (parent, child) => {
      const parentEl = parent instanceof JSObject ? parent.unwrap() : parent;
      const childEl = child instanceof JSObject ? child.unwrap() : child;
      parentEl.appendChild(childEl);
      return child;
    };

    /**
     * Remove a child element.
     * (remove-child! parent child) -> child
     */
    ffi["remove-child!"] = (parent, child) => {
      const parentEl = parent instanceof JSObject ? parent.unwrap() : parent;
      const childEl = child instanceof JSObject ? child.unwrap() : child;
      parentEl.removeChild(childEl);
      return child;
    };

    /**
     * Remove an element from its parent.
     * (remove! element) -> element
     */
    ffi["remove!"] = (element) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      el.remove();
      return element;
    };

    /**
     * Get or set inner HTML.
     * (inner-html element) -> "html string"
     * (inner-html! element "html string") -> element
     */
    ffi["inner-html"] = (element) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      return el.innerHTML;
    };

    ffi["inner-html!"] = (element, html) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      el.innerHTML = html;
      return element;
    };

    /**
     * Get or set text content.
     * (text-content element) -> "text"
     * (text-content! element "text") -> element
     */
    ffi["text-content"] = (element) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      return el.textContent;
    };

    ffi["text-content!"] = (element, text) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      el.textContent = text;
      return element;
    };

    /**
     * Get or set an attribute.
     * (get-attribute element "attr") -> "value"
     * (set-attribute! element "attr" "value") -> element
     */
    ffi["get-attribute"] = (element, name) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      return el.getAttribute(name);
    };

    ffi["set-attribute!"] = (element, name, value) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      el.setAttribute(name, value);
      return element;
    };

    /**
     * Remove an attribute.
     * (remove-attribute! element "attr") -> element
     */
    ffi["remove-attribute!"] = (element, name) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      el.removeAttribute(name);
      return element;
    };

    /**
     * Add a CSS class.
     * (add-class! element "class") -> element
     */
    ffi["add-class!"] = (element, className) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      el.classList.add(className);
      return element;
    };

    /**
     * Remove a CSS class.
     * (remove-class! element "class") -> element
     */
    ffi["remove-class!"] = (element, className) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      el.classList.remove(className);
      return element;
    };

    /**
     * Toggle a CSS class.
     * (toggle-class! element "class") -> #t/#f (new state)
     */
    ffi["toggle-class!"] = (element, className) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      return el.classList.toggle(className);
    };

    /**
     * Check if element has a class.
     * (has-class? element "class") -> #t/#f
     */
    ffi["has-class?"] = (element, className) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      return el.classList.contains(className);
    };

    /**
     * Get or set a style property.
     * (get-style element "property") -> "value"
     * (set-style! element "property" "value") -> element
     */
    ffi["get-style"] = (element, property) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      return el.style[property];
    };

    ffi["set-style!"] = (element, property, value) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      el.style[property] = value;
      return element;
    };

    /**
     * Add an event listener.
     * (add-event-listener! element "click" handler) -> element
     */
    ffi["add-event-listener!"] = (element, eventType, handler) => {
      const el = element instanceof JSObject ? element.unwrap() : element;

      let jsHandler;
      if (handler instanceof LispFunction && applyFunction) {
        jsHandler = (event) => {
          applyFunction(handler, [new JSObject(event)]);
        };
      } else if (handler instanceof JSObject) {
        jsHandler = handler.unwrap();
      } else {
        jsHandler = handler;
      }

      el.addEventListener(eventType, jsHandler);
      return element;
    };

    /**
     * Remove an event listener.
     * (remove-event-listener! element "click" handler) -> element
     */
    ffi["remove-event-listener!"] = (element, eventType, handler) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      const jsHandler = handler instanceof JSObject ? handler.unwrap() : handler;
      el.removeEventListener(eventType, jsHandler);
      return element;
    };

    /**
     * Get computed style of an element.
     * (get-computed-style element "property") -> "value"
     */
    ffi["get-computed-style"] = (element, property) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      const styles = window.getComputedStyle(el);
      return property ? styles.getPropertyValue(property) : new JSObject(styles);
    };

    /**
     * Get bounding client rect.
     * (get-bounding-rect element) -> <js:DOMRect>
     */
    ffi["get-bounding-rect"] = (element) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      return new JSObject(el.getBoundingClientRect());
    };

    /**
     * Focus an element.
     * (focus! element) -> element
     */
    ffi["focus!"] = (element) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      el.focus();
      return element;
    };

    /**
     * Blur (unfocus) an element.
     * (blur! element) -> element
     */
    ffi["blur!"] = (element) => {
      const el = element instanceof JSObject ? element.unwrap() : element;
      el.blur();
      return element;
    };

    /**
     * Get the document body.
     * (document-body) -> <js:element>
     */
    ffi["document-body"] = () => new JSObject(document.body);

    /**
     * Get the document head.
     * (document-head) -> <js:element>
     */
    ffi["document-head"] = () => new JSObject(document.head);

    /**
     * Get the document element (html).
     * (document-element) -> <js:element>
     */
    ffi["document-element"] = () => new JSObject(document.documentElement);
  }

  // ============================================================
  // Async/Promise Support
  // ============================================================

  /**
   * Create a resolved promise.
   * (promise-resolve value) -> <js:Promise>
   */
  ffi["promise-resolve"] = (value) => {
    return new JSObject(Promise.resolve(lispToJS(value)));
  };

  /**
   * Create a rejected promise.
   * (promise-reject reason) -> <js:Promise>
   */
  ffi["promise-reject"] = (reason) => {
    return new JSObject(Promise.reject(lispToJS(reason)));
  };

  /**
   * Chain a promise with then.
   * (promise-then promise on-fulfilled) -> <js:Promise>
   * (promise-then promise on-fulfilled on-rejected) -> <js:Promise>
   */
  ffi["promise-then"] = (promise, onFulfilled, onRejected) => {
    const p = promise instanceof JSObject ? promise.unwrap() : promise;

    const wrapHandler = (handler) => {
      if (!handler) return undefined;
      if (handler instanceof LispFunction && applyFunction) {
        return (value) => lispToJS(applyFunction(handler, [jsToLisp(value)]));
      }
      return handler instanceof JSObject ? handler.unwrap() : handler;
    };

    const result = p.then(wrapHandler(onFulfilled), wrapHandler(onRejected));
    return new JSObject(result);
  };

  /**
   * Catch a promise rejection.
   * (promise-catch promise on-rejected) -> <js:Promise>
   */
  ffi["promise-catch"] = (promise, onRejected) => {
    const p = promise instanceof JSObject ? promise.unwrap() : promise;

    let handler;
    if (onRejected instanceof LispFunction && applyFunction) {
      handler = (reason) => lispToJS(applyFunction(onRejected, [jsToLisp(reason)]));
    } else {
      handler = onRejected instanceof JSObject ? onRejected.unwrap() : onRejected;
    }

    return new JSObject(p.catch(handler));
  };

  /**
   * Wait for all promises.
   * (promise-all promise1 promise2 ...) -> <js:Promise>
   */
  ffi["promise-all"] = (...promises) => {
    const jsPromises = promises.map((p) => (p instanceof JSObject ? p.unwrap() : p));
    return new JSObject(Promise.all(jsPromises).then((results) => results.map(jsToLisp)));
  };

  // ============================================================
  // Timers
  // ============================================================

  /**
   * Set a timeout.
   * (set-timeout! callback ms) -> timer-id
   */
  ffi["set-timeout!"] = (callback, ms) => {
    let fn;
    if (callback instanceof LispFunction && applyFunction) {
      fn = () => applyFunction(callback, []);
    } else if (callback instanceof JSObject) {
      fn = callback.unwrap();
    } else {
      fn = callback;
    }
    return setTimeout(fn, ms);
  };

  /**
   * Clear a timeout.
   * (clear-timeout! timer-id) -> null
   */
  ffi["clear-timeout!"] = (id) => {
    clearTimeout(id);
    return null;
  };

  /**
   * Set an interval.
   * (set-interval! callback ms) -> timer-id
   */
  ffi["set-interval!"] = (callback, ms) => {
    let fn;
    if (callback instanceof LispFunction && applyFunction) {
      fn = () => applyFunction(callback, []);
    } else if (callback instanceof JSObject) {
      fn = callback.unwrap();
    } else {
      fn = callback;
    }
    return setInterval(fn, ms);
  };

  /**
   * Clear an interval.
   * (clear-interval! timer-id) -> null
   */
  ffi["clear-interval!"] = (id) => {
    clearInterval(id);
    return null;
  };

  // ============================================================
  // Console
  // ============================================================

  /**
   * Log to console.
   * (console-log arg1 arg2 ...) -> null
   */
  ffi["console-log"] = (...args) => {
    console.log(...args.map(lispToJS));
    return null;
  };

  /**
   * Log warning to console.
   * (console-warn arg1 arg2 ...) -> null
   */
  ffi["console-warn"] = (...args) => {
    console.warn(...args.map(lispToJS));
    return null;
  };

  /**
   * Log error to console.
   * (console-error arg1 arg2 ...) -> null
   */
  ffi["console-error"] = (...args) => {
    console.error(...args.map(lispToJS));
    return null;
  };

  // ============================================================
  // JSON
  // ============================================================

  /**
   * Parse JSON string to Lisp data.
   * (json-parse "{}") -> ()
   */
  ffi["json-parse"] = (str) => {
    try {
      return jsToLisp(JSON.parse(str), false);
    } catch (e) {
      throw new FFIError(`json-parse: ${e.message}`);
    }
  };

  /**
   * Stringify Lisp data to JSON.
   * (json-stringify data) -> "{}"
   */
  ffi["json-stringify"] = (data, indent) => {
    try {
      return JSON.stringify(lispToJS(data), null, indent);
    } catch (e) {
      throw new FFIError(`json-stringify: ${e.message}`);
    }
  };

  return ffi;
}

/**
 * Registers FFI functions into an environment.
 *
 * @param {Environment} env - The environment to extend
 * @param {Object} options - Configuration options
 */
export function registerFFI(env, options = {}) {
  const ffi = createFFIFunctions(options);

  for (const [name, fn] of Object.entries(ffi)) {
    env.define(name, fn);
  }
}
