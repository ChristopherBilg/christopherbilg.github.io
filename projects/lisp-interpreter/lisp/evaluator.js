/**
 * Evaluator for Lisp Interpreter
 *
 * The evaluator is the third phase of the interpreter pipeline. It takes an
 * AST from the parser and executes it, producing values as output.
 *
 * Design Patterns Used:
 * - Visitor Pattern: The evaluator visits each AST node type and performs
 *   the appropriate evaluation.
 * - Environment Pattern: Lexical scoping is implemented using a chain of
 *   environment frames.
 * - Strategy Pattern: Built-in functions are implemented as strategies that
 *   can be easily extended.
 * - Trampoline Pattern: Tail Call Optimization (TCO) is implemented using
 *   a trampoline to prevent stack overflow in tail-recursive functions.
 */

import { createGlobalEnvironment, Environment, isTruthy, LispFunction, LispMacro, stringify } from "./environment.js";
import { BooleanNode, ListNode, NodeType, NumberNode, Parser, StringNode, SymbolNode } from "./parser.js";

/**
 * EvalError class - Custom error for evaluation errors.
 */
export class EvalError extends Error {
  /**
   * Creates a new EvalError.
   *
   * @param {string} message - Error description
   * @param {ASTNode} node - The node where the error occurred
   */
  constructor(message, node = null) {
    const location = node ? ` at ${node.line}:${node.column}` : "";
    super(`Eval Error${location}: ${message}`);
    this.name = "EvalError";
    this.node = node;
  }
}

/**
 * TailCall class - Represents a deferred tail call for TCO.
 *
 * Instead of immediately evaluating a tail call (which would add to the stack),
 * we return a TailCall object that the trampoline loop will handle. This allows
 * tail-recursive functions to run in constant stack space.
 *
 * The trampoline pattern works by:
 * 1. Functions in tail position return TailCall objects instead of values
 * 2. The main eval loop (trampoline) checks for TailCall objects
 * 3. If found, it extracts the thunk and continues the loop
 * 4. This effectively converts recursion into iteration
 */
export class TailCall {
  /**
   * Creates a new TailCall.
   *
   * @param {ASTNode} node - The node to evaluate
   * @param {Environment} env - The environment for evaluation
   */
  constructor(node, env) {
    this.node = node;
    this.env = env;
  }
}

/**
 * Evaluator class - Evaluates Lisp AST nodes.
 *
 * The evaluator implements the Visitor pattern, with a visit method for
 * each node type. It maintains an environment for variable bindings and
 * supports special forms, built-in functions, and user-defined functions.
 *
 * Usage:
 *   const evaluator = new Evaluator();
 *   const result = evaluator.eval(ast);
 *   // or from source directly:
 *   const result = Evaluator.run("(+ 1 2)");
 */
export class Evaluator {
  /**
   * Creates a new Evaluator with a global environment.
   *
   * @param {Object} options - Configuration options
   * @param {Function} options.output - Output function for display/print (default: console.log)
   * @param {boolean} options.enableFFI - Whether to enable FFI functions (default: true)
   * @param {Object} options.globalObject - Global object for FFI (default: window or global)
   */
  constructor(options = {}) {
    const { output = console.log, enableFFI = true, globalObject } = options;
    this.output = output;
    this.enableFFI = enableFFI;

    // Create global environment with builtins, passing applyFunction for higher-order functions
    this.globalEnv = createGlobalEnvironment({
      applyFunction: (fn, args) => this.applyFunction(fn, args),
      output: this.output,
      enableFFI,
      globalObject,
    });
  }

  /**
   * Registers FFI functions into the global environment.
   * Call this after construction to enable JavaScript interop.
   *
   * @param {Object} ffiModule - The FFI module (import from "./ffi.js")
   */
  registerFFI(ffiModule) {
    if (ffiModule && ffiModule.registerFFI) {
      const opts = this.globalEnv._ffiOptions || {};
      ffiModule.registerFFI(this.globalEnv, {
        applyFunction: (fn, args) => this.applyFunction(fn, args),
        globalObject: opts.globalObject,
      });
    }
  }

