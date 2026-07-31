// Grammar: expr -> term (('+'|'-') term)*
//          term -> unary (('*'|'/'|'%') unary)*
//          unary -> ('-'|'+') unary | power
//          power -> primary ('^' unary)?    (right-assoc; -2^2 is -(2^2))
//          primary -> NUMBER | IDENT '(' expr (',' expr)* ')' | '(' expr ')' | CONST

// Null-prototype: a plain object literal inherits from Object.prototype, so
// `constructor(2)` would call the Object constructor instead of being rejected.
const FUNCTIONS = Object.assign(Object.create(null), {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
});

const CONSTANTS = Object.assign(Object.create(null), {
  pi: Math.PI,
  e: Math.E,
});

class ParseError extends Error {}

function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let start = i;
      while (i < input.length && /[0-9.]/.test(input[i])) i++;
      const numStr = input.slice(start, i);
      if ((numStr.match(/\./g) || []).length > 1) {
        throw new ParseError(`Invalid number "${numStr}"`);
      }
      tokens.push({ type: "num", value: parseFloat(numStr) });
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let start = i;
      while (i < input.length && /[a-zA-Z]/.test(input[i])) i++;
      tokens.push({ type: "ident", value: input.slice(start, i).toLowerCase() });
      continue;
    }
    if ("+-*/^%(),".includes(c)) {
      tokens.push({ type: c });
      i++;
      continue;
    }
    throw new ParseError(`Unexpected character "${c}"`);
  }
  return tokens;
}

function parse(tokens) {
  let pos = 0;

  function peek() {
    return tokens[pos];
  }
  const CLOSING_HINT = { ")": "a closing parenthesis" };

  function consume(type) {
    const t = tokens[pos];
    if (!t) {
      throw new ParseError(
        type === ")" ? "Missing a closing parenthesis" : "Incomplete expression"
      );
    }
    if (t.type !== type) {
      throw new ParseError(
        CLOSING_HINT[type] ? `Expected ${CLOSING_HINT[type]}` : "Unexpected input"
      );
    }
    pos++;
    return t;
  }

  function parseExpr() {
    let value = parseTerm();
    while (peek() && (peek().type === "+" || peek().type === "-")) {
      const op = consume(peek().type).type;
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm() {
    let value = parseUnary();
    while (peek() && (peek().type === "*" || peek().type === "/" || peek().type === "%")) {
      const op = consume(peek().type).type;
      const rhs = parseUnary();
      if (op === "*") value *= rhs;
      else if (op === "/") {
        if (rhs === 0) throw new ParseError("Division by zero");
        value /= rhs;
      } else value %= rhs;
    }
    return value;
  }

  // Above power, so -2^2 is -(2^2) = -4, not (-2)^2 = 4.
  function parseUnary() {
    if (peek() && peek().type === "-") {
      consume("-");
      return -parseUnary();
    }
    if (peek() && peek().type === "+") {
      consume("+");
      return parseUnary();
    }
    return parsePower();
  }

  function parsePower() {
    const base = parsePrimary();
    if (peek() && peek().type === "^") {
      consume("^");
      const exponent = parseUnary(); // not parsePower: right-associative, keeps 2^-1 working
      return Math.pow(base, exponent);
    }
    return base;
  }

  function parsePrimary() {
    const t = peek();
    if (!t) throw new ParseError("Incomplete expression");

    if (t.type === "num") {
      consume("num");
      return t.value;
    }

    if (t.type === "(") {
      consume("(");
      const value = parseExpr();
      consume(")");
      return value;
    }

    if (t.type === "ident") {
      consume("ident");
      const name = t.value;
      if (peek() && peek().type === "(") {
        consume("(");
        const args = [parseExpr()];
        while (peek() && peek().type === ",") {
          consume(",");
          args.push(parseExpr());
        }
        consume(")");
        const fn = FUNCTIONS[name];
        if (!fn) throw new ParseError(`Unknown function "${name}"`);
        return fn(...args);
      }
      if (name in CONSTANTS) return CONSTANTS[name];
      throw new ParseError(`Unknown identifier "${name}"`);
    }

    throw new ParseError(`Unexpected "${t.type}"`);
  }

  const result = parseExpr();
  if (pos !== tokens.length) {
    throw new ParseError("Unexpected extra input");
  }
  return result;
}

function evaluate(input) {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new ParseError("Empty expression");
  return parse(tokens);
}

// Exposed for background.js (classic script import via importScripts).
self.MathEval = { evaluate, ParseError };
