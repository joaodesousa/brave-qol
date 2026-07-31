// Runs every check plus a syntax pass over each shipped script.
// Usage: node tools/check-all.js

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const scripts = [
  "fullpage-capture/background.js",
  "fullpage-capture/popup.js",
  "fullpage-capture/offscreen.js",
  "fullpage-capture/preview.js",
  "fullpage-capture/pdf.js",
  "omnibox-calc/background.js",
  "omnibox-calc/mathEval.js",
];
const manifests = ["fullpage-capture/manifest.json", "omnibox-calc/manifest.json"];
const checks = ["check-offsets.js", "check-stitch.js", "check-injection-scope.js", "check-ui.js", "check-pdf.js", "check-matheval.js"];

let failed = 0;

console.log("syntax");
for (const file of scripts) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  try {
    execFileSync(process.execPath, ["--check", full], { stdio: "pipe" });
    console.log(`  PASS  ${file}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${file}\n${err.stderr}`);
  }
}
for (const file of manifests) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  try {
    JSON.parse(fs.readFileSync(full, "utf8"));
    console.log(`  PASS  ${file}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${file} — ${err.message}`);
  }
}
console.log("");

for (const check of checks) {
  try {
    console.log(execFileSync(process.execPath, [path.join(__dirname, check)], { encoding: "utf8" }).trimEnd());
    console.log("");
  } catch (err) {
    failed++;
    console.log(`${err.stdout || ""}${err.stderr || ""}`);
  }
}

console.log(failed ? `FAILED — ${failed} check(s) did not pass` : "All checks passed.");
process.exit(failed ? 1 : 0);