  /**
   * Evaluates a program (list of expressions).
   *
   * @param {ProgramNode} program - The program AST
   * @returns {*} The result of the last expression
   */
  evalProgram(program) {
    let result = null;
    for (const expr of program.expressions) {
      result = this.eval(expr, this.globalEnv);
    }
    return result;
  }

  /**
   * Evaluates an AST node in the given environment.
   * This method implements the trampoline loop for TCO.
   *
   * The trampoline continuously evaluates until a non-TailCall result is produced.
   * This converts tail recursion into iteration, preventing stack overflow.
   *
   * @param {ASTNode} node - The node to evaluate
   * @param {Environment} env - The current environment
   * @returns {*} The result of evaluation
   */
  eval(node, env = this.globalEnv) {
    // Trampoline loop - keep evaluating until we get a final value
    let result = this.evalStep(node, env);

    while (result instanceof TailCall) {
      result = this.evalStep(result.node, result.env);
    }

    return result;
  }

  /**
   * Performs a single evaluation step.
   * May return a TailCall for tail positions, which the trampoline will handle.
   *
   * @param {ASTNode} node - The node to evaluate
   * @param {Environment} env - The current environment
   * @returns {*|TailCall} The result or a TailCall for deferred evaluation
   */
  evalStep(node, env) {
    if (node === null || node === undefined) {
      return null;
    }

    switch (node.type) {
      case NodeType.PROGRAM:
        return this.evalProgram(node);

      case NodeType.NUMBER:
        return node.value;

      case NodeType.STRING:
        return node.value;

      case NodeType.BOOLEAN:
        return node.value;

      case NodeType.SYMBOL:
        return env.lookup(node.name);

      case NodeType.QUOTED:
        return this.evalQuoted(node.expression);

      case NodeType.QUASIQUOTED:
        return this.evalQuasiquoted(node.expression, env);

      case NodeType.LIST:
        return this.evalList(node, env);

      default:
        throw new EvalError(`Unknown node type: ${node.type}`, node);
    }
  }

  /**
   * Evaluates a quoted expression (returns the AST as data).
   *
   * @param {ASTNode} node - The quoted expression
   * @returns {*} The quoted value
   */
  evalQuoted(node) {
    switch (node.type) {
      case NodeType.NUMBER:
        return node.value;
      case NodeType.STRING:
        return node.value;
      case NodeType.BOOLEAN:
        return node.value;
      case NodeType.SYMBOL:
        return Symbol.for(node.name);
      case NodeType.LIST:
        return node.elements.map((el) => this.evalQuoted(el));
      case NodeType.QUOTED:
        return ["quote", this.evalQuoted(node.expression)];
      default:
        return null;
    }
  }

  /**
   * Evaluates a quasiquoted expression.
   *
   * @param {ASTNode} node - The quasiquoted expression
   * @param {Environment} env - Current environment
   * @returns {*} The quasiquoted value
   */
  evalQuasiquoted(node, env) {
    switch (node.type) {
      case NodeType.UNQUOTED:
        return this.eval(node.expression, env);
      case NodeType.UNQUOTE_SPLICED:
        throw new EvalError("unquote-splicing not in list context", node);
      case NodeType.LIST:
        return this.evalQuasiquotedList(node.elements, env);
      case NodeType.SYMBOL:
        return Symbol.for(node.name);
      default:
        return this.evalQuoted(node);
    }
  }

  /**
   * Evaluates a quasiquoted list, handling unquote-splicing.
   *
   * @param {ASTNode[]} elements - List elements
   * @param {Environment} env - Current environment
   * @returns {Array} The resulting list
   */
  evalQuasiquotedList(elements, env) {
    const result = [];
    for (const el of elements) {
      if (el.type === NodeType.UNQUOTE_SPLICED) {
        const spliced = this.eval(el.expression, env);
        if (!Array.isArray(spliced)) {
          throw new EvalError("unquote-splicing requires a list", el);
        }
        result.push(...spliced);
      } else {
        result.push(this.evalQuasiquoted(el, env));
      }
    }
    return result;
  }

