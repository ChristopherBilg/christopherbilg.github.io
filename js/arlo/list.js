import { Component } from "./component.js";

// Arlo's generic List implementation, based on Stores.
// React and similar virtual-dom view libraries depend on [key-based
// reconciliation](https://reactjs.org/docs/reconciliation.html) during render
// to efficiently render children of long lists. Arlo doesn't (yet) have a key-aware
// reconciler in the diffing algorithm, but `List`'s design obviates the need for keys.
// Rather than giving the renderer a flat virtual DOM tree to render, `List`
// instantiates each individual item component and hands them off to the renderer as full
// DOM Node elements, so each list item manages its own rendering, and the list component
// only worries about displaying the list wrapper and a flat list of children items.
export class List extends Component {
  /**
   * Default getter method for the Component type.
   * (This is usually overwritten.)
   */
  get itemClass() {
    return Component;
  }

  /**
   * Initialize a List with store (state) data.
   *
   * @param {*} store
   * @param  {...any} itemData
   */
  init(store, ...itemData) {
    this.store = store;
    this.items = new Map();
    this.filterFn = null;
    this.itemData = itemData;

    this.bind(this.store, () => this.itemsChanged());
  }

  itemsChanged() {
    // For every record in the store, if it isn't already in
    // `this.items`, add it and its view; if any were removed,
    // also remove it from `this.items`.
    const data = this.store.summarize();
    const items = this.items;

    for (const record of items.keys()) {
      if (!data.includes(record)) {
        items.get(record).remove();
        items.delete(record);
      }
    }

    for (const record of data) {
      if (!items.has(record)) {
        items.set(
          record,

          // We pass a callback that takes a record and removes it from
          // the list's store. It's common in UIs for items to have a button
          // that removes the item from the list, so this callback is passed
          // to the item component constructor to facilitate that pattern.
          new this.itemClass(record, () => this.store.remove(record), ...this.itemData)
        );
      }
    }

    // Sort by the provided filter function if there is one
    let sorter = [...items.entries()];
    if (this.filterFn !== null) {
      sorter = sorter.filter((item) => this.filterFn(item[0]));
    }

    // Sort the list the way the associated Store is sorted.
    sorter.sort((a, b) => data.indexOf(a[0]) - data.indexOf(b[0]));

    // Store the new items in a new (insertion-ordered) Map at this.items
    this.items = new Map(sorter);

    this.render();
  }

  filter(filterFn) {
    this.filterFn = filterFn;
    this.itemsChanged();
  }

  unfilter() {
    this.filterFn = null;
    this.itemsChanged();
  }

  get components() {
    return [...this];
  }

  // `List#nodes` returns the HTML nodes for each of its item
  // views, sorted in order. Designed to make writing `#compose()` easier.
  get nodes() {
    return this.components.map((item) => item.node);
  }

  // This iterator is called when JavaScript requests an iterator from a list,
  // e.g. when `for (const _ of someList)` is run.
  [Symbol.iterator]() {
    return this.items.values();
  }

  remove() {
    super.remove();

    // When we remove a list, we also want to call `remove()` on each
    // child components.
    for (const c of this.items.values()) {
      c.remove();
    }
  }

  // By default, just render the children views in a `<ul/>`
  compose() {
    return {
      tag: "ul",
      children: this.nodes,
    };
  }
}

// Higher-order component to create a list component for a given child item component.
export const ListOf = (itemClass) => {
  return class extends List {
    get itemClass() {
      return itemClass;
    }
  };
};
