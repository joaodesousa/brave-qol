// Shared helpers for the checks in this folder.
//
// These extract functions out of fullpage-capture/background.js and run them
// directly. The extension has no build step and no module system — it is one
// service worker file loaded by the browser — so the alternative would be
// restructuring shipped code purely to make it importable.

const fs = require("fs");
const path = require("path");

const BACKGROUND_PATH = path.join(__dirname, "..", "fullpage-capture", "background.js");

function readBackground() {
  return fs.readFileSync(BACKGROUND_PATH, "utf8");
}

// Returns the full source text of a top-level function, brace-matched.
function extractFunction(src, name) {
  const patterns = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const pattern of patterns) {
    start = src.indexOf(pattern);
    if (start !== -1) break;
  }
  if (start === -1) throw new Error(`function ${name}() not found in background.js`);

  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`function ${name}() is unterminated`);
}

// Minimal assertion helpers, so a check file stays readable.
function createChecker(label) {
  let failures = 0;
  const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) {
      console.log(`  PASS  ${name}`);
    } else {
      failures++;
      console.log(`  FAIL  ${name}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
    }
  };
  check.done = () => {
    console.log(`${failures ? "FAILED" : "ok"}  ${label}\n`);
    return failures;
  };
  return check;
}

// Returns a top-level `const NAME = ...;` declaration verbatim. Extracted
// rather than duplicated in the checks, so a changed limit cannot leave the
// checks asserting against a stale copy of it.
function extractConst(src, name) {
  const match = src.match(new RegExp(`^const ${name} = [^;]+;`, "m"));
  if (!match) throw new Error(`const ${name} not found in background.js`);
  return match[0];
}

module.exports = { readBackground, extractFunction, extractConst, createChecker, BACKGROUND_PATH };