  /**
   * Evaluates a list expression (function call or special form).
   *
   * @param {ListNode} node - The list node
   * @param {Environment} env - Current environment
   * @returns {*} The result of the expression
   */
  evalList(node, env) {
    if (node.elements.length === 0) {
      return [];
    }

    const first = node.elements[0];

    // Check for special forms
    if (first.type === NodeType.SYMBOL) {
      const name = first.name;

      switch (name) {
        case "quote":
          return this.evalQuoted(node.elements[1]);

        case "quasiquote":
          return this.evalQuasiquoted(node.elements[1], env);

        case "if":
          return this.evalIf(node, env);

        case "cond":
          return this.evalCond(node, env);

        case "define":
          return this.evalDefine(node, env);

        case "set!":
          return this.evalSet(node, env);

        case "lambda":
          return this.evalLambda(node, env);

        case "let":
          return this.evalLet(node, env);

        case "let*":
          return this.evalLetStar(node, env);

        case "letrec":
          return this.evalLetrec(node, env);

        case "begin":
          return this.evalBegin(node, env);

        case "and":
          return this.evalAnd(node, env);

        case "or":
          return this.evalOr(node, env);

        case "define-macro":
          return this.evalDefineMacro(node, env);
      }
    }

    // Regular function call
    return this.evalFunctionCall(node, env);
  }

  /**
   * Evaluates an if expression.
   * Returns TailCall for the branch in tail position (TCO).
   *
   * @param {ListNode} node - The if expression
   * @param {Environment} env - Current environment
   * @returns {TailCall} Deferred evaluation of the chosen branch
   */
  evalIf(node, env) {
    const [, condition, consequent, alternate] = node.elements;

    if (isTruthy(this.eval(condition, env))) {
      return new TailCall(consequent, env);
    } else if (alternate) {
      return new TailCall(alternate, env);
    }
    return null;
  }

  /**
   * Evaluates a cond expression.
   * Returns TailCall for the body in tail position (TCO).
   *
   * @param {ListNode} node - The cond expression
   * @param {Environment} env - Current environment
   * @returns {TailCall|null} Deferred evaluation of the matching clause body
   */
  evalCond(node, env) {
    for (let i = 1; i < node.elements.length; i++) {
      const clause = node.elements[i];

      if (clause.type !== NodeType.LIST || clause.elements.length < 2) {
        throw new EvalError("cond: invalid clause", clause);
      }

      const [test, ...body] = clause.elements;

      // Check for else clause
      if (test.type === NodeType.SYMBOL && test.name === "else") {
        return this.evalSequenceTail(body, env);
      }

      if (isTruthy(this.eval(test, env))) {
        return this.evalSequenceTail(body, env);
      }
    }
    return null;
  }

  /**
   * Evaluates a define expression.
   *
   * @param {ListNode} node - The define expression
   * @param {Environment} env - Current environment
   * @returns {null}
   */
  evalDefine(node, env) {
    const target = node.elements[1];

    // Function definition shorthand: (define (name args...) body)
    if (target.type === NodeType.LIST) {
      const [nameNode, ...paramNodes] = target.elements;
      const name = nameNode.name;
      const params = paramNodes.map((p) => p.name);
      const body = node.elements.slice(2);
      const fn = new LispFunction(
        params,
        body.length === 1
          ? body[0]
          : new ListNode([new SymbolNode("begin", node.line, node.column), ...body], node.line, node.column),
        env,
        name
      );
      env.define(name, fn);
      return null;
    }

    // Variable definition: (define name value)
    const name = target.name;
    const value = this.eval(node.elements[2], env);
    env.define(name, value);
    return null;
  }

