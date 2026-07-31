// Checks the expression parser behind the omnibox calculator.
//
// This is the one place in the suite where a bug is silent: the capture tool
// fails loudly, but a parser that mis-handles precedence just returns a
// confidently wrong number. It is also pure — string in, number out — so
// there is no excuse for not testing it.

const fs = require("fs");
const path = require("path");
const { createChecker } = require("./lib");

// mathEval.js is a classic worker script: it ends by assigning to `self`.
const src = fs.readFileSync(path.join(__dirname, "..", "omnibox-calc", "mathEval.js"), "utf8");
const self = {};
new Function("self", src)(self);
const { evaluate, ParseError } = self.MathEval;

const check = createChecker("math evaluator");

const near = (expr, want) => {
  const got = evaluate(expr);
  const ok = Math.abs(got - want) < 1e-9;
  check(`${expr} = ${want}`, ok ? want : got, want);
};

const throws = (expr, label) => {
  let threw = false;
  try {
    evaluate(expr);
  } catch (err) {
    threw = err instanceof ParseError;
  }
  check(label || `${expr} is rejected`, threw, true);
};

// --- arithmetic and precedence ---
near("1+1", 2);
near("10*3", 30);
near("2+3*4", 14); // not 20
near("(2+3)*4", 20);
near("10-4-3", 3); // left-associative
near("100/5/2", 10); // left-associative
near("7%3", 1);
near("2*3%4", 2); // % binds like *, left to right

// --- exponentiation ---
near("2^10", 1024);
near("2^3^2", 512); // right-associative: 2^(3^2), not (2^3)^2 = 64
near("-2^2", -4); // unary minus applies to the result, as in maths convention
near("2^-1", 0.5);

// --- unary and decimals ---
near("-5", -5);
near("+5", 5);
near("--5", 5);
near("3.5*2", 7);
near(".5+.5", 1);
near("-(3+4)", -7);

// --- functions and constants ---
near("sqrt(16)", 4);
near("abs(-8)", 8);
near("log(1000)", 3); // base 10
near("ln(e)", 1);
near("floor(3.7)", 3);
near("ceil(3.2)", 4);
near("round(3.5)", 4);
near("min(3,7)", 3);
near("max(3,7)", 7);
near("pow(2,8)", 256);
near("sin(0)", 0);
near("cos(0)", 1);
near("pi", Math.PI);
near("sqrt(4)+sqrt(9)", 5);
near("max(1, 2*3)", 6); // an expression as an argument

// --- whitespace is insignificant ---
near("  2   +   2  ", 4);

// --- malformed input must be rejected, never guessed at ---
throws("");
throws("   ", "whitespace only is rejected");
throws("2+");
throws("*2");
throws("(2+3");
throws("2+3)");
throws("2 3", "two numbers with no operator are rejected");
throws("foo(2)", "unknown function is rejected");
throws("x+1", "unknown identifier is rejected");
throws("sqrt()", "a function with no argument is rejected");

// --- no code execution: the whole reason this parser exists ---
throws("alert(1)", "alert() is not callable");
throws("1;alert(1)", "a statement separator is rejected");
throws("globalThis", "globalThis is not reachable");

// Inherited Object.prototype members must not be reachable as names: with
// plain object literals, `constructor` evaluated to the Object constructor
// and `constructor(2)` called it.
throws("constructor", "constructor is not an identifier");
throws("constructor(2)", "constructor is not callable");
throws("toString", "toString is not an identifier");
throws("valueOf(1)", "valueOf is not callable");
throws("hasOwnProperty", "hasOwnProperty is not an identifier");
throws("__proto__", "__proto__ is not an identifier");

// --- division by zero is rejected outright rather than returning Infinity ---
throws("1/0", "division by zero is rejected");

process.exit(check.done());
