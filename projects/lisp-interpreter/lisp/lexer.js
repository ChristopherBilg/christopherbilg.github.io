/**
 * Lexer for Lisp Interpreter
 *
 * The lexer (also known as a tokenizer or scanner) is the first phase of the
 * interpreter pipeline. It takes raw source code as input and produces a
 * stream of tokens as output.
 *
 * Design Patterns Used:
 * - Iterator Pattern: The Lexer class implements an iterator interface for
 *   consuming tokens one at a time.
 * - Factory Pattern: Token creation is centralized through factory methods.
 * - Flyweight Pattern: Token types are shared constants to reduce memory usage.
 */

/**
 * Token Types - Enumeration of all possible token types in Lisp.
 * Using Object.freeze ensures immutability (Flyweight pattern).
 */
export const TokenType = Object.freeze({
  // Delimiters
  LEFT_PAREN: "LEFT_PAREN",
  RIGHT_PAREN: "RIGHT_PAREN",

  // Literals
  NUMBER: "NUMBER",
  STRING: "STRING",
  SYMBOL: "SYMBOL",

  // Special forms (recognized as symbols but listed for documentation)
  // These include: define, lambda, if, quote, etc.

  // Boolean literals
  TRUE: "TRUE",
  FALSE: "FALSE",

  // Special tokens
  QUOTE: "QUOTE", // The ' shorthand for (quote ...)
  QUASIQUOTE: "QUASIQUOTE", // The ` shorthand
  UNQUOTE: "UNQUOTE", // The , shorthand
  UNQUOTE_SPLICING: "UNQUOTE_SPLICING", // The ,@ shorthand

  // End of input
  EOF: "EOF",
});

/**
 * Token class - Represents a single token in the source code.
 * Immutable data structure holding token information.
 */
export class Token {
  /**
   * Creates a new Token instance.
   *
   * @param {string} type - The token type from TokenType enum
   * @param {*} value - The literal value of the token
   * @param {number} line - Line number where the token appears (1-indexed)
   * @param {number} column - Column number where the token starts (1-indexed)
   */
  constructor(type, value, line, column) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
    Object.freeze(this);
  }

  /**
   * Returns a string representation of the token for debugging.
   *
   * @returns {string} String representation
   */
  toString() {
    return `Token(${this.type}, ${JSON.stringify(this.value)}, ${this.line}:${this.column})`;
  }
}

/**
 * LexerError class - Custom error for lexer-related issues.
 * Provides detailed error messages with location information.
 */
export class LexerError extends Error {
  /**
   * Creates a new LexerError.
   *
   * @param {string} message - Error description
   * @param {number} line - Line number where the error occurred
   * @param {number} column - Column number where the error occurred
   */
  constructor(message, line, column) {
    super(`Lexer Error at ${line}:${column}: ${message}`);
    this.name = "LexerError";
    this.line = line;
    this.column = column;
  }
}

/**
 * Lexer class - Tokenizes Lisp source code.
 *
 * The lexer maintains internal state as it scans through the source code,
 * tracking the current position, line, and column. It implements the
 * Iterator pattern, allowing tokens to be consumed one at a time.
 *
 * Usage:
 *   const lexer = new Lexer("(define x 42)");
 *   const tokens = lexer.tokenize();
 *   // or iterate manually:
 *   let token;
 *   while ((token = lexer.nextToken()).type !== TokenType.EOF) {
 *     console.log(token);
 *   }
 */
export class Lexer {
  /**
   * Creates a new Lexer instance.
   *
   * @param {string} source - The Lisp source code to tokenize
   */
  constructor(source) {
    this.source = source;
    this.position = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
  }

  /**
   * Returns the current character without advancing the position.
   *
   * @returns {string|null} Current character or null if at end
   */
  peek() {
    if (this.isAtEnd()) {
      return null;
    }
    return this.source[this.position];
  }

  /**
   * Returns the next character without advancing the position.
   *
   * @returns {string|null} Next character or null if at end
   */
  peekNext() {
    if (this.position + 1 >= this.source.length) {
      return null;
    }
    return this.source[this.position + 1];
  }

