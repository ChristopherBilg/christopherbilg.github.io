import { isObject, normalizeArray } from './common.js';
import { Evented } from './evented.js';

// Shorthand function for the default, empty event object in `Component`.
const emptyEvent = () => {
    return {
        source: null,
        handler: () => { },
    };
};

// `normalizeVDOM` takes a VDOM object (dictionary) and modifies
// it in place so it has the default VDOM properties, and we don't
// have to complicate our rendering code by checking for nulls with
// every key access into our serialized virtual DOM.
// Note that we don't check `isObject(vdom)` here. We assume
// only valid objects are passed in to 'normalize', which is true
// in our usage so far. `normalizeVDOM` is a hot path in rendering,
// so we need it as fast as it can be.
const normalizeVDOM = vdom => {
    if (vdom.attrs === undefined) {
        vdom.attrs = {};
    }

    if (vdom.events === undefined) {
        vdom.events = {};
    }

    if (vdom.children === undefined) {
        vdom.children = [];
    }
};

// We use comment nodes as placeholder nodes because they're lightweight
// and invisible.
const tempNode = () => document.createComment('');

// `opQueue` is a global queue of node-level operations to be performed.
// These are calculated during the diff, but because operations touching the
// page DOM are expensive, we defer them until the end of a render pass
// and run them all at once, asynchronously. Each item in the queue is an array
// that starts with an opcode (one of the three below), and is followed
// by the list of arguments the operation takes. We render all operations in the queue
// to the DOM before the browser renders the next frame.
let opQueue = [];
const OP_APPEND = 0; // append, parent, new
const OP_REMOVE = 1; // remove, parent, old
const OP_REPLACE = 2; // replace, old, new

// This is a stubbed `parentNode`. See below in `runDOMOperations` for why this exists.
const STUB_PARENT = {
    replaceChild: () => { },
};

// `runDOMOperations` works through the `opQueue` and performs each
// DOM operation in order they were queued. rDO is called when the reconciler
// (`render`) reaches the bottom of a render stack (when it's done reconciling
// the diffs in a root-level VDOM node of a component).
function runDOMOperations () {
    // This function is written to avoid any potential reconciliation conflicts.
    // There are two risks to mitigate: 1. attempting insert a node
    // that is already in the DOM, and 2. attempting remove a node that isn't
    // in the DOM. Both will result in inconsistent DOM state and break the renderer.
    // To avoid this, first, we remove all children and add placeholders where they
    // ought to be replaced. Then, in a second loop, we add any children that need
    // to be added and replace placeholders. Thus, no children will be inadvertently removed
    // and no wrong node will be removed.
    const len = opQueue.length;

    for (let i = 0; i < len; i++) {
        const next = opQueue[i];
        const op = next[0];

        if (op === OP_REMOVE) {
            // Remove all children that should be
            next[1].removeChild(next[2]);
        } else if (op === OP_REPLACE) {
            // For the ones queued to for being replaced,
            // put in a placeholder node, and queue that up instead.
            const oldNode = next[1];
            const tmp = tempNode();
            const parent = oldNode.parentNode;

            // Sometimes, the given node will be a standalone node
            // (like the root of an unmounted component) and will have no `parentNode`.
            // In these rare cases, it's best for performance to just set the parent to a stub
            // with a no-op `replaceChild`. Trying to check for edge cases later each time is a
            // performance penalty, since this is a very rare case.
            if (parent !== null) {
                parent.replaceChild(tmp, oldNode);
                next[1] = tmp;
                next[3] = parent;
            } else {
                next[3] = STUB_PARENT;
            }
        }
    }

    for (let i = 0; i < len; i++) {
        const next = opQueue[i];
        const op = next[0];

        if (op === OP_APPEND) {
            // Add any node that need to be added
            next[1].appendChild(next[2]);
        } else if (op === OP_REPLACE) {
            // Replace placeholders with correct nodes. This is
            // equivalent to `parent.replaceChild(newNode, oldNode)`
            next[3].replaceChild(next[2], next[1]);
        }
    }

    opQueue = [];
}

