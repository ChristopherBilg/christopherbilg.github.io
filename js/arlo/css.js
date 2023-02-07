import { interpolate } from "./common.js";
import { Reader } from "./reader.js";

/**
 * Helper to convert a string representation of a dict into a JavaScript object, CSS-style.
 * `stringToDict` is recursive to parse nested dictionaries.
 *
 * @param {Reader} reader
 * @returns Nested dictionary of CSS-style objects
 */
const stringToDict = (reader) => {
  // Dictionary to be constructed from this step
  const dict = {};

  // Enums for marking whether we are in a key or value section of a dictionary
  const PROP = 0;
  const VAL = 1;
  let part = PROP;

  // Current key, value pair being parsed
  let current = ["", ""];
  // Utility function to commit the tokens in the current read buffer (`current`) to the
  // result dictionary and move on to the next key-value pair.
  const commit = () => {
    if (typeof current[VAL] === "string") {
      dict[current[PROP].trim()] = current[VAL].trim();
    } else {
      dict[current[PROP].trim()] = current[VAL];
    }

    current = ["", ""];
  };

  // Begin reading the dictionary by stripping off any whitespace before the starting curlybrace.
  reader.readUntil("{");
  // Loop through each character in the string being read...
  for (let next = reader.next(); next !== undefined; next = reader.next()) {
    // If we encounter a closing brace, we assume it's the end of the dictionary at the current
    // level of nesting, so we halt parsing at this step and return.
    if (next === "}") {
      break;
    }

    const p = current[PROP];
    switch (next) {
      case '"':
      case "'":
        // If we encounter quotes, we read blindly until the end of the quoted section,
        // ignoring escaped quotes. This is a slightly strange but simple way to achieve that.
        current[part] += next + reader.readUntil(next);
        while (current[part].endsWith("\\" + next)) {
          current[part] += reader.readUntil(next);
        }

        break;
      case ":":
        // The colon character is ambiguous in SCSS syntax, because it is used
        // for pseudoselectors and pseudoelements, as well as in the dict syntax.
        // We disambiguate by looking at the preceding part of the token.
        if (
          p.trim() === "" || // empty key is not a thing; probably pseudoselector
          p.includes("&") || // probably part of nested SCSS selector
          p.includes("@") || // probably part of media query
          p.includes(":") // probably pseudoselector/ pseudoelement selector
        ) {
          current[part] += next;
        } else {
          part = VAL;
        }

        break;
      case ";":
        // Commit read tokens if we've reached the end of the rule
        part = PROP;
        commit();

        break;
      case "{":
        // If we come across `{`, this means we found a nested structure.
        // We backtrack the reader and recursively call `stringToDict` to parse the nested dict first
        // before moving on.
        reader.back();
        current[VAL] = stringToDict(reader);
        commit();

        break;
      default:
        // For all other characters, just append it to the currently read buffer.
        current[part] += next;

        break;
    }
  }

  // Take care of any dangling CSS rules without a semicolon.
  if (current[PROP].trim() !== "") {
    commit();
  }

  return dict;
};

// Cache for CSS parser outputs
const CSS_CACHE = new Map();

/**
 * A CSS parser that takes a string and returns CSS style objects for VDOM.
 *
 * @param {*} templateParts
 * @param  {...any} dynamicParts
 * @returns Dictionary of CSS style objects to use in the VDOM.
 */
export const css = (templateParts, ...dynamicParts) => {
  // Parse template as a string first
  const result = interpolate(templateParts, dynamicParts).trim();

  // If the CSS rule had not been parsed before (is not in the cache),
  // parse and cache it before returning it.
  if (!CSS_CACHE.has(result)) {
    CSS_CACHE.set(result, stringToDict(new Reader("{" + result + "}")));
  }

  return CSS_CACHE.get(result);
};
