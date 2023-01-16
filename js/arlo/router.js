import { Evented } from './evented.js';

/**
 * Helper function for the router. It takes a route string
 * that contains parameters like, `/path/:param1/path/:param2`
 * and returns a regular expression to match that route
 * and a list of params in that route.
 *
 * @param {*} route
 * @returns Regular expression and list of parameter names
 */
const routeStringToRegExp = route => {
    let match;
    const parameterNames = [];

    while (match !== null) {
        match = (/:\w+/).exec(route);
        if (match) {
            const parameterName = match[0];
            parameterNames.push(parameterName.substring(1));
            route = route.replace(parameterName, '(.+)');
        }
    }

    return [new RegExp(route), parameterNames];
};

/**
 * Front-end router. A routing component can bind
 * to updates from the Router instead of a Record, and re-render
 * different subviews when the routes change.
 */
export class Router extends Evented {
    constructor (routes) {
        super();

        // We parse the given dictionary of routes into three things:
        // the name of the route, the route regular expression, and
        // the list of params in that route.
        this.routes = Object.entries(routes).map(([name, route]) => [name, ...routeStringToRegExp(route)]);

        // Last matched route's information is cached here
        this.lastMatch = ['', null];

        // Whenever the browser pops the history state (i.e. when the user
        // goes back with the back button or forward with the forward button),
        // we need to route again.
        this._cb = () => this.route(location.pathname);
        window.addEventListener('popstate', this._cb);

        // Route the current URL, if it's already a deep link to a path.
        this._cb();
    }

    // The 'summary' of this Evented (components can bind to this object)
    // is the information about the last route.
    summarize () {
        return this.lastMatch;
    }

    // Click events from links can call `this.go()` with the destination URL
    // to trigger going to a new route without reloading the page. New routes
    // are only added to the session history if the route is indeed new.
    go (destination, { replace = false } = {}) {
        if (window.location.pathname !== destination) {
            if (replace) {
                history.replaceState(null, document.title, destination);
            } else {
                history.pushState(null, document.title, destination);
            }

            this.route(destination);
        }
    }

    // Main procedure to reconcile which of the defined route the current
    // location path matches, and dispatch the right event. Routes are checked
    // in order of declaration.
    route (path) {
        // Match destination against the route regular expressions
        for (const [name, routeRe, paramNames] of this.routes) {
            const match = routeRe.exec(path);

            if (match !== null) {
                const result = {};
                const paramValues = match.slice(1);

                // Given the matched values and parameter names,
                // build a dictionary of params that components can use
                // to re-render based on the route.
                paramNames.forEach((name, i) => result[name] = paramValues[i]);
                this.lastMatch = [name, result];

                break;
            }
        }

        this.emitEvent();
    }

    // When we don't want the router to work anymore / stop listening / be gc'd,
    // we can call `#remove()` to do just that.
    remove () {
        window.removeEventListener('popstate', this._cb);
    }
};