  /**
   * Evaluates a set! expression.
   *
   * @param {ListNode} node - The set! expression
   * @param {Environment} env - Current environment
   * @returns {null}
   */
  evalSet(node, env) {
    const name = node.elements[1].name;
    const value = this.eval(node.elements[2], env);
    env.set(name, value);
    return null;
  }

  /**
   * Evaluates a lambda expression.
   *
   * @param {ListNode} node - The lambda expression
   * @param {Environment} env - Current environment
   * @returns {LispFunction} The created function
   */
  evalLambda(node, env) {
    const paramsNode = node.elements[1];
    const params = paramsNode.elements.map((p) => p.name);
    const body = node.elements.slice(2);

    // If there are multiple body expressions, wrap them in begin
    const bodyExpr =
      body.length === 1
        ? body[0]
        : new ListNode([new SymbolNode("begin", node.line, node.column), ...body], node.line, node.column);

    return new LispFunction(params, bodyExpr, env);
  }

  /**
   * Evaluates a let expression.
   * Returns TailCall for the body (TCO).
   *
   * @param {ListNode} node - The let expression
   * @param {Environment} env - Current environment
   * @returns {TailCall} Deferred evaluation of the body
   */
  evalLet(node, env) {
    const bindings = node.elements[1];
    const body = node.elements.slice(2);
    const newEnv = env.extend();

    // Evaluate all bindings in the original environment
    for (const binding of bindings.elements) {
      const name = binding.elements[0].name;
      const value = this.eval(binding.elements[1], env);
      newEnv.define(name, value);
    }

    return this.evalSequenceTail(body, newEnv);
  }

  /**
   * Evaluates a let* expression (sequential bindings).
   * Returns TailCall for the body (TCO).
   *
   * @param {ListNode} node - The let* expression
   * @param {Environment} env - Current environment
   * @returns {TailCall} Deferred evaluation of the body
   */
  evalLetStar(node, env) {
    const bindings = node.elements[1];
    const body = node.elements.slice(2);
    let newEnv = env.extend();

    // Evaluate each binding in the extended environment
    for (const binding of bindings.elements) {
      const name = binding.elements[0].name;
      const value = this.eval(binding.elements[1], newEnv);
      newEnv.define(name, value);
    }

    return this.evalSequenceTail(body, newEnv);
  }

  /**
   * Evaluates a letrec expression (recursive bindings).
   * Returns TailCall for the body (TCO).
   *
   * @param {ListNode} node - The letrec expression
   * @param {Environment} env - Current environment
   * @returns {TailCall} Deferred evaluation of the body
   */
  evalLetrec(node, env) {
    const bindings = node.elements[1];
    const body = node.elements.slice(2);
    const newEnv = env.extend();

    // First, define all names with undefined values
    for (const binding of bindings.elements) {
      const name = binding.elements[0].name;
      newEnv.define(name, undefined);
    }

    // Then, evaluate all values in the new environment
    for (const binding of bindings.elements) {
      const name = binding.elements[0].name;
      const value = this.eval(binding.elements[1], newEnv);
      newEnv.set(name, value);
    }

    return this.evalSequenceTail(body, newEnv);
  }

  /**
   * Evaluates a begin expression (sequence of expressions).
   * Returns TailCall for the last expression (TCO).
   *
   * @param {ListNode} node - The begin expression
   * @param {Environment} env - Current environment
   * @returns {TailCall} Deferred evaluation of the last expression
   */
  evalBegin(node, env) {
    return this.evalSequenceTail(node.elements.slice(1), env);
  }

  /**
   * Evaluates a sequence of expressions, returning the last result.
   * Used when the sequence is NOT in tail position.
   *
   * @param {ASTNode[]} exprs - Expressions to evaluate
   * @param {Environment} env - Current environment
   * @returns {*} Result of the last expression
   */
  evalSequence(exprs, env) {
    let result = null;
    for (const expr of exprs) {
      result = this.eval(expr, env);
    }
    return result;
  }

