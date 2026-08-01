#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const renderDir = join(root, ".render");
const sourceDir = join(root, "source");
const captureDir = join(root, "fullpage-capture");
const calcDir = join(root, "omnibox-calc");
const profileRoot = mkdtempSync(join(tmpdir(), "brave-qol-shots-"));

mkdirSync(renderDir, { recursive: true });
mkdirSync(sourceDir, { recursive: true });

const legacy = {
  menu: "fullpage-capture/screenshot-1-menu.png",
  preview: "fullpage-capture/screenshot-2-capturing.png",
  functions: "omnibox-calc/screenshot-1-functions.png",
  percentage: "omnibox-calc/screenshot-2-percentage.png",
};

for (const [name, relative] of Object.entries(legacy)) {
  const backup = join(sourceDir, `legacy-${name}.png`);
  if (!existsSync(backup)) copyFileSync(join(root, relative), backup);
}

const popupSource = readFileSync(resolve(root, "../fullpage-capture/popup.html"), "utf8");
function popupFixture(name, state) {
  const setup = state === "running"
    ? `
      document.getElementById("running").hidden = false;
      document.getElementById("progress-label").textContent = "Capturing";
      document.getElementById("progress-count").textContent = "7 / ~12";
      const bar = document.getElementById("progress-bar");
      bar.classList.remove("is-indeterminate");
      bar.style.width = "58%";
      document.getElementById("foot-text").textContent = "Repeat with Alt+Shift+C";
      document.getElementById("foot-action").textContent = "Change";
    `
    : `
      document.getElementById("idle").hidden = false;
      document.getElementById("save-label").textContent = "Save as PNG";
      document.getElementById("format-status").textContent = "Lossless — largest files";
      document.getElementById("format-value").textContent = "PNG";
      document.getElementById("overlays-status").textContent = "3 pinned elements — will be left out";
      document.getElementById("overlays").setAttribute("aria-checked", "${state === "overlays"}");
      document.getElementById("foot-text").textContent = "Repeat with Alt+Shift+C";
      document.getElementById("foot-action").textContent = "Change";
    `;

  const fixture = popupSource
    .replace('<link rel="stylesheet" href="popup.css" />', '<link rel="stylesheet" href="../../fullpage-capture/popup.css" /><style>html{zoom:1.65} body{overflow:hidden}</style>')
    .replace('<script src="popup.js"></script>', `<script>${setup}</script>`);
  const path = join(renderDir, `popup-${name}.html`);
  writeFileSync(path, fixture);
  return pathToFileURL(path).href;
}

const popupIdle = popupFixture("idle", "idle");
const popupOverlays = popupFixture("overlays", "overlays");
const popupRunning = popupFixture("running", "running");

