import { clipStringEnd } from "./common.js";

/**
 * The `Reader` class represents a sequence of characters we can read from a template.
 */
export class Reader {
  constructor(content) {
    this.index = 0;
    this.content = content;
    this.len = content.length;
  }

  // Returns the current character and moves the pointer one place farther.
  next() {
    const char = this.content[this.index++];
    if (char === undefined) {
      this.index = this.len;
    }
    return char;
  }

  // Move the pointer back one place, undoing the last character read.
  // In practice, we never backtrack from index 0 -- we only use back()
  // to 'un-read' a character we've read. So we don't check for negative cases here.
  back() {
    this.index--;
  }

  // Read up to a specified _contiguous_ substring,
  // but not including the substring.
  readUpTo(substr) {
    const nextIndex = this.content.substring(this.index).indexOf(substr);
    return this.toNext(nextIndex);
  }

  // Read up to and including a _contiguous_ substring, or read until
  // the end of the template.
  readUntil(substr) {
    const nextIndex = this.content.substring(this.index).indexOf(substr) + substr.length;
    return this.toNext(nextIndex);
  }

  // Abstraction used for both `readUpTo` and `readUntil` above.
  toNext(nextIndex) {
    const rest = this.content.substring(this.index);
    if (nextIndex === -1) {
      this.index = this.len;
      return rest;
    } else {
      const part = rest.substring(0, nextIndex);
      this.index += nextIndex;
      return part;
    }
  }

  // Remove some substring from the end of the template, if it ends in the substring.
  // This also returns whether the given substring was a valid ending substring.
  clipEnd(substr) {
    if (this.content.endsWith(substr)) {
      this.content = clipStringEnd(this.content, substr);
      return true;
    }

    return false;
  }
}
