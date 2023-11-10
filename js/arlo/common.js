/**
 * Normalize an input to enforce array data struture.
 *
 * @param {*} data
 * @returns Array of data or data if already an array type.
 */
export const normalizeArray = (data) => (Array.isArray(data) ? data : [data]);

/**
 * Returned true if 'object' is an object; otherwise, false.
 *
 * @param {*} object
 * @returns Boolean.
 */
export const isObject = (object) => object !== null && typeof object === "object";

/**
 * Clip the end of a given string by the length of a substring
 *
 * @param {*} base
 * @param {*} substr
 * @returns Base from [0 .. substr.length]
 */
export const clipStringEnd = (base, substr) => base.substring(0, base.length - substr.length);

/**
 * Interpolate between lists of strings into a single string. Used to
 * merge the two parts of a template tag's arguments.
 *
 * @param {*} templateParts
 * @param {*} dynamicParts
 * @returns Concatenation of dynamic and template strings.
 */
export const interpolate = (templateParts, dynamicParts) => {
  let str = templateParts[0];

  for (let index = 1, len = dynamicParts.length; index <= len; index++) {
    str += dynamicParts[index - 1] + templateParts[index];
  }

  return str;
};