  /**
   * Evaluates a sequence of expressions with TCO for the last expression.
   * Evaluates all but the last expression fully, then returns a TailCall
   * for the last expression.
   *
   * @param {ASTNode[]} exprs - Expressions to evaluate
   * @param {Environment} env - Current environment
   * @returns {TailCall|null} Deferred evaluation of the last expression
   */
  evalSequenceTail(exprs, env) {
    if (exprs.length === 0) {
      return null;
    }

    // Evaluate all expressions except the last
    for (let i = 0; i < exprs.length - 1; i++) {
      this.eval(exprs[i], env);
    }

    // Return TailCall for the last expression
    return new TailCall(exprs[exprs.length - 1], env);
  }

  /**
   * Evaluates an and expression (short-circuit evaluation).
   * Returns TailCall for the last expression if all preceding are truthy (TCO).
   *
   * @param {ListNode} node - The and expression
   * @param {Environment} env - Current environment
   * @returns {*|TailCall} First falsy value or TailCall for last expression
   */
  evalAnd(node, env) {
    const args = node.elements.slice(1);

    if (args.length === 0) {
      return true;
    }

    // Evaluate all but the last
    for (let i = 0; i < args.length - 1; i++) {
      const result = this.eval(args[i], env);
      if (!isTruthy(result)) {
        return result;
      }
    }

    // Return TailCall for the last expression
    return new TailCall(args[args.length - 1], env);
  }

  /**
   * Evaluates an or expression (short-circuit evaluation).
   * Returns TailCall for the last expression if all preceding are falsy (TCO).
   *
   * @param {ListNode} node - The or expression
   * @param {Environment} env - Current environment
   * @returns {*|TailCall} First truthy value or TailCall for last expression
   */
  evalOr(node, env) {
    const args = node.elements.slice(1);

    if (args.length === 0) {
      return false;
    }

    // Evaluate all but the last
    for (let i = 0; i < args.length - 1; i++) {
      const result = this.eval(args[i], env);
      if (isTruthy(result)) {
        return result;
      }
    }

    // Return TailCall for the last expression
    return new TailCall(args[args.length - 1], env);
  }

  /**
   * Evaluates a define-macro expression.
   *
   * @param {ListNode} node - The define-macro expression
   * @param {Environment} env - Current environment
   * @returns {null}
   */
  evalDefineMacro(node, env) {
    const signature = node.elements[1];
    const [nameNode, ...paramNodes] = signature.elements;
    const name = nameNode.name;
    const params = paramNodes.map((p) => p.name);
    const body = node.elements.slice(2);

    const bodyExpr =
      body.length === 1
        ? body[0]
        : new ListNode([new SymbolNode("begin", node.line, node.column), ...body], node.line, node.column);

    const macro = new LispMacro(params, bodyExpr, env, name);
    env.define(name, macro);
    return null;
  }

  /**
   * Evaluates a function call.
   *
   * @param {ListNode} node - The function call
   * @param {Environment} env - Current environment
   * @returns {*} Result of the function call
   */
  evalFunctionCall(node, env) {
    const fn = this.eval(node.elements[0], env);

    // Check if it's a macro
    if (fn instanceof LispMacro) {
      return this.evalMacroCall(fn, node.elements.slice(1), env);
    }

    // Evaluate arguments
    const args = node.elements.slice(1).map((arg) => this.eval(arg, env));

    return this.applyFunction(fn, args);
  }

  /**
   * Evaluates a macro call.
   *
   * @param {LispMacro} macro - The macro
   * @param {ASTNode[]} args - Unevaluated arguments
   * @param {Environment} env - Current environment
   * @returns {TailCall} Deferred evaluation of the expanded code
   */
  evalMacroCall(macro, args, env) {
    // Create environment for macro expansion
    const macroEnv = macro.closure.extend();

    // Bind parameters to unevaluated arguments (as AST nodes converted to data)
    for (let i = 0; i < macro.params.length; i++) {
      macroEnv.define(macro.params[i], this.astToData(args[i]));
    }

    // Expand the macro (evaluate its body to get code)
    const expanded = this.eval(macro.body, macroEnv);

    // Convert the expanded data back to AST and return TailCall for TCO
    const expandedAst = this.dataToAst(expanded);
    return new TailCall(expandedAst, env);
  }

