import { isObject } from './common.js';
import { Evented } from './evented.js';

/**
 * `Record` is Arlo's unit of individual data source, used for view models and
 * Models from business logic.
 */
export class Record extends Evented {
    constructor (id, data = {}) {
        super();

        // We can create a Record by either passing in just the properties,
        // or an ID and a dictionary of props. We disambiguate here.
        if (isObject(id)) {
            data = id;
            id = null;
        }

        this.id = id;
        this.data = data;
    }

    // Setter for properties
    update (data) {
        Object.assign(this.data, data);
        this.emitEvent();
    }

    // Getter
    get (name) {
        return this.data[name];
    }

    // We summarize a Record by returning a dictionary of
    // all of its properties and the ID
    summarize () {
        return Object.assign(
            { id: this.id },
            this.data
        );
    }

    // The JSON-serialized version of a Record is the same as its
    // summary, since it's a shallow data store with just plain properties.
    serialize () {
        return this.summarize();
    }
};
