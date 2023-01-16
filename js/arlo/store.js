import { Evented } from './evented.js';

/**
 * A list of Records, represents a collection or a table.
 */
export class Store extends Evented {
    constructor (records = []) {
        super();

        // Reset the store's contents with the given records
        this.reset(records);
    }

    /**
     * Default getter method for the Record class type.
     */
    get recordClass () {
        return Record;
    }

    /**
     * Getter method for comparators; always returns null for comparisons.
     */
    get comparator () {
        return null;
    }

    // Create and return a new instance of the store's record from
    // the given data.
    create (id, data) {
        return this.add(new this.recordClass(id, data));
    }

    // Add a given record to this store, also called by `#create()`.
    add (record) {
        this.records.add(record);
        this.emitEvent();

        return record;
    }

    // Remove a given record from the store.
    remove (record) {
        this.records.delete(record);
        this.emitEvent();

        return record;
    }

    // This iterator is called when JavaScript requests an iterator from a store,
    // like when `for (const _ of someStore)` is run.
    [Symbol.iterator] () {
        return this.records.values();
    }

    // Try to find a record with the given ID in the store,
    // and return it. Returns null if not found.
    find (id) {
        for (const record of this.records) {
            if (record.id === id) {
                return record;
            }
        }

        return null;
    }

    reset (records) {
        // Internally, we represent the store as an unordered set.
        // we only order by comparator when we summarize. This prevents
        // us from having to perform sorting checks on every insert/update,
        // and is efficient as long as we don't re-render excessively.
        this.records = new Set(records);
        this.emitEvent();
    }

    summarize () {
        // The summary of a store is defined functionally. We just sort
        // the records in our store by the comparator (but we use a list
        // of pairs of cached comparators and records to be fast.
        return [...this.records].map(record => [
            this.comparator ? this.comparator(record) : null,
            record,
        ]).sort((a, b) => {
            if (a[0] < b[0]) {
                return -1;
            } else if (a[0] > b[0]) {
                return 1;
            } else {
                return 0;
            }
        }).map(o => o[1]);
    }

    // To serialize a store, we serialize each record and put them
    // in a giant list.
    serialize () {
        return this.summarize().map(record => record.serialize());
    }

}

// Higher-order component to create a Store for a given record class.
export const StoreOf = recordClass => {
    return class extends Store {
        get recordClass () {
            return recordClass;
        }
    };
};
