/**
 * Parser for Lisp Interpreter
 *
 * The parser is the second phase of the interpreter pipeline. It takes a
 * stream of tokens from the lexer and produces an Abstract Syntax Tree (AST)
 * as output.
 *
 * Design Patterns Used:
 * - Recursive Descent Parser: A top-down parsing technique where each
 *   grammar rule is implemented as a function.
 * - Composite Pattern: The AST nodes form a tree structure where each node
 *   can contain other nodes.
 * - Visitor Pattern (prepared for): The AST node types are designed to be
 *   easily traversable by visitors (evaluator, printer, etc.).
 */

import { Lexer, Token, TokenType } from "./lexer.js";

/**
 * AST Node Types - Enumeration of all possible AST node types.
 * Using Object.freeze ensures immutability.
 */
export const NodeType = Object.freeze({
  // Atoms (leaf nodes)
  NUMBER: "NUMBER",
  STRING: "STRING",
  SYMBOL: "SYMBOL",
  BOOLEAN: "BOOLEAN",

  // Compound expressions
  LIST: "LIST", // General list expression (function call, special form, etc.)
  QUOTED: "QUOTED", // Quoted expression '(...)
  QUASIQUOTED: "QUASIQUOTED", // Quasiquoted expression `(...)
  UNQUOTED: "UNQUOTED", // Unquoted expression ,(...)
  UNQUOTE_SPLICED: "UNQUOTE_SPLICED", // Unquote-spliced expression ,@(...)

  // Program root
  PROGRAM: "PROGRAM",
});

/**
 * Base AST Node class.
 * All AST nodes inherit from this class.
 */
export class ASTNode {
  /**
   * Creates a new AST node.
   *
   * @param {string} type - The node type from NodeType enum
   * @param {number} line - Line number where the node starts
   * @param {number} column - Column number where the node starts
   */
  constructor(type, line, column) {
    this.type = type;
    this.line = line;
    this.column = column;
  }

  /**
   * Accept method for the Visitor pattern.
   * Override in subclasses to call the appropriate visitor method.
   *
   * @param {object} visitor - The visitor object
   * @returns {*} Result from the visitor
   */
  accept(visitor) {
    throw new Error("accept() must be implemented by subclass");
  }
}

/**
 * Number literal node.
 */
export class NumberNode extends ASTNode {
  /**
   * Creates a number node.
   *
   * @param {number} value - The numeric value
   * @param {number} line - Line number
   * @param {number} column - Column number
   */
  constructor(value, line, column) {
    super(NodeType.NUMBER, line, column);
    this.value = value;
  }

  accept(visitor) {
    return visitor.visitNumber(this);
  }

  toString() {
    return `${this.value}`;
  }
}

/**
 * String literal node.
 */
export class StringNode extends ASTNode {
  /**
   * Creates a string node.
   *
   * @param {string} value - The string value
   * @param {number} line - Line number
   * @param {number} column - Column number
   */
  constructor(value, line, column) {
    super(NodeType.STRING, line, column);
    this.value = value;
  }

  accept(visitor) {
    return visitor.visitString(this);
  }

  toString() {
    return `"${this.value}"`;
  }
}

/**
 * Symbol (identifier) node.
 */
export class SymbolNode extends ASTNode {
  /**
   * Creates a symbol node.
   *
   * @param {string} name - The symbol name
   * @param {number} line - Line number
   * @param {number} column - Column number
   */
  constructor(name, line, column) {
    super(NodeType.SYMBOL, line, column);
    this.name = name;
  }

  accept(visitor) {
    return visitor.visitSymbol(this);
  }

  toString() {
    return this.name;
  }
}

/**
 * Boolean literal node.
 */
export class BooleanNode extends ASTNode {
  /**
   * Creates a boolean node.
   *
   * @param {boolean} value - The boolean value
   * @param {number} line - Line number
   * @param {number} column - Column number
   */
  constructor(value, line, column) {
    super(NodeType.BOOLEAN, line, column);
    this.value = value;
  }

  accept(visitor) {
    return visitor.visitBoolean(this);
  }

  toString() {
    return this.value ? "#t" : "#f";
  }
}

/**
 * List expression node.
 * Represents function calls, special forms, and data lists.
 */
export class ListNode extends ASTNode {
  /**
   * Creates a list node.
   *
   * @param {ASTNode[]} elements - The list elements
   * @param {number} line - Line number
   * @param {number} column - Column number
   */
  constructor(elements, line, column) {
    super(NodeType.LIST, line, column);
    this.elements = elements;
  }

  accept(visitor) {
    return visitor.visitList(this);
  }

  toString() {
    return `(${this.elements.map((e) => e.toString()).join(" ")})`;
  }
}

/**
 * Quoted expression node.
 * Represents 'expr or (quote expr).
 */
export class QuotedNode extends ASTNode {
  /**
   * Creates a quoted node.
   *
   * @param {ASTNode} expression - The quoted expression
   * @param {number} line - Line number
   * @param {number} column - Column number
   */
  constructor(expression, line, column) {
    super(NodeType.QUOTED, line, column);
    this.expression = expression;
  }

