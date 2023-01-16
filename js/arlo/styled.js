import { normalizeArray, isObject } from './common.js';
import { Component } from './component.js';

// We keep track of unique class names already injected into the
// page's stylesheet, so we don't do redundant style reconciliation.
const injectedClassNames = new Set();

// Global pointer to the stylesheet on the page that Arlo uses to insert
// new CSS rules. It's set the first time a styled component renders.
let styledComponentSheet;

// A weak (garbage-collected keys) cache for mapping styles objects to hashes
// class names. If we use the `css` template tag or cache the styles object
// generated in a component in other ways, it's substantially faster to do
// a shallow comparison of styles objects and cache unique classnames than
// to compare the styles objects deeply every time. This cache implements this
// without a huge memory hit in the case of non-cached styles objects, because
// `WeakMap`'s keys are garbage collected.
const INJECTED_STYLES_CACHE = new WeakMap();

// Fast hash function to map a style rule to a very reasonably unique class name
// that won't conflict with other classes on the page. Checks the styles cache first.
const generateUniqueClassName = stylesObject => {
    if (!INJECTED_STYLES_CACHE.has(stylesObject)) {
        // Modified from https://github.com/darkskyapp/string-hash/blob/master/index.js
        const str = JSON.stringify(stylesObject);
        let i = str.length;
        let hash = 1989;

        while (i) {
            hash = (hash * 13) ^ str.charCodeAt(--i);
        }

        INJECTED_STYLES_CACHE.set(stylesObject, '_arlo' + (hash >>> 0));
    }

    return INJECTED_STYLES_CACHE.get(stylesObject);
};

// We have to construct lots of a{b} syntax in CSS, so here's a shorthand.
const brace = (a, b) => a + '{' + b + '}';

// The meat of `Styled()`. This function maps an ergonomic, dictionary-based
// set of CSS declarations to an array of CSS rules that can be inserted onto
// the page stylesheet, and recursively resolves nested CSS, handles keyframes
// and media queries, and parses other SCSS-like things.
const rulesFromStylesObject = (selector, stylesObject) => {
    let rules = [];
    let selfDeclarations = '';

    for (const prop of Object.keys(stylesObject)) {
        const val = stylesObject[prop];

        // CSS declarations that start with '@' are globally namespaced
        // (like @keyframes and @media), so we need to treat them differently.
        if (prop[0] === '@') {
            if (prop.startsWith('@media')) {
                rules.push(brace(prop, rulesFromStylesObject(selector, val).join('')));
            } else { // @keyframes or @font-face
                rules.push(brace(prop, rulesFromStylesObject('', val).join('')));
            }
        } else {
            if (typeof val === 'object') {
                const commaSeparatedProps = prop.split(',');

                for (const p of commaSeparatedProps) {
                    // SCSS-like syntax means we use '&' to nest declarations about
                    // the parent selector.
                    if (p.includes('&')) {
                        const fullSelector = p.replace(/&/g, selector);
                        rules = rules.concat(rulesFromStylesObject(fullSelector, val));
                    } else {
                        rules = rules.concat(rulesFromStylesObject(selector + ' ' + p, val));
                    }
                }
            } else {
                selfDeclarations += prop + ':' + val + ';';
            }
        }
    }

    if (selfDeclarations) {
        // We unshift the self declarations to the beginning of the list of rules
        // instead of simply pushing it to the end, because we want the nested rules
        // to have precedence / override rules on self.
        rules.unshift(brace(selector, selfDeclarations));
    }

    return rules;
};

// Function called once to initialize a stylesheet for Arlo
// to use on every subsequent style render.
const initSheet = () => {
    const styleElement = document.createElement('style');
    styleElement.setAttribute('data-arlo', '');
    document.head.appendChild(styleElement);
    styledComponentSheet = styleElement.sheet;
};

// The preprocessor on `Styled()` components call this to
// make sure a given set of CSS rules for a component is inserted
// into the page stylesheet, but only once for a unique set of rules.
// We disambiguate by the class name, which is a hash of the CSS rules.
const injectStylesOnce = stylesObject => {
    const className = generateUniqueClassName(stylesObject);
    let sheetLength = 0;

    if (!injectedClassNames.has(className)) {
        if (!styledComponentSheet) {
            initSheet();
        }

        const rules = rulesFromStylesObject('.' + className, stylesObject);

        for (const rule of rules) {
            styledComponentSheet.insertRule(rule, sheetLength++);
        }

        injectedClassNames.add(className);
    }

    return className;
};

// Higher-order component to enable styling for any Component class.
export const Styled = Base => {
    return class extends Base {
        // In a styled component, the `#styles()` method is passed in
        // the same data as `#compose()`, and returns a JSON of nested CSS.
        styles () {
            return {};
        }

        preprocess (vdom, data) {
            if (isObject(vdom)) {
                vdom.attrs = vdom.attrs || {};
                vdom.attrs.class = normalizeArray(vdom.attrs.class || []);
                vdom.attrs.class.push(injectStylesOnce(this.styles(data)));
            }

            return vdom;
        }
    };
};

// Provide a default, `StyledComponent` class.
export const StyledComponent = Styled(Component);