// A function to compare event handlers in `render`
const diffEvents = (whole, sub, cb) => {
    for (const eventName of Object.keys(whole)) {
        const wholeEvents = normalizeArray(whole[eventName]);
        const subEvents = normalizeArray(sub[eventName] || []);

        for (const handlerFn of wholeEvents) {
            // Sometimes, it's nice to be able to pass in non-function values to event
            // objects in VDOM, because we may be toggling the presence of an event listener
            // with a ternary expression, for example. We only attach function handlers here.
            if (!subEvents.includes(handlerFn) && typeof handlerFn === 'function') {
                cb(eventName, handlerFn);
            }
        }
    }
};

// A global counter for how deep we are in our render tree.
// 0 indicates that we aren't in the middle of rendering.
let render_stack = 0;

// Arlo's virtual DOM rendering algorithm that manages all diffing,
// updating, and efficient DOM access. `render` takes `node`, the previous
// root node; `previous`, the previous VDOM; and `next`, the new VDOM;
// and returns the new root node (potentially different from the old
// root node.) Whenever a component is rendered, it calls `render`. This
// rendering algorithm is recursive into child nodes. Despite not touching
// the DOM, this is still one of the most expensive parts of rendering.
const render = (node, previous, next) => {
    // This queues up a node to be inserted into a new slot in the
    // DOM tree. All queued replacements will flush to DOM at the end
    // of the render pass, from `runDOMOperations`.
    const replacePreviousNode = newNode => {
        if (node && node !== newNode) {
            opQueue.push([OP_REPLACE, node, newNode]);
        }

        node = newNode;
    };

    // We're rendering a new node in the render tree. Increment counter.
    render_stack++;

    // We only do diff operations if the previous and next items are not the same.
    if (previous !== next) {
        // If we need to render a null (comment) node,
        // create and insert a comment node. This might seem
        // silly, but it keeps the DOM consistent between
        // renders and makes diff simpler.
        if (next === null) {
            replacePreviousNode(tempNode());
            // If we're rendering a string or raw number,
            // convert it into a string and add a TextNode.
        } else if (typeof next === 'string' || typeof next === 'number') {
            // If the previous node was also a text node, just replace the `.data`, which is
            // very fast (as of 5/2019 faster than `.nodeValue`, `.textContent`, and .`innerText`). Otherwise, create a new `TextNode`.
            if (typeof previous === 'string' || typeof previous === 'number') {
                node.data = next;
            } else {
                replacePreviousNode(document.createTextNode(next));
            }

            // If we need to render a literal DOM Node, just replace
            // the old node with the literal node.
        } else if (next.appendChild !== undefined) { // check if next instanceof Node; fastest way is checking for presence of a non-getter property
            replacePreviousNode(next);
            // If we're rendering an object literal, assume it's a serialized
            // VDOM dictionary. This is the meat of the algorithm.
        } else { // next is a non-null object
            if (
                node === undefined
                || !isObject(previous)

                // Check if previous instanceof Node; fastest way is checking for presence of a
                // non-getter property, like `appendChild`.
                || (previous && previous.appendChild !== undefined)

                // If the tags differ, we assume the subtrees will be different
                // as well and just start a completely new element. This is efficient
                // in practice, reduces the time complexity of the algorithm, and
                // an optimization shared with React's reconciler.
                || previous.tag !== next.tag
            ) {
                // If the previous VDOM doesn't exist or wasn't VDOM, we're adding a completely
                // new node into the DOM. Stub an empty `previous`.
                previous = {
                    tag: null,
                };

                replacePreviousNode(document.createElement(next.tag));
            }

            normalizeVDOM(previous);
            normalizeVDOM(next);

            // Compare and update attributes
            for (const attrName of Object.keys(next.attrs)) {
                const pAttr = previous.attrs[attrName];
                const nAttr = next.attrs[attrName];

                if (attrName === 'class') {
                    // VDOM can pass classes as either a single string
                    // or an array of strings, so we need to check for either
                    // of those cases.
                    const nextClass = nAttr;

                    // Mutating `className` is faster than iterating through
                    // `classList` objects if there's only one batch operation
                    // for all class changes.
                    if (Array.isArray(nextClass)) {
                        node.className = nextClass.join(' ');
                    } else {
                        node.className = nextClass;
                    }
                } else if (attrName === 'style') {
                    // VDOM takes style attributes as a dictionary
                    // rather than a string for API ergonomics, so we serialize
                    // it differently than other attributes.
                    const prevStyle = pAttr || {};
                    const nextStyle = nAttr;

                    // When we iterate through the key/values of a flat object like this,
                    // you may be tempted to use `Object.entries()`. We use `Object.keys()` and lookups,
                    // which is less idiomatic, but fast. This results in a measurable performance bump.
                    for (const styleKey of Object.keys(nextStyle)) {
                        if (nextStyle[styleKey] !== prevStyle[styleKey]) {
                            node.style[styleKey] = nextStyle[styleKey];
                        }
                    }

                    for (const styleKey of Object.keys(prevStyle)) {
                        if (nextStyle[styleKey] === undefined) {
                            node.style[styleKey] = '';
                        }
                    }

                    // If an attribute is an IDL attribute, we set it
                    // through JavaScript properties on the HTML element
                    // and not `setAttribute()`. This is necessary for
                    // properties like `value` and `indeterminate`.
                } else if (attrName in node) {
                    // We explicitly make a comparison here before setting, because setting reflected
                    // HTML properties is _not idempotent_ -- on some elements like audio, video, and iframe,
                    // setting properties like src will call a setter that sometimes resets UI state in some
                    // browsers. We must compare the new value to DOM directly and not a previous VDOM value,
                    // because they differ sometimes when the DOM mutates from under Arlo's control, like on a user input.
                    // We also guard against cases where the DOM has a default value (like input.type) but
                    // we want to still specify a value manually, by checking if `pAttr` was defined.
                    if (node[attrName] !== nAttr || (pAttr === undefined && pAttr !== nAttr)) {
                        node[attrName] = nAttr;
                    }
                } else {
                    if (pAttr !== nAttr) {
                        node.setAttribute(attrName, nAttr);
                    }
                }
            }

            // For any attributes that were removed in the new VDOM,
            // also attempt to remove them from the DOM.
            for (const attrName of Object.keys(previous.attrs)) {
                if (next.attrs[attrName] === undefined) {
                    if (attrName in node) {
                        // `null` seems to be the default for most IDL attrs,
                        // but even this isn't entirely consistent. This seems
                        // like something we should fix as issues come up, not
                        // preemptively search for a cross-browser solution.
                        node[attrName] = null;
                    } else {
                        node.removeAttribute(attrName);
                    }
                }
            }

            diffEvents(next.events, previous.events, (eventName, handlerFn) => {
                node.addEventListener(eventName, handlerFn);
            });

            diffEvents(previous.events, next.events, (eventName, handlerFn) => {
                node.removeEventListener(eventName, handlerFn);
            });

            // Render children recursively. These loops are also well optimized, since
            // it's a hot patch of code at runtime.
            // We memoize generated child nodes into this `previous._nodes` array
            // so we don't have to perform expensive, DOM-touching operations during reconciliation
            // to look up children of the current node in the next render pass. `nodeChildren`
            // will be updated alongside enqueued DOM mutation operations.
            // In the future, we may also look at optimizing more of the common cases of list diffs
            // as [domdiff](https://github.com/WebReflection/domdiff/blob/master/esm/index.js) does,
            // before delving into a full iterative diff of two lists.
            const prevChildren = previous.children;
            const nextChildren = next.children;

            // Memoize length lookups.
            const prevLength = prevChildren.length;
            const nextLength = nextChildren.length;

            // Smaller way to check for 'if either nextLength or prevLength is greater than zero'
            if (nextLength + prevLength > 0) {
                // Initialize variables we'll need / reference throughout child reconciliation.
                const nodeChildren = previous._nodes || [];
                const minLength = prevLength < nextLength ? prevLength : nextLength;

                // 'sync' the common sections of the two children lists.
                let i = 0;
                for (; i < minLength; i++) {
                    if (prevChildren[i] !== nextChildren[i]) {
                        nodeChildren[i] = render(nodeChildren[i], prevChildren[i], nextChildren[i]);
                    }
                }
                // If the new VDOM has more children than the old VDOM, we need to
                // add the extra children.
                if (prevLength < nextLength) {
                    for (; i < nextLength; i++) {
                        const newChild = render(undefined, undefined, nextChildren[i]);
                        opQueue.push([OP_APPEND, node, newChild]);
                        nodeChildren.push(newChild);
                    }

                    // If the new VDOM has less than or equal number of children to the old
                    // VDOM, we'll remove any stragglers.
                } else {
                    for (; i < prevLength; i++) {
                        // If we need to remove a child element, removing
                        // it from the DOM immediately might lead to race conditions.
                        // instead, we add a placeholder and remove the placeholder
                        // at the end.
                        opQueue.push([OP_REMOVE, node, nodeChildren[i]]);
                    }

                    nodeChildren.splice(nextLength, prevLength - nextLength);
                }

                // Mount `nodeChildren` onto the up-to-date VDOM, so the next
                // render pass can reference it.
                next._nodes = nodeChildren;
            }
        }
    }

    // We're done rendering the current node, so decrement the
    // render stack counter. If we've reached the top of the
    // render tree, it's time to flush replaced nodes to the DOM
    // before the next frame.
    if (--render_stack === 0) {
        // `runDOMOperations()` can also be called completely asynchronously
        // with utilities like `requestIdleCallback`, _a la_ Concurrent React,
        // for better responsiveness on larger component trees. This requires
        // a modification to Arlo's architecture, so that each set of `DOMOperations`
        // tasks in the `opQueue` from one component's render call are flushed to
        // the DOM before the next component's `DOMOperations` begins, for consistency.
        // This can be achieved with a nested queue layer on top of `opQueue`.
        // Here, we omit concurrency support today because it's not a great necessity
        // where Arlo is used.
        runDOMOperations();
    }

    return node;
};