  accept(visitor) {
    return visitor.visitQuoted(this);
  }

  toString() {
    return `'${this.expression.toString()}`;
  }
}

/**
 * Quasiquoted expression node.
 * Represents `expr or (quasiquote expr).
 */
export class QuasiquotedNode extends ASTNode {
  /**
   * Creates a quasiquoted node.
   *
   * @param {ASTNode} expression - The quasiquoted expression
   * @param {number} line - Line number
   * @param {number} column - Column number
   */
  constructor(expression, line, column) {
    super(NodeType.QUASIQUOTED, line, column);
    this.expression = expression;
  }

  accept(visitor) {
    return visitor.visitQuasiquoted(this);
  }

  toString() {
    return `\`${this.expression.toString()}`;
  }
}

/**
 * Unquoted expression node.
 * Represents ,expr or (unquote expr).
 */
export class UnquotedNode extends ASTNode {
  /**
   * Creates an unquoted node.
   *
   * @param {ASTNode} expression - The unquoted expression
   * @param {number} line - Line number
   * @param {number} column - Column number
   */
  constructor(expression, line, column) {
    super(NodeType.UNQUOTED, line, column);
    this.expression = expression;
  }

  accept(visitor) {
    return visitor.visitUnquoted(this);
  }

  toString() {
    return `,${this.expression.toString()}`;
  }
}

/**
 * Unquote-spliced expression node.
 * Represents ,@expr or (unquote-splicing expr).
 */
export class UnquoteSplicedNode extends ASTNode {
  /**
   * Creates an unquote-spliced node.
   *
   * @param {ASTNode} expression - The unquote-spliced expression
   * @param {number} line - Line number
   * @param {number} column - Column number
   */
  constructor(expression, line, column) {
    super(NodeType.UNQUOTE_SPLICED, line, column);
    this.expression = expression;
  }

  accept(visitor) {
    return visitor.visitUnquoteSpliced(this);
  }

  toString() {
    return `,@${this.expression.toString()}`;
  }
}

/**
 * Program node - the root of the AST.
 * Contains a list of top-level expressions.
 */
export class ProgramNode extends ASTNode {
  /**
   * Creates a program node.
   *
   * @param {ASTNode[]} expressions - The top-level expressions
   */
  constructor(expressions) {
    super(NodeType.PROGRAM, 1, 1);
    this.expressions = expressions;
  }

  accept(visitor) {
    return visitor.visitProgram(this);
  }

  toString() {
    return this.expressions.map((e) => e.toString()).join("\n");
  }
}

/**
 * ParserError class - Custom error for parser-related issues.
 * Provides detailed error messages with location information.
 */
export class ParserError extends Error {
  /**
   * Creates a new ParserError.
   *
   * @param {string} message - Error description
   * @param {Token} token - The token where the error occurred
   */
  constructor(message, token) {
    const location = token ? `${token.line}:${token.column}` : "unknown";
    super(`Parser Error at ${location}: ${message}`);
    this.name = "ParserError";
    this.token = token;
  }
}

/**
 * Parser class - Parses tokens into an AST.
 *
 * The parser uses recursive descent to parse the token stream. Lisp has
 * a very simple grammar:
 *
 *   program    -> expression* EOF
 *   expression -> atom | list | quoted | quasiquoted | unquoted | unquote-spliced
 *   atom       -> NUMBER | STRING | SYMBOL | TRUE | FALSE
 *   list       -> '(' expression* ')'
 *   quoted     -> "'" expression
 *   quasiquoted -> "`" expression
 *   unquoted   -> "," expression
 *   unquote-spliced -> ",@" expression
 *
 * Usage:
 *   const parser = new Parser(tokens);
 *   const ast = parser.parse();
 *   // or from source directly:
 *   const ast = Parser.parse("(define x 42)");
 */
