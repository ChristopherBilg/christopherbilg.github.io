/**
 * A base class for evented data stores. Not exposed to the public API, but
 * all observables in Arlo inherit from `Evented`.
 */
export class Evented {
  /**
   * Initialize a set of handler functions.
   */
  constructor() {
    this.handlers = new Set();
  }

  // Base, empty implementation of `#summarize()` which is overridden in all subclasses.
  // In subclasses, this returns the 'summary' of the current state of the
  // event emitter as an object/array.
  summarize() {}

  // Whenever something changes, we fire an event to all subscribed
  // listeners, with a summary of its state.
  emitEvent() {
    const summary = this.summarize();
    for (const handler of this.handlers) {
      handler(summary);
    }
  }

  /**
   * Add an event handler function.
   *
   * @param {*} handler
   */
  addHandler(handler) {
    this.handlers.add(handler);
    handler(this.summarize());
  }

  /**
   * Remove an event handler function.
   *
   * @param {*} handler
   */
  removeHandler(handler) {
    this.handlers.delete(handler);
  }
}
