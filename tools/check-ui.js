// Checks each extension page's markup, script and styles agree: every element
// the script reaches exists, and every class in the markup is styled. These
// break silently — a renamed id leaves a dead button, with no error anywhere.

const fs = require("fs");
const path = require("path");
const { createChecker } = require("./lib");

const dir = path.join(__dirname, "..", "fullpage-capture");
const read = (name) => fs.readFileSync(path.join(dir, name), "utf8");

const check = createChecker("page consistency");

const pages = [
  { name: "popup", html: "popup.html", js: "popup.js", css: "popup.css" },
  { name: "preview", html: "preview.html", js: "preview.js", css: "preview.css" },
];

for (const page of pages) {
  const html = read(page.html);
  const js = read(page.js);
  const css = read(page.css);

  const ids = [...html.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]);
  const referenced = [...new Set([...js.matchAll(/\$\("([\w-]+)"\)/g)].map((m) => m[1]))];
  check(`${page.name}: every id the script reaches exists`, referenced.filter((id) => !ids.includes(id)), []);

  const classes = [...new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].trim().split(/\s+/)))];
  check(`${page.name}: every class in the markup is styled`, classes.filter((c) => !css.includes(`.${c}`)), []);

  check(`${page.name}: links its stylesheet`, html.includes(`href="${page.css}"`), true);
  check(`${page.name}: loads its script`, html.includes(`src="${page.js}"`), true);

  // Elements toggled with the `hidden` attribute stay visible if any author
  // rule gives them a `display`, because author rules outrank the UA
  // stylesheet. The symptom is an empty box that never goes away.
  if (/\shidden(\s|>|=)/.test(html)) {
    check(
      `${page.name}: a [hidden] rule overrides display`,
      /\[hidden\]\s*{[^}]*display:\s*none/.test(css),
      true
    );
  }

  // MV3 forbids inline script; an inline handler is silently dropped by CSP.
  check(`${page.name}: no inline event handlers`, /\son\w+=/.test(html), false);
  check(`${page.name}: no inline <script> body`, /<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/.test(html), false);
}

// Both pages must be reachable, or they silently never load.
const manifest = JSON.parse(read("manifest.json"));
check("manifest points at the popup", manifest.action.default_popup, "popup.html");
check("preview page is referenced by the service worker", read("background.js").includes("preview.html"), true);
check("preview loads the PDF writer before its own script", /pdf\.js[\s\S]*preview\.js/.test(read("preview.html")), true);

process.exit(check.done());