export class Parser {
  /**
   * Creates a new Parser instance.
   *
   * @param {Token[]} tokens - The tokens to parse
   */
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
  }

  /**
   * Returns the current token without advancing.
   *
   * @returns {Token} The current token
   */
  peek() {
    return this.tokens[this.position];
  }

  /**
   * Returns the previous token.
   *
   * @returns {Token} The previous token
   */
  previous() {
    return this.tokens[this.position - 1];
  }

  /**
   * Checks if we've reached the end of the token stream.
   *
   * @returns {boolean} True if at EOF
   */
  isAtEnd() {
    return this.peek().type === TokenType.EOF;
  }

  /**
   * Consumes the current token and returns it.
   *
   * @returns {Token} The consumed token
   */
  advance() {
    if (!this.isAtEnd()) {
      this.position++;
    }
    return this.previous();
  }

  /**
   * Checks if the current token matches any of the given types.
   *
   * @param {...string} types - Token types to check
   * @returns {boolean} True if current token matches any type
   */
  check(...types) {
    if (this.isAtEnd()) return false;
    return types.includes(this.peek().type);
  }

  /**
   * Consumes the current token if it matches the expected type.
   *
   * @param {string} type - Expected token type
   * @param {string} message - Error message if not matched
   * @returns {Token} The consumed token
   * @throws {ParserError} If token doesn't match
   */
  expect(type, message) {
    if (this.check(type)) {
      return this.advance();
    }
    throw new ParserError(message, this.peek());
  }

  /**
   * Parses the entire program.
   *
   * @returns {ProgramNode} The program AST
   */
  parse() {
    const expressions = [];

    while (!this.isAtEnd()) {
      expressions.push(this.parseExpression());
    }

    return new ProgramNode(expressions);
  }

  /**
   * Parses a single expression.
   *
   * @returns {ASTNode} The expression AST node
   */
  parseExpression() {
    const token = this.peek();

    switch (token.type) {
      case TokenType.NUMBER:
        return this.parseNumber();

      case TokenType.STRING:
        return this.parseString();

      case TokenType.SYMBOL:
        return this.parseSymbol();

      case TokenType.TRUE:
      case TokenType.FALSE:
        return this.parseBoolean();

      case TokenType.LEFT_PAREN:
        return this.parseList();

      case TokenType.QUOTE:
        return this.parseQuoted();

      case TokenType.QUASIQUOTE:
        return this.parseQuasiquoted();

      case TokenType.UNQUOTE:
        return this.parseUnquoted();

      case TokenType.UNQUOTE_SPLICING:
        return this.parseUnquoteSpliced();

      case TokenType.RIGHT_PAREN:
        throw new ParserError("Unexpected ')'", token);

      case TokenType.EOF:
        throw new ParserError("Unexpected end of input", token);

      default:
        throw new ParserError(`Unexpected token: ${token.type}`, token);
    }
  }

  /**
   * Parses a number literal.
   *
   * @returns {NumberNode} The number node
   */
  parseNumber() {
    const token = this.advance();
    return new NumberNode(token.value, token.line, token.column);
  }

  /**
   * Parses a string literal.
   *
   * @returns {StringNode} The string node
   */
  parseString() {
    const token = this.advance();
    return new StringNode(token.value, token.line, token.column);
  }

  /**
   * Parses a symbol.
   *
   * @returns {SymbolNode} The symbol node
   */
  parseSymbol() {
    const token = this.advance();
    return new SymbolNode(token.value, token.line, token.column);
  }

  /**
   * Parses a boolean literal.
   *
   * @returns {BooleanNode} The boolean node
   */
  parseBoolean() {
    const token = this.advance();
    return new BooleanNode(token.value, token.line, token.column);
  }

  /**
   * Parses a list expression.
   *
   * @returns {ListNode} The list node
   */
  parseList() {
    const openParen = this.advance(); // consume '('
    const elements = [];

    while (!this.check(TokenType.RIGHT_PAREN)) {
      if (this.isAtEnd()) {
        throw new ParserError("Unterminated list - expected ')'", openParen);
      }
      elements.push(this.parseExpression());
    }

    this.advance(); // consume ')'
    return new ListNode(elements, openParen.line, openParen.column);
  }

  /**
   * Parses a quoted expression.
   *
   * @returns {QuotedNode} The quoted node
   */
  parseQuoted() {
    const quoteToken = this.advance(); // consume '
    const expression = this.parseExpression();
    return new QuotedNode(expression, quoteToken.line, quoteToken.column);
  }

  /**
   * Parses a quasiquoted expression.
   *
   * @returns {QuasiquotedNode} The quasiquoted node
   */
  parseQuasiquoted() {
    const quasiquoteToken = this.advance(); // consume `
    const expression = this.parseExpression();
    return new QuasiquotedNode(expression, quasiquoteToken.line, quasiquoteToken.column);
  }

  /**
   * Parses an unquoted expression.
   *
   * @returns {UnquotedNode} The unquoted node
   */
  parseUnquoted() {
    const unquoteToken = this.advance(); // consume ,
    const expression = this.parseExpression();
    return new UnquotedNode(expression, unquoteToken.line, unquoteToken.column);
  }

  /**
   * Parses an unquote-spliced expression.
   *
   * @returns {UnquoteSplicedNode} The unquote-spliced node
   */
  parseUnquoteSpliced() {
    const unquoteSplicingToken = this.advance(); // consume ,@
    const expression = this.parseExpression();
    return new UnquoteSplicedNode(expression, unquoteSplicingToken.line, unquoteSplicingToken.column);
  }

  /**
   * Resets the parser to the beginning of the token stream.
   */
  reset() {
    this.position = 0;
  }

  /**
   * Parses source code directly and returns the AST.
   * Static factory method for convenience.
   *
   * @param {string} source - Source code to parse
   * @returns {ProgramNode} The program AST
   */
  static parse(source) {
    const tokens = Lexer.tokenize(source);
    return new Parser(tokens).parse();
  }
}