// Arlo's Component class
export class Component {
    constructor (...args) {
        this.vdom = undefined;
        this.node = undefined;
        this.event = emptyEvent();

        // We call init() before render, because it's a common pattern
        // to set and initialize 'private' fields in `this.init()` (at least
        // before the ES-next private fields proposal becomes widely supported.)
        // Frequently, rendering will require private values to be set correctly.
        this.init(...args);

        // After we run `#init()`, we want to make sure that every constructed
        // component has a valid `#node` property. To be efficient, we only
        // render to set `#node` if it isn't already set yet.
        if (this.node === undefined) {
            this.render();
        }
    }

    // `Component.from()` allows us to transform a pure function that
    // maps arguments to a VDOM tree, and promote it into a full-fledged
    // `Component` class we can compose and use anywhere.
    static from (fn) {
        return class FunctionComponent extends Component {
            init (...args) {
                this.args = args;
            }
            compose () {
                return fn(...this.args);
            }
        };
    }

    // The default `Component#init()` is guaranteed to always be a no-op method
    init () {
        // should be overridden
    }

    // Components usually subscribe to events from a Record, either a view model or
    // a model that maps to business logic. This is shorthand to access that.
    get record () {
        return this.event.source;
    }

    bind (source, handler) {
        this.unbind();

        if (source instanceof Evented) {
            this.event = { source, handler };
            source.addHandler(handler);
        } else {
            throw new Error(`cannot bind to ${source}, which is not an instance of Evented.`);
        }
    }