const css = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { width: 2560px; height: 1600px; margin: 0; overflow: hidden; }
  body {
    --ink: #14171a; --paper: #f3f1ec; --teal: #00968c; --orange: #ff5a1e;
    --muted: #747c79; --line: rgba(20,23,26,.12);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: var(--ink); background: var(--paper); -webkit-font-smoothing: antialiased;
  }
  .canvas { width: 1280px; height: 800px; transform: scale(2); transform-origin: 0 0; position: relative; overflow: hidden; padding: 64px 70px; }
  .canvas.dark { color: var(--paper); background: var(--ink); }
  .canvas.paper { background: var(--paper); }
  .canvas::after { content: ""; position: absolute; left: 70px; bottom: 44px; width: 188px; height: 6px;
    background: linear-gradient(90deg,var(--teal) 0 48%,transparent 48% 52%,var(--orange) 52%); border-radius: 9px; }
  .brand { position: absolute; top: 42px; right: 54px; display: flex; align-items: center; gap: 12px;
    font: 650 20px/1 ui-monospace, "DejaVu Sans Mono", monospace; letter-spacing: -.5px; opacity: .86; }
  .mark { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 7px; background: var(--ink); color: var(--paper); }
  .dark .mark { background: var(--paper); color: var(--ink); }
  .mark svg { width: 22px; height: 22px; }
  .kicker { color: var(--teal); font: 700 15px/1.2 ui-monospace, "DejaVu Sans Mono", monospace; letter-spacing: .08em; text-transform: uppercase; }
  .orange .kicker { color: var(--orange); }
  h1 { margin: 18px 0 18px; max-width: 540px; font-size: 62px; line-height: .98; letter-spacing: -.055em; font-weight: 730; }
  .sub { max-width: 470px; margin: 0; color: var(--muted); font-size: 20px; line-height: 1.45; letter-spacing: -.018em; }
  .dark .sub { color: #a7afac; }
  .split { display: grid; grid-template-columns: 430px 1fr; gap: 48px; align-items: center; height: 100%; }
  .copy { position: relative; z-index: 2; }
  .visual { position: relative; z-index: 1; min-width: 0; }
  .panel { background: #fff; color: var(--ink); border: 1px solid rgba(20,23,26,.10); border-radius: 18px;
    box-shadow: 0 30px 80px rgba(20,23,26,.18), 0 3px 12px rgba(20,23,26,.08); overflow: hidden; }
  .dark .panel { box-shadow: 0 35px 90px rgba(0,0,0,.42), 0 3px 14px rgba(0,0,0,.25); }
  .browser-top { height: 42px; display: flex; align-items: center; gap: 7px; padding: 0 15px; background: #eceef1; border-bottom: 1px solid #d9dce1; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #c4c8ce; }
  .address { height: 24px; margin-left: 8px; flex: 1; border-radius: 12px; background: white; color: #7c8289; font-size: 11px; display:flex; align-items:center; padding:0 12px; }
  .popup-shell { width: 418px; height: 490px; margin: 0 auto; border-radius: 16px; overflow: hidden; background: white;
    box-shadow: 0 34px 85px rgba(20,23,26,.28), 0 4px 14px rgba(20,23,26,.12); }
  .popup-shell iframe { width: 418px; height: 490px; border: 0; display: block; background: white; }
  .popup-shell.running { height: 245px; }
  .popup-shell.running iframe { height: 245px; }
  .note { display: inline-flex; align-items:center; gap:10px; margin-top: 26px; font-size: 15px; color: var(--muted); }
  .dark .note { color:#a7afac; }
  .key { display:inline-grid; place-items:center; min-width:34px; height:30px; padding:0 9px; border:1px solid currentColor; border-radius:7px; font:600 14px ui-monospace,monospace; }
  .omnibox-layout { padding-top: 72px; }
  .omnibox-layout h1 { max-width: 850px; margin-top: 14px; }
  .omnibox-layout .sub { max-width: 680px; }
  .omnibox-card { position:absolute; left:70px; right:70px; bottom:92px; height:260px; padding:34px; border-radius:22px;
    background:#fff; border:1px solid rgba(20,23,26,.1); box-shadow:0 30px 80px rgba(20,23,26,.18); }
  .omnibox-card .label { color:#7b8280; font:700 12px/1 ui-monospace,monospace; letter-spacing:.08em; text-transform:uppercase; margin-bottom:18px; }
  .omnibox-ui { height:98px; overflow:hidden; border:1px solid #d9dce1; border-radius:12px; background:#fff; box-shadow:0 10px 30px rgba(20,23,26,.12); font-size:15px; }
  .omni-entry,.omni-result { height:49px; display:flex; align-items:center; gap:11px; padding:0 17px; white-space:nowrap; }
  .omni-result { background:#f1f1f2; border-left:4px solid #5b54f2; padding-left:13px; }
  .omni-icon { width:20px; height:20px; flex:none; display:grid; place-items:center; border-radius:3px; background:#a8aaad; color:#fff; font:700 11px/1 ui-monospace,monospace; }
  .omni-title { color:#5b54f2; font-weight:550; }
  .omni-divider { width:1px; height:24px; background:#d7d9dd; }
  .omni-expression { color:#17191c; font-weight:550; }
  .omni-result strong { font-size:16px; color:#17191c; }
  .omni-dim { color:#555c63; }
  .omni-app { color:#353a40; }
  .result-line { display:flex; align-items:center; justify-content:space-between; margin-top:21px; color:#555d5a; font-size:15px; }
  .result-line strong { color:var(--ink); font-size:18px; }
  .two-cards { display:grid; grid-template-columns:1fr 1fr; gap:22px; margin-top:40px; }
  .math-card { background:#fff; color:var(--ink); padding:24px; border-radius:17px; box-shadow:0 24px 65px rgba(0,0,0,.28); }
  .math-card .mini { height:105px; border:1px solid #dde0e4; border-radius:10px; overflow:hidden; }
  .math-card .mini .omnibox-ui { border:0; border-radius:0; box-shadow:none; width:530px; transform:scale(.56); transform-origin:0 0; }
  .math-card .caption { margin-top:17px; color:#6d7471; font-size:14px; }
  .math-card .caption b { display:block; color:var(--ink); font-size:18px; margin-bottom:3px; }
  .preview-frame { height:520px; background:#f5f5f7; }
  .preview-toolbar { height:54px; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:0 14px; background:#fff; border-bottom:1px solid #e1e2e5; }
  .preview-meta { min-width:0; }
  .preview-meta b { display:block; font-size:11px; }
  .preview-meta span { display:block; color:#9a9da2; font-size:8px; margin-top:2px; }
  .preview-actions { display:flex; gap:5px; align-items:center; }
  .ui-btn { height:26px; padding:0 9px; border:1px solid #dedfe2; border-radius:6px; background:#fff; color:#26292d; font:500 9px/1 inherit; }
  .ui-btn.primary { color:#fff; background:#0877e8; border-color:#0877e8; }
  .capture-stage { padding:19px; height:466px; overflow:hidden; display:flex; justify-content:center; }
  .captured-page { width:520px; min-height:700px; padding:27px 30px; background:#fff; border-radius:7px; box-shadow:0 8px 28px rgba(20,23,26,.12); }
  .demo-nav { display:flex; align-items:center; justify-content:space-between; padding-bottom:16px; border-bottom:1px solid #e6e4df; font-size:9px; }
  .demo-logo { font:700 13px/1 ui-monospace,monospace; }
  .demo-links { display:flex; gap:15px; color:#707572; }
  .demo-hero { display:grid; grid-template-columns:1.25fr .75fr; gap:22px; padding:28px 0 24px; }
  .demo-eyebrow { color:#00968c; font:700 7px/1 ui-monospace,monospace; letter-spacing:.09em; text-transform:uppercase; }
  .demo-hero h2 { margin:8px 0 9px; font-size:30px; line-height:1; letter-spacing:-.045em; }
  .demo-hero p,.demo-copy p { margin:0; color:#747a77; font-size:9px; line-height:1.55; }
  .demo-art { border-radius:9px; background:linear-gradient(145deg,#00968c,#73d3c9 48%,#ffb397 49%,#ff5a1e); position:relative; overflow:hidden; }
  .demo-art::after { content:""; position:absolute; inset:18px; border:1px solid rgba(255,255,255,.7); border-radius:50%; }
  .demo-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:25px; }
  .demo-stat { padding:14px; border-radius:7px; background:#f4f2ed; }
  .demo-stat b { display:block; font-size:18px; }
  .demo-stat span { color:#777d79; font-size:7px; text-transform:uppercase; letter-spacing:.06em; }
  .demo-copy { display:grid; grid-template-columns:1fr 1fr; gap:22px; padding-top:22px; border-top:1px solid #e6e4df; }
  .demo-copy h3 { margin:0 0 8px; font-size:14px; }
  .toolbar-card { padding: 0; }
  .format-toolbar { height:74px; padding:20px 24px; display:flex; justify-content:flex-end; gap:7px; border-bottom:1px solid #e2e4e7; background:#fff; }
  .format-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; padding:34px; }
  .format { padding:24px 8px; text-align:center; border:1px solid #dde0e4; border-radius:12px; font:700 19px ui-monospace,monospace; }
  .format:first-child { color:white; background:var(--teal); border-color:var(--teal); }
  .steps { display:flex; gap:12px; margin-top:28px; flex-wrap:wrap; }
  .step { display:flex; align-items:center; gap:9px; color:var(--muted); font-size:14px; }
  .dark .step { color:#a7afac; }
  .step i { display:grid; place-items:center; width:24px; height:24px; border-radius:50%; background:var(--teal); color:white; font-style:normal; font-size:12px; font-weight:700; }
`;

function brand() {
  return `<div class="brand"><span class="mark"><svg viewBox="0 0 32 32" fill="none"><path d="m10 7 12 9-12 9" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>brave-qol</span></div>`;
}

function page({ classes = "paper", kicker, title, sub, visual, extra = "" }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
    <main class="canvas ${classes}">${brand()}<div class="split"><section class="copy"><div class="kicker">${kicker}</div><h1>${title}</h1><p class="sub">${sub}</p>${extra}</section><section class="visual">${visual}</section></div></main>
  </body></html>`;
}

function omniboxWidget(expression, result) {
  return `<div class="omnibox-ui">
    <div class="omni-entry"><span class="omni-icon">=</span><span class="omni-title">Brave QoL: Omnibox Calc</span><span class="omni-divider"></span><span class="omni-expression">${expression}</span></div>
    <div class="omni-result"><span class="omni-icon">=</span><strong>${expression} = ${result}</strong><span class="omni-dim">(Enter to copy)</span><span class="omni-app">- Brave QoL: Omnibox Calc</span></div>
  </div>`;
}

function previewWidget() {
  return `<div class="panel preview-frame">
    <div class="preview-toolbar"><div class="preview-meta"><b>Field Notes — Design systems that last</b><span>1440 × 4860 px · shown at 72% · 3 overlays hidden</span></div><div class="preview-actions"><button class="ui-btn">Crop</button><button class="ui-btn">Actual</button><button class="ui-btn">Copy</button><button class="ui-btn primary">Save PNG</button><button class="ui-btn">WebP</button><button class="ui-btn">JPEG</button><button class="ui-btn">PDF</button></div></div>
    <div class="capture-stage"><article class="captured-page"><nav class="demo-nav"><span class="demo-logo">FIELD / NOTES</span><span class="demo-links"><span>Stories</span><span>Methods</span><span>About</span></span></nav><section class="demo-hero"><div><div class="demo-eyebrow">Issue 24 · Product craft</div><h2>Design systems that survive real work.</h2><p>A practical field guide to building interfaces that stay coherent as products, teams, and constraints grow.</p></div><div class="demo-art"></div></section><section class="demo-stats"><div class="demo-stat"><b>42</b><span>Components</span></div><div class="demo-stat"><b>7</b><span>Platforms</span></div><div class="demo-stat"><b>96%</b><span>Coverage</span></div></section><section class="demo-copy"><div><h3>Start with decisions</h3><p>Strong systems record why a pattern exists, not only how it looks. That context helps the next person make a compatible choice.</p></div><div><h3>Make quality visible</h3><p>Examples, constraints, and ownership turn a component library into a shared way of working across the whole product.</p></div></section></article></div>
  </div>`;
}

function omniboxPage({ classes = "paper", kicker, title, sub, expression, result, label, footer }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
    <main class="canvas ${classes} omnibox-layout">${brand()}<div class="kicker">${kicker}</div><h1>${title}</h1><p class="sub">${sub}</p>
      <section class="omnibox-card"><div class="label">${label}</div>${omniboxWidget(expression, result)}<div class="result-line">${footer}</div></section>
    </main></body></html>`;
}

const shots = [
  {
    output: join(calcDir, "screenshot-1-functions.png"),
    html: omniboxPage({ kicker:"Omnibox Calculator", title:"Math, right in the address bar.", sub:"No calculator tab. No search results. Just type an expression and get the answer.", expression:"sqrt(144) + 7^2 - 3", result:"58", label:"Live result", footer:'<span><span class="key">=</span> then <span class="key">Space</span></span><strong>Press Enter to copy</strong>' }),
  },
  {
    output: join(calcDir, "screenshot-2-percentage.png"),
    html: omniboxPage({ classes:"paper orange", kicker:"Everyday calculations", title:"Prices, percentages, and quick checks.", sub:"Calculate directly where you already type—without sending the expression to a website.", expression:"342.50 * 1.08", result:"369.9", label:"Price plus 8%", footer:'<span>342.50 × 1.08</span><strong>369.9</strong>' }),
  },
  {
    output: join(calcDir, "screenshot-3-range.png"),
    html: page({ classes:"dark", kicker:"More than basic arithmetic", title:"Functions and powers included.", sub:"Use parentheses, square roots, trigonometry, logarithms, powers, and percentages.", visual:`<div class="two-cards"><div class="math-card"><div class="mini">${omniboxWidget("sqrt(144) + 7^2 - 3", "58")}</div><div class="caption"><b>sqrt(144) + 7^2 - 3</b>Functions and powers</div></div><div class="math-card"><div class="mini">${omniboxWidget("342.50 * 1.08", "369.9")}</div><div class="caption"><b>342.50 × 1.08</b>Practical calculations</div></div></div>`, extra:'<div class="note"><span class="key">Enter</span><span>copies the result to your clipboard</span></div>' }),
  },
  {
    output: join(captureDir, "screenshot-1-menu.png"),
    html: page({ classes:"paper orange", kicker:"Full Page Capture", title:"The whole page. One clean capture.", sub:"Save an entire scrollable page as one continuous image—not only what is visible on screen.", visual:previewWidget(), extra:'<div class="steps"><span class="step"><i>1</i>Choose a destination</span><span class="step"><i>2</i>Capture</span><span class="step"><i>3</i>Export</span></div>' }),
  },
  {
    output: join(captureDir, "screenshot-2-capturing.png"),
    html: page({ classes:"dark", kicker:"One click, three destinations", title:"Save, copy, or preview.", sub:"Choose where the finished capture goes. Your last choice is remembered for the keyboard shortcut.", visual:`<div class="popup-shell"><iframe src="${popupIdle}"></iframe></div>`, extra:'<div class="note"><span class="key">Alt+Shift+C</span><span>capture with the keyboard</span></div>' }),
  },
  {
    output: join(captureDir, "screenshot-3-formats.png"),
    html: page({ classes:"paper", kicker:"Flexible export", title:"The format you need.", sub:"Keep text crisp with PNG or WebP, choose JPEG for smaller files, or export the page as PDF.", visual:`<div class="panel toolbar-card"><div class="format-toolbar"><button class="ui-btn">Crop</button><button class="ui-btn">Actual</button><button class="ui-btn">Copy</button><button class="ui-btn primary">Save PNG</button><button class="ui-btn">WebP</button><button class="ui-btn">JPEG</button><button class="ui-btn">PDF</button></div><div class="format-grid"><div class="format">PNG</div><div class="format">WebP</div><div class="format">JPEG</div><div class="format">PDF</div></div></div>` }),
  },
  {
    output: join(captureDir, "screenshot-4-overlays.png"),
    html: page({ classes:"paper orange", kicker:"Cleaner output", title:"Leave sticky clutter behind.", sub:"Optionally remove cookie banners, floating bars, and other pinned elements before the page is stitched.", visual:`<div class="popup-shell"><iframe src="${popupOverlays}"></iframe></div>`, extra:'<div class="note"><span class="key">On</span><span>The popup counts pinned elements on the current page</span></div>' }),
  },
  {
    output: join(captureDir, "screenshot-5-progress.png"),
    html: page({ classes:"dark", kicker:"Visible and cancellable", title:"Know what is happening.", sub:"Capture progress stays visible, and you can cancel at any time while the page is being assembled.", visual:`<div class="popup-shell running"><iframe src="${popupRunning}"></iframe></div>`, extra:'<div class="note"><span class="key">Esc</span><span>cancel the capture</span></div>' }),
  },
];

const shotFilter = process.argv[2];
const selectedShots = shotFilter ? shots.filter((shot) => shot.output.includes(shotFilter)) : shots;
if (shotFilter && selectedShots.length === 0) throw new Error(`No screenshot matches: ${shotFilter}`);

for (const [index, shot] of selectedShots.entries()) {
  const pagePath = join(renderDir, `shot-${index + 1}.html`);
  const profilePath = join(profileRoot, `profile-${index + 1}`);
  writeFileSync(pagePath, shot.html);
  execFileSync("xvfb-run", [
    "-a", "-s", "-screen 0 2560x1664x24",
    join(root, "render-page.sh"), pathToFileURL(pagePath).href, shot.output, profilePath,
  ], { stdio: "ignore", env: process.env });
  process.stdout.write(`rendered ${shot.output.slice(root.length + 1)}\n`);
}