  /**
   * Converts an AST node to Lisp data (for macro arguments).
   *
   * @param {ASTNode} node - AST node
   * @returns {*} Lisp data representation
   */
  astToData(node) {
    if (!node) return null;

    switch (node.type) {
      case NodeType.NUMBER:
      case NodeType.STRING:
      case NodeType.BOOLEAN:
        return node.value;
      case NodeType.SYMBOL:
        return Symbol.for(node.name);
      case NodeType.LIST:
        return node.elements.map((el) => this.astToData(el));
      case NodeType.QUOTED:
        return ["quote", this.astToData(node.expression)];
      default:
        return null;
    }
  }

  /**
   * Converts Lisp data back to an AST (for macro expansion).
   *
   * @param {*} data - Lisp data
   * @returns {ASTNode} AST node
   */
  dataToAst(data) {
    if (data === null) return new SymbolNode("nil", 0, 0);
    if (typeof data === "number") return new NumberNode(data, 0, 0);
    if (typeof data === "string") return new StringNode(data, 0, 0);
    if (typeof data === "boolean") return new BooleanNode(data, 0, 0);
    if (typeof data === "symbol") return new SymbolNode(Symbol.keyFor(data), 0, 0);
    if (Array.isArray(data)) {
      return new ListNode(
        data.map((el) => this.dataToAst(el)),
        0,
        0
      );
    }
    throw new EvalError(`Cannot convert to AST: ${data}`);
  }

  /**
   * Applies a function to arguments.
   * Returns TailCall for user-defined functions (TCO).
   *
   * @param {Function|LispFunction} fn - The function
   * @param {Array} args - The arguments
   * @returns {*|TailCall} Result or TailCall for deferred evaluation
   */
  applyFunction(fn, args) {
    // Built-in function - evaluate immediately (no TCO needed)
    if (typeof fn === "function") {
      return fn(...args);
    }

    // User-defined function - return TailCall for TCO
    if (fn instanceof LispFunction) {
      const fnEnv = fn.closure.extend();

      // Bind parameters
      for (let i = 0; i < fn.params.length; i++) {
        fnEnv.define(fn.params[i], args[i]);
      }

      // If named, allow recursion
      if (fn.name) {
        fnEnv.define(fn.name, fn);
      }

      // Return TailCall instead of evaluating - the trampoline will handle it
      return new TailCall(fn.body, fnEnv);
    }

    throw new EvalError(`Not a function: ${stringify(fn)}`);
  }

  /**
   * Runs Lisp source code and returns the result.
   * Static convenience method.
   *
   * @param {string} source - Lisp source code
   * @param {Object} options - Evaluator options
   * @returns {*} Result of evaluation
   */
  static run(source, options = {}) {
    const ast = Parser.parse(source);
    const evaluator = new Evaluator(options);
    return evaluator.eval(ast);
  }

  /**
   * Creates an evaluator with FFI enabled.
   * Static async factory method for browser environments.
   *
   * @param {Object} options - Evaluator options
   * @returns {Promise<Evaluator>} Evaluator with FFI registered
   *
   * @example
   * const evaluator = await Evaluator.withFFI();
   * evaluator.eval(Parser.parse('(query-selector "body")'));
   */
  static async withFFI(options = {}) {
    const evaluator = new Evaluator({ ...options, enableFFI: true });
    try {
      const ffiModule = await import("./ffi.js");
      evaluator.registerFFI(ffiModule);
    } catch (e) {
      console.warn("FFI module could not be loaded:", e.message);
    }
    return evaluator;
  }
}

// Re-export environment classes and utilities for convenience
export { createGlobalEnvironment, Environment, isTruthy, LispFunction, LispMacro, stringify } from "./environment.js";
