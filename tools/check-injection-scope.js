// Checks that no function injected into the page references another function
// from the service worker.
//
// chrome.scripting.executeScript serializes the function to source and runs it
// in the page, where the worker's other functions do not exist. Such a call
// parses fine, passes `node --check`, and then fails only at runtime — as a
// ReferenceError inside the page, which surfaces far from its cause. This has
// happened twice: once with shared constants, once with a helper function.

const { readBackground, extractFunction, createChecker } = require("./lib");

const src = readBackground();
const check = createChecker("injection scope");

const declared = new Set([...src.matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]));
const injected = [...new Set([...src.matchAll(/execFn\([^,]+, (\w+)/g)].map((m) => m[1]))]
  // execFn's own parameter is named `func`; it is not an injected function.
  .filter((name) => name !== "func");

check("injected functions were found to check", injected.length > 0, true);

for (const name of injected) {
  const body = extractFunction(src, name);
  // Helpers declared inside the function ship with its source, so they are fine.
  const local = new Set([...body.matchAll(/(?:const|let|var|function)\s+(\w+)/g)].map((m) => m[1]));
  const leaks = [...new Set([...body.matchAll(/\b(\w+)\s*\(/g)].map((m) => m[1]))].filter(
    (called) => declared.has(called) && called !== name && !local.has(called)
  );
  check(`${name}() references only page globals`, leaks, []);
}

process.exit(check.done());
