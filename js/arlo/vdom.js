import { clipStringEnd, interpolate, isObject } from "./common.js";
import { Reader } from "./reader.js";

// This allows us to write HTML entities like '<' and '>' without breaking
// the HTML parser.
const decodeEntity = (entity) => {
  return String.fromCodePoint(+/&#(\w+);/.exec(entity)[1]);
};

// For converting CSS property names to their JavaScript counterparts
const kebabToCamel = (kebabStr) => {
  let result = "";
  for (let i = 0, len = kebabStr.length; i < len; i++) {
    result += kebabStr[i] === "-" ? kebabStr[++i].toUpperCase() : kebabStr[i];
  }
  return result;
};

// Pure function to parse the contents of an HTML opening tag to a VDOM stub
const parseOpeningTagContents = (content) => {
  // If the opening tag is just the tag name (the most common case), take
  // a shortcut and run a simpler algorithm.
  content = content.trim();
  if (content[0] === "!") {
    // comment
    return {
      vdom: null,
      selfClosing: true,
    };
  } else if (!content.includes(" ")) {
    const selfClosing = content.endsWith("/");

    return {
      vdom: {
        tag: selfClosing ? clipStringEnd(content, "/") : content,
        attrs: {},
        events: {},
      },
      selfClosing: selfClosing,
    };
  }

  // Make another reader to read the tag contents
  const reader = new Reader(content);
  const selfClosing = reader.clipEnd("/");

  // Read the individual characters into a list of tokens:
  // things that may be attribute names, and values.
  let head = "";

  // Are we waiting to read an attribute value?
  let waitingForAttr = false;

  // Are we in a quoted attribute value?
  let inQuotes = false;

  // Array of parsed tokens
  const tokens = [];
  const TYPE_KEY = 0;
  const TYPE_VALUE = 1;

  // Is the next token a key or a value? This is determined by the presence
  // of equals signs `=`, quotations, and whitespace.
  let nextType = TYPE_KEY;

  // Commit what's currently read as a new token.
  const commitToken = (force) => {
    head = head.trim();

    if (head !== "" || force) {
      tokens.push({
        type: nextType,
        value: head,
      });

      waitingForAttr = false;
      head = "";
    }
  };

  // Iterate through each read character from the reader and parse the character
  // stream into tokens.
  for (let next = reader.next(); next !== undefined; next = reader.next()) {
    switch (next) {
      // Equals sign denotes the start of an attribute value unless in quotes
      case "=":
        if (inQuotes) {
          head += next;
        } else {
          commitToken();
          waitingForAttr = true;
          nextType = TYPE_VALUE;
        }

        break;
      // Because we replaced all whitespace with spaces earlier, this catches
      // all whitespaces. Whitespaces are only meaningful separates of values
      // if we're not in quotes.
      case " ":
        if (inQuotes) {
          head += next;
        } else if (!waitingForAttr) {
          commitToken();
          nextType = TYPE_KEY;
        }

        break;
      // Allow backslash to escape characters if we're in quotes.
      case "\\":
        if (inQuotes) {
          next = reader.next();
          head += next;
        }

        break;
      // If we're in quotes, '"' escapes quotes. Otherwise, it opens
      // a quoted section.
      case '"':
        if (inQuotes) {
          inQuotes = false;
          commitToken(true);
          nextType = TYPE_KEY;
        } else if (nextType === TYPE_VALUE) {
          inQuotes = true;
        }

        break;
      default:
        // Append all other characters to the head
        head += next;
        waitingForAttr = false;

        break;
    }
  }

  // If we haven't committed any last-read tokens, commit it now.
  commitToken();

  // Now, we parse the tokens into tag, attribute, and events values in the VDOM.
  let tag = "";
  const attrs = {};
  const events = {};

  // The tag name is always the first token
  tag = tokens.shift().value;
  let last = null;
  let curr = tokens.shift();

  // Function to step through to the next token
  const step = () => {
    last = curr;
    curr = tokens.shift();
  };

  // Walk through the token list. If the token is a value token,
  // the previous token is its key. If the current token is a key,
  // the previous token is an attribute without value (like `disabled`).
  while (curr !== undefined) {
    if (curr.type === TYPE_VALUE) {
      const key = last.value;
      let val = curr.value.trim();

      // Commit a key-value pair of string attributes to the VDOM stub. This section
      // treats class lists and style dictionaries separately, and adds function
      // values as event handlers.
      if (key.startsWith("on")) {
        events[key.substring(2)] = [val];
      } else {
        if (key === "class") {
          if (val !== "") {
            attrs[key] = val.split(" ");
          }
        } else if (key === "style") {
          if (val.endsWith(";")) {
            val = val.substring(0, val.length - 1);
          }

          const rule = {};

          for (const pair of val.split(";")) {
            const idx = pair.indexOf(":");
            const first = pair.substring(0, idx);
            const rest = pair.substring(idx + 1);
            rule[kebabToCamel(first.trim())] = rest.trim();
          }

          attrs[key] = rule;
        } else {
          attrs[key] = val;
        }
      }

      step();
    } else if (last) {
      attrs[last.value] = true;
    }

    step();
  }

  // If the last value is a value-less attribute (like `disabled`), commit it.
  if (last && last.type === TYPE_KEY) {
    attrs[last.value] = true;
  }

  return {
    vdom: {
      tag: tag,
      attrs: attrs,
      events: events,
    },
    selfClosing: selfClosing,
  };
};

// Function to parse an entire VDOM template tree (which we vaguely call JSX here).
// This recursively calls itself on children elements.
const parseTemplate = (reader) => {
  const result = [];

  // The current VDOM object being worked on. Sort of an 'element register'
  let currentElement = null;

  // Are we reading a text node (and should ignore special characters)?
  let inTextNode = false;

  // Commit currently reading element to the result list, and reset the current element
  const commit = () => {
    // If the text node we're about to commit is just whitespace, don't bother
    if (inTextNode && currentElement.trim() === "") {
      // pass
    } else if (currentElement) {
      result.push(currentElement);
    }

    currentElement = null;
    inTextNode = false;
  };

  // Shortcut to handle/commit string tokens properly, which we do more than once below.
  const handleString = (next) => {
    if (inTextNode === false) {
      commit();
      inTextNode = true;
      currentElement = "";
    }

    currentElement += next;
  };

  // Main parsing logic. This might be confusingly recursive. In essence, the parser
  // recursively calls itself with its `reader` if it has children to parse,
  // and trusts that the parser will return when it encounters the closing tag
  // that marks the end of the list of children. So, the parser breaks the loop
  // and returns if it encounters a closing tag. This cooperation between the function
  // and the parent function that called it recursively makes this parser work.
  for (let next = reader.next(); next !== undefined; next = reader.next()) {
    // if we see the start of a tag ...
    if (next === "<") {
      // ... first commit any previous reads, since we're starting a new node ...
      commit();

      // ... it's an opening tag if the next character isn't `'/'`.
      if (reader.next() !== "/") {
        reader.back();

        // Read and parse the contents of the tag up to the end of
        // the opening tag.
        const result = parseOpeningTagContents(reader.readUpTo(">"));
        reader.next(); // read the '>'
        currentElement = result && result.vdom;

        // If the current element is a full-fledged element (and not a comment
        // or text node), let's try to parse the children by handing the reader
        // to a recursively call of this function.
        if (!result.selfClosing && currentElement !== null) {
          currentElement.children = parseTemplate(reader);
        }

        // ... it's a closing tag otherwise ...
      } else {
        // ... so finish out reading the closing tag.
        // A top-level closing tag means it's actually closing the parent tag, so
        // we need to stop parsing and hand the parsing flow back to the parent
        // call in this recursive function.
        reader.readUntil(">");

        break;
      }
    } else {
      // If an HTML entity is encoded (e.g. &#60; is '<'), decode it and handle it.
      if (next === "&") {
        handleString(decodeEntity(next + reader.readUntil(";")));
      } else {
        handleString(next);
      }
    }
  }

  // Commit any last remaining tokens as-is
  commit();

  return result;
};

// Cache for `vdom`, keyed by the string parts, value is a function that takes the dynamic
// parts of the template as input and returns the result of parseTemplate. We make an assumption
// here that the user of the template won't swap between having an element attribute being
// a function once and something that isn't a function the next time. In practice this is fine.
const VDOM_CACHE = new Map();

// This HTML parsing algorithm works by replacing all the dynamic parts with a unique string,
// parsing the string markup into a JSON tree, and caching that tree. On renders, we walk the tree
// and replace any matching strings with their correct dynamic parts. This makes the algorithm
// cache-friendly and relatively fast, despite doing a lot at runtime. `VDOM_PLACEHOLDER_RE` is
// the regex we use to correlate string keys to their correct dynamic parts.
const VDOM_PLACEHOLDER_RE = /vdom_tpl_obj_\[(\d+)\]/;

// This is for a performance optimization, that when we're filling out template
// strings, if a string in which we're searching for a placeholder is shorter than
// placeholder strings, we just stop searching.
const VDOM_PLACEHOLDER_MIN_LENGTH = 14;

// Does a given string have a placeholder for the template values?
const hasPlaceholder = (str) => typeof str === "string" && str.includes("vdom_tpl_");

// **Utility functions for walking a JSON tree and filling in placeholders**
// The functions here that take mutable values (arrays, objects) will mutate the
// given value to be faster than creating new objects.

// Given a string, replace placeholders with their correct dynamic parts and return
// the result as an array, so if any dynamic values are objects or HTML nodes, they
// are not cast to strings. Used to parse HTML children.
const splitByPlaceholder = (str, dynamicParts) => {
  if (hasPlaceholder(str)) {
    const match = VDOM_PLACEHOLDER_RE.exec(str);
    const parts = str.split(match[0]);
    const number = match[1];
    const processedBack = splitByPlaceholder(parts[1], dynamicParts);

    let result = [];

    if (parts[0] !== "") {
      result.push(parts[0]);
    }

    if (Array.isArray(dynamicParts[number])) {
      result = result.concat(dynamicParts[number]);
    } else {
      result.push(dynamicParts[number]);
    }

    if (processedBack.length !== 0) {
      result = result.concat(processedBack);
    }

    return result;
  } else {
    return str !== "" ? [str] : [];
  }
};

// Given an array of child VDOM elements, flatten that list of children
// into a flat array and parse any placeholders in it.
const replaceChildrenToFlatArray = (children, dynamicParts) => {
  const newChildren = [];

  for (const childString of children) {
    for (const child of splitByPlaceholder(childString, dynamicParts)) {
      if (isObject(child)) {
        replaceInObjectLiteral(child, dynamicParts);
      }

      newChildren.push(child);
    }
  }

  const first = newChildren[0];
  const last = newChildren[newChildren.length - 1];

  if (typeof first === "string" && first.trim() === "") {
    newChildren.shift();
  }

  if (typeof last === "string" && last.trim() === "") {
    newChildren.pop();
  }

  return newChildren;
};

// Given a string, replace any placeholder values and return a new string.
const replaceInString = (str, dynamicParts) => {
  // As an optimization, if the string is too short to contain placeholders,
  // just return early.
  if (str.length < VDOM_PLACEHOLDER_MIN_LENGTH) {
    return str;
  } else {
    const match = VDOM_PLACEHOLDER_RE.exec(str);

    if (match === null) {
      return str;
    } else if (str.trim() === match[0]) {
      return dynamicParts[match[1]];
    } else {
      const parts = str.split(match[0]);

      return parts[0] + dynamicParts[match[1]] + replaceInString(parts[1], dynamicParts);
    }
  }
};

// Given an array literal, replace placeholders in it and its children, recursively.
const replaceInArrayLiteral = (arr, dynamicParts) => {
  for (let i = 0, len = arr.length; i < len; i++) {
    const val = arr[i];

    if (typeof val === "string") {
      arr[i] = replaceInString(val, dynamicParts);
    } else if (Array.isArray(val)) {
      replaceInArrayLiteral(val, dynamicParts);
    } else {
      // it's an object otherwise
      replaceInObjectLiteral(val, dynamicParts);
    }
  }
};

// Given an object, replace placeholders in it and its values.
const replaceInObjectLiteral = (obj, dynamicParts) => {
  if (obj instanceof Node) {
    return;
  }

  for (const prop of Object.keys(obj)) {
    const val = obj[prop];

    if (typeof val === "string") {
      obj[prop] = replaceInString(val, dynamicParts);
    } else if (Array.isArray(val)) {
      if (prop === "children") {
        // We need to treat children of VDOM objects differently because
        // they need to all be flat arrays, and sometimes for API convenience
        // they're passed in as nested arrays.
        obj.children = replaceChildrenToFlatArray(val, dynamicParts);
      } else {
        replaceInArrayLiteral(val, dynamicParts);
      }
    } else if (isObject(val)) {
      replaceInObjectLiteral(val, dynamicParts);
    }
  }
};

// `vdom` template tag, using the VDOM parsed templates cache from above.
export const vdom = (tplParts, ...dynamicParts) => {
  // The key for our cache is just the string parts, joined together with a unique joiner string.
  const cacheKey = tplParts.join("vdom_tpl_joiner");

  try {
    // If we don't have the template in cache, we need to put a translator function
    // in the cache now.
    if (!VDOM_CACHE.has(cacheKey)) {
      // Generate placeholder string values for each dynamic value in the template
      const dpPlaceholders = dynamicParts.map((_obj, i) => `vdom_tpl_obj_[${i}]`);

      // Make a new reader, interpolating the template's static and dynamic parts together.
      const reader = new Reader(
        interpolate(
          tplParts.map((part) => part.replace(/\s+/g, " ")),
          dpPlaceholders
        )
      );

      // Parse the template and take the first child, if there are more, as the element we care about.
      const result = parseTemplate(reader)[0];
      const resultType = typeof result;
      const resultString = JSON.stringify(result);

      // Put a function into the cache that translates an array of the dynamic parts of a template
      // into the full VDOM for the template.
      VDOM_CACHE.set(cacheKey, (dynamicParts) => {
        if (resultType === "string") {
          // If the result of the template is just a string, replace stuff in the string
          return replaceInString(result, dynamicParts);
        } else if (resultType === "object") {
          // Recall that the template translating functions above mutate the object passed
          // in wherever possible. so we make a brand-new object to represent a new result.
          const target = {};

          // Since the non-dynamic parts of VDOM objects are by definition completely JSON
          // serializable, this is a good enough way to deep-copy the cached result of `parseTemplate()`.
          const template = JSON.parse(resultString);
          replaceInObjectLiteral(Object.assign(target, template), dynamicParts);

          return target;
        }

        return null;
      });
    }

    // Now that we have a translator function in the cache, call that to get a new template result.
    return VDOM_CACHE.get(cacheKey)(dynamicParts);
  } catch (e) {
    console.error(
      `vdom parse error.\ncheck for mismatched brackets, tags, quotes.\n${interpolate(tplParts, dynamicParts)}\n${
        e.stack || e
      }`
    );
    return "";
  }
};