  /**
   * Consumes and returns the current character, advancing the position.
   *
   * @returns {string|null} The consumed character or null if at end
   */
  advance() {
    if (this.isAtEnd()) {
      return null;
    }

    const char = this.source[this.position];
    this.position++;

    if (char === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }

    return char;
  }

  /**
   * Checks if we've reached the end of the source code.
   *
   * @returns {boolean} True if at end, false otherwise
   */
  isAtEnd() {
    return this.position >= this.source.length;
  }

  /**
   * Skips whitespace and comments.
   * Comments in Lisp start with ';' and continue to end of line.
   */
  skipWhitespaceAndComments() {
    while (!this.isAtEnd()) {
      const char = this.peek();

      if (char === " " || char === "\t" || char === "\n" || char === "\r") {
        this.advance();
      } else if (char === ";") {
        // Skip comment until end of line
        while (!this.isAtEnd() && this.peek() !== "\n") {
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  /**
   * Creates a token using the factory pattern.
   *
   * @param {string} type - Token type
   * @param {*} value - Token value
   * @param {number} startLine - Line where token started
   * @param {number} startColumn - Column where token started
   * @returns {Token} The created token
   */
  createToken(type, value, startLine, startColumn) {
    return new Token(type, value, startLine, startColumn);
  }

  /**
   * Scans a number literal.
   * Supports integers and floating-point numbers, including negative numbers.
   *
   * @returns {Token} Number token
   */
  scanNumber() {
    const startLine = this.line;
    const startColumn = this.column;
    let value = "";

    // Handle negative sign
    if (this.peek() === "-") {
      value += this.advance();
    }

    // Scan integer part
    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      value += this.advance();
    }

    // Scan decimal part if present
    if (this.peek() === "." && this.isDigit(this.peekNext())) {
      value += this.advance(); // consume '.'
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    // Scan exponent part if present (e.g., 1e10, 2.5E-3)
    if (this.peek() === "e" || this.peek() === "E") {
      value += this.advance();
      if (this.peek() === "+" || this.peek() === "-") {
        value += this.advance();
      }
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    return this.createToken(TokenType.NUMBER, parseFloat(value), startLine, startColumn);
  }

  /**
   * Scans a string literal.
   * Strings are enclosed in double quotes and support escape sequences.
   *
   * @returns {Token} String token
   * @throws {LexerError} If string is unterminated
   */
  scanString() {
    const startLine = this.line;
    const startColumn = this.column;
    let value = "";

    // Consume opening quote
    this.advance();

    while (!this.isAtEnd() && this.peek() !== '"') {
      if (this.peek() === "\\") {
        // Handle escape sequences
        this.advance();
        const escaped = this.advance();

        switch (escaped) {
          case "n":
            value += "\n";
            break;
          case "t":
            value += "\t";
            break;
          case "r":
            value += "\r";
            break;
          case "\\":
            value += "\\";
            break;
          case '"':
            value += '"';
            break;
          default:
            value += escaped;
        }
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw new LexerError("Unterminated string", startLine, startColumn);
    }

    // Consume closing quote
    this.advance();

    return this.createToken(TokenType.STRING, value, startLine, startColumn);
  }

  /**
   * Scans a symbol (identifier).
   * Symbols can contain letters, digits, and special characters like
   * +, -, *, /, =, <, >, !, ?, _, etc.
   *
   * @returns {Token} Symbol, TRUE, or FALSE token
   */
  scanSymbol() {
    const startLine = this.line;
    const startColumn = this.column;
    let value = "";

    while (!this.isAtEnd() && this.isSymbolChar(this.peek())) {
      value += this.advance();
    }

    // Check for boolean literals
    if (value === "#t" || value === "#T" || value === "true") {
      return this.createToken(TokenType.TRUE, true, startLine, startColumn);
    }
    if (value === "#f" || value === "#F" || value === "false") {
      return this.createToken(TokenType.FALSE, false, startLine, startColumn);
    }

    return this.createToken(TokenType.SYMBOL, value, startLine, startColumn);
  }

  /**
   * Checks if a character is a digit.
   *
   * @param {string} char - Character to check
   * @returns {boolean} True if digit
   */
  isDigit(char) {
    return char !== null && char >= "0" && char <= "9";
  }

  /**
   * Checks if a character is a letter.
   *
   * @param {string} char - Character to check
   * @returns {boolean} True if letter
   */
  isLetter(char) {
    return char !== null && ((char >= "a" && char <= "z") || (char >= "A" && char <= "Z"));
  }

  /**
   * Checks if a character can be part of a symbol.
   * Lisp symbols are quite permissive in allowed characters.
   *
   * @param {string} char - Character to check
   * @returns {boolean} True if valid symbol character
   */
  isSymbolChar(char) {
    if (char === null) return false;

    // Symbols cannot contain whitespace, parentheses, quotes, or semicolons
    const invalid = " \t\n\r()[]{}\"';`,";
    return !invalid.includes(char);
  }

  /**
   * Checks if the current position starts a number.
   * This handles the case where '-' could be a minus sign or negative number.
   *
   * @returns {boolean} True if starting a number
   */
  startsNumber() {
    const char = this.peek();

    if (this.isDigit(char)) {
      return true;
    }

    // Check for negative number: '-' followed by digit
    if (char === "-" && this.isDigit(this.peekNext())) {
      return true;
    }

    return false;
  }

  /**
   * Scans and returns the next token.
   * This is the main entry point for the iterator pattern.
   *
   * @returns {Token} The next token
   * @throws {LexerError} If an unexpected character is encountered
   */
  nextToken() {
    this.skipWhitespaceAndComments();

    if (this.isAtEnd()) {
      return this.createToken(TokenType.EOF, null, this.line, this.column);
    }

    const startLine = this.line;
    const startColumn = this.column;
    const char = this.peek();

    // Single-character tokens
    switch (char) {
      case "(":
        this.advance();
        return this.createToken(TokenType.LEFT_PAREN, "(", startLine, startColumn);

      case ")":
        this.advance();
        return this.createToken(TokenType.RIGHT_PAREN, ")", startLine, startColumn);

      case "'":
        this.advance();
        return this.createToken(TokenType.QUOTE, "'", startLine, startColumn);

      case "`":
        this.advance();
        return this.createToken(TokenType.QUASIQUOTE, "`", startLine, startColumn);

      case ",":
        this.advance();
        // Check for ,@ (unquote-splicing)
        if (this.peek() === "@") {
          this.advance();
          return this.createToken(TokenType.UNQUOTE_SPLICING, ",@", startLine, startColumn);
        }
        return this.createToken(TokenType.UNQUOTE, ",", startLine, startColumn);

      case '"':
        return this.scanString();
    }

    // Numbers
    if (this.startsNumber()) {
      return this.scanNumber();
    }

    // Symbols (identifiers, operators, etc.)
    if (this.isSymbolChar(char)) {
      return this.scanSymbol();
    }

    throw new LexerError(`Unexpected character: '${char}'`, startLine, startColumn);
  }

  /**
   * Tokenizes the entire source code and returns an array of tokens.
   * The array always ends with an EOF token.
   *
   * @returns {Token[]} Array of all tokens
   */
  tokenize() {
    this.tokens = [];

    let token;
    do {
      token = this.nextToken();
      this.tokens.push(token);
    } while (token.type !== TokenType.EOF);

    return this.tokens;
  }

  /**
   * Resets the lexer to the beginning of the source.
   * Useful for re-scanning the same source code.
   */
  reset() {
    this.position = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
  }

  /**
   * Creates a new Lexer from source and returns all tokens.
   * Static factory method for convenience.
   *
   * @param {string} source - Source code to tokenize
   * @returns {Token[]} Array of tokens
   */
  static tokenize(source) {
    return new Lexer(source).tokenize();
  }
}