    unbind () {
        if (this.record) {
            this.record.removeHandler(this.event.handler);
        }

        this.event = emptyEvent();
    }

    // We use `#remove()` to prepare to remove the component from our application
    // entirely. By default, it unsubscribes from all updates. However, the component
    // is still in the render tree -- that's something for the user to decide when to
    // hide.
    remove () {
        this.unbind();
    }

    // `#compose()` is our primary rendering API for components. By default, it renders
    // an invisible comment node.
    compose () {
        return null;
    }

    // `#preprocess()` is an API on the component to allow us to extend `Component` to give
    // it additional capabilities idiomatically. It consumes the result of `#compose()` and
    // returns VDOM to be used to actually render the component. See `Styled()` for a
    // usage example.
    preprocess (vdom) {
        return vdom;
    }

    // `#render()` is called to actually render the component again to the DOM,
    // and Arlo assumes that it's called rarely, only when the component absolutely
    // must update. This obviates the need for something like React's `shouldComponentUpdate`.
    render (data) {
        data = data || (this.record && this.record.summarize());
        const vdom = this.preprocess(this.compose(data), data);

        if (vdom === undefined) {
            // If the developer accidentally forgets to return the VDOM value from
            // compose, instead of leading to a cryptic DOM API error, show a more
            // friendly warning.
            throw new Error(this.constructor.name + '.compose() returned undefined.');
        }

        try {
            this.node = render(this.node, this.vdom, vdom);
        } catch (e) {
            console.error('rendering error.', e);
        }

        return this.vdom = vdom;
    }
}
