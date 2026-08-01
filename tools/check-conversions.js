// Checks parsing and locally computed distance/weight conversions. Currency
// fetching belongs to the service worker and is deliberately not networked here.

const fs = require("fs");
const path = require("path");
const { createChecker } = require("./lib");

const self = {};
const mathSrc = fs.readFileSync(path.join(__dirname, "..", "omnibox-calc", "mathEval.js"), "utf8");
const conversionSrc = fs.readFileSync(path.join(__dirname, "..", "omnibox-calc", "conversions.js"), "utf8");
new Function("self", mathSrc)(self);
new Function("self", conversionSrc)(self);

const check = createChecker("conversions");
const parse = (input) => self.Conversions.parseConversion(input, self.MathEval.evaluate);
const near = (input, want, symbol) => {
  const got = parse(input);
  check(`${input} target`, got.to, symbol);
  check(`${input} value`, Math.abs(got.value - want) < 1e-9, true);
};
const throws = (input, message) => {
  let got = "";
  try { parse(input); } catch (err) { got = err.message; }
  check(`${input} is rejected`, got, message);
};

near("5 km to mi", 3.1068559611866697, "mi");
near("10 lbs in kg", 4.5359237, "kg");
near("12 inches to cm", 30.48, "cm");
near("(5 + 3) km to m", 8000, "m");
near("1 tonne to pounds", 2204.6226218487755, "lb");

check("plain math is not a conversion", parse("2 + 2"), null);
check("currency kind", parse("10 usd to EUR").kind, "currency");
check("currency source normalized", parse("10 usd to EUR").from, "USD");
check("currency target normalized", parse("10 usd to EUR").to, "EUR");
check("currency amount", parse("(4 * 2) usd to EUR").amount, 8);

throws("10 kg to miles", "Cannot convert weight to distance");
throws("10 kg to widgets", "Unknown unit \"widgets\"");

process.exit(check.done());
