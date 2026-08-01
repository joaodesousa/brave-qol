#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const assetsRoot = dirname(fileURLToPath(import.meta.url));
const renderDir = join(assetsRoot, ".render");

mkdirSync(renderDir, { recursive: true });

const require = createRequire(import.meta.url);
let chromium;
let sharp;
try {
  ({ chromium } = require("playwright"));
  sharp = require("sharp");
} catch {
  throw new Error(
    "Playwright and Sharp are required to compose store assets. Install them as dev dependencies or expose them through NODE_PATH."
  );
}

const browser = process.env.BRAVE_BIN || [
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/brave-browser",
  "/usr/bin/brave",
].find(existsSync);

if (!browser) {
  throw new Error("Brave was not found. Set BRAVE_BIN to the browser executable.");
}

function imageData(relativePath) {
  const absolutePath = join(assetsRoot, "source", "native-retina", relativePath);
  return `data:image/png;base64,${readFileSync(absolutePath).toString("base64")}`;
}

const css = `
  :root {
    color-scheme: light;
    --paper: #f3f1ec;
    --ink: #14171a;
    --teal: #00968c;
    --orange: #ff5a1e;
    --paper-muted: #b9b6ae;
    --ink-muted: #5f6663;
    --line-light: #d8d4cb;
    --line-dark: #343a3b;
    --teal-soft: #d9f2ed;
    --orange-soft: #ffe0cf;
  }

  * { box-sizing: border-box; }
  html, body { width: 1280px; height: 800px; margin: 0; overflow: hidden; }
  body { background: var(--paper); }

  .canvas {
    --accent: var(--teal);
    --accent-soft: var(--teal-soft);
    position: relative;
    width: 1280px;
    height: 800px;
    overflow: hidden;
    color: var(--ink);
    background: var(--paper);
    font-family: "Avenir Next", Avenir, "Helvetica Neue", sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .canvas.dark {
    color: var(--paper);
    background: var(--ink);
    --accent: #24b8ad;
    --accent-soft: #203b39;
    --ink-muted: #b3b7b2;
  }

  .canvas.teal-field { background: var(--teal-soft); --accent: var(--teal); --accent-soft: #bfe8df; }
  .canvas.orange-field { background: var(--orange-soft); --accent: var(--orange); --accent-soft: #ffc3a4; }
  .canvas.dark.teal-field { background: var(--ink); --accent: #25b9ae; --accent-soft: #203b39; }
  .canvas.dark.orange { background: var(--ink); --accent: #ff7442; --accent-soft: #48291f; }

  .canvas::before {
    content: "";
    position: absolute;
    width: 360px;
    height: 360px;
    right: -120px;
    top: -150px;
    border: 46px solid var(--accent);
    border-radius: 50%;
    opacity: .2;
  }

  .top-rule {
    position: absolute;
    left: 58px;
    right: 58px;
    top: 108px;
    border-top: 2px dashed var(--line-light);
  }
  .dark .top-rule { border-color: var(--line-dark); }

  .brand {
    position: absolute;
    top: 44px;
    left: 58px;
    display: flex;
    align-items: center;
    gap: 12px;
    font: 650 20px/1 ui-monospace, "SFMono-Regular", Consolas, monospace;
    letter-spacing: -.04em;
  }

  .brand-mark {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: var(--paper);
    background: var(--ink);
    transform: rotate(-4deg);
  }
  .dark .brand-mark { color: var(--ink); background: var(--paper); }
  .brand-mark svg { width: 20px; height: 20px; }

  .folio {
    position: absolute;
    top: 52px;
    right: 58px;
    font: 700 12px/1 ui-monospace, "SFMono-Regular", Consolas, monospace;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 999px;
    padding: 9px 13px;
    transform: rotate(2deg);
  }
  .dark .folio { color: var(--paper); background: #23292a; border-color: var(--paper); }

  .copy {
    position: absolute;
    z-index: 3;
    left: 58px;
    top: 152px;
    width: 380px;
  }

  .kicker {
    display: inline-block;
    margin: 0 0 22px -5px;
    padding: 10px 13px 9px;
    color: var(--paper);
    background: var(--accent);
    border: 2px solid var(--ink);
    border-radius: 999px;
    font: 750 13px/1 ui-monospace, "SFMono-Regular", Consolas, monospace;
    letter-spacing: .12em;
    text-transform: uppercase;
    transform: rotate(-2deg);
  }
  .dark .kicker { color: var(--ink); border-color: var(--paper); }

  h1 {
    margin: 0 0 24px -.035em;
    font-family: "SF Pro Rounded", "Arial Rounded MT Bold", "Avenir Next", sans-serif;
    font-size: 59px;
    font-weight: 900;
    line-height: .93;
    letter-spacing: -.052em;
    text-wrap: balance;
  }

  .dek {
    width: 330px;
    margin: 0;
    color: var(--ink-muted);
    font-size: 18px;
    line-height: 1.5;
    letter-spacing: -.012em;
  }

  .proof {
    position: absolute;
    z-index: 2;
    left: 458px;
    top: 160px;
    width: 864px;
    height: 540px;
    overflow: hidden;
    border: 3px solid var(--ink);
    border-radius: 20px;
    background: #26292d;
    box-shadow: 16px 18px 0 var(--accent);
    transform: rotate(-1.1deg);
    transform-origin: 50% 50%;
  }
  .dark .proof {
    border-color: var(--paper);
    box-shadow: 16px 18px 0 var(--accent);
    transform: rotate(1deg);
  }
  .proof img { display: block; width: 100%; height: 100%; object-fit: cover; }

  .caption {
    position: absolute;
    z-index: 4;
    right: 48px;
    bottom: 36px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 999px;
    padding: 9px 12px;
    font: 650 11px/1.3 ui-monospace, "SFMono-Regular", Consolas, monospace;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .index {
    position: absolute;
    left: 58px;
    bottom: 40px;
    width: 72px;
    height: 72px;
    display: grid;
    place-items: center;
    color: var(--ink);
    background: var(--accent);
    border: 3px solid var(--ink);
    border-radius: 50%;
    font: 900 27px/1 "SF Pro Rounded", "Arial Rounded MT Bold", sans-serif;
    transform: rotate(-7deg);
  }
  .dark .index { color: var(--ink); border-color: var(--paper); }

  .symbol {
    position: absolute;
    left: 24px;
    bottom: 94px;
    color: var(--accent);
    font: 900 205px/.75 "SF Pro Rounded", "Arial Rounded MT Bold", sans-serif;
    letter-spacing: -.1em;
    opacity: .12;
    transform: rotate(-8deg);
  }

  .spark, .spark::before, .spark::after {
    position: absolute;
    width: 14px;
    height: 14px;
    content: "";
    background: var(--orange);
    border: 2px solid var(--ink);
    transform: rotate(12deg);
  }
  .spark { left: 388px; top: 132px; }
  .spark::before { left: -23px; top: 26px; background: var(--teal); }
  .spark::after { left: 24px; top: 34px; background: var(--paper); }

  .layout-low .copy { top: 178px; }
  .layout-low .proof { top: 140px; transform: rotate(1.2deg); }
  .layout-low.dark .proof { transform: rotate(-1.1deg); }

  .layout-wide .copy { width: 410px; }
  .layout-wide .proof { left: 490px; width: 835px; }

  .layout-quiet h1 { font-size: 56px; }
  .layout-quiet .proof { left: 445px; width: 875px; }
`;

function mark() {
  return `<span class="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m10 7 12 9-12 9" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
}

function page(shot) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
    <main class="canvas ${shot.scheme} ${shot.layout || ""}">
      <div class="brand">${mark()}<span>brave-qol</span></div>
      <div class="folio">Chrome Web Store · ${shot.number}</div>
      <div class="top-rule"></div>
      <div class="symbol">${shot.symbol}</div>
      <div class="spark"></div>
      <div class="index">${shot.number}</div>
      <section class="copy">
        <div class="kicker">${shot.kicker}</div>
        <h1>${shot.title}</h1>
        <p class="dek">${shot.dek}</p>
      </section>
      <figure class="proof"><img src="${imageData(shot.source)}" alt="" /></figure>
      <div class="caption">Actual Brave UI · 1280 × 800</div>
    </main>
  </body></html>`;
}

const shots = [
  {
    number: "01",
    symbol: "=",
    source: "omnibox-calc/screenshot-1-functions.png",
    output: "omnibox-calc/screenshot-1-functions.png",
    scheme: "teal-field",
    kicker: "Omnibox Calculator",
    title: "Math, right where you type.",
    dek: "Type = then Space. The answer appears before you leave the address bar.",
  },
  {
    number: "02",
    symbol: "%",
    source: "omnibox-calc/screenshot-2-percentage.png",
    output: "omnibox-calc/screenshot-2-percentage.png",
    scheme: "dark orange layout-low",
    kicker: "Everyday calculations",
    title: "Quick totals. Zero detours.",
    dek: "Prices, percentages, and everyday checks, without opening a calculator tab.",
  },
  {
    number: "03",
    symbol: "√",
    source: "omnibox-calc/screenshot-3-range.png",
    output: "omnibox-calc/screenshot-3-range.png",
    scheme: "orange-field",
    layout: "layout-quiet",
    kicker: "More than arithmetic",
    title: "Functions in the address bar.",
    dek: "Square roots, powers, logarithms, trigonometry, and parentheses are built in.",
  },
  {
    number: "01",
    symbol: "↕",
    source: "fullpage-capture/screenshot-1-menu.png",
    output: "fullpage-capture/screenshot-1-menu.png",
    scheme: "orange-field",
    kicker: "Full Page Capture",
    title: "The whole page. One clean capture.",
    dek: "Save, copy, or preview an entire scrollable page from one compact menu.",
  },
  {
    number: "02",
    symbol: "…",
    source: "fullpage-capture/screenshot-2-capturing.png",
    output: "fullpage-capture/screenshot-2-capturing.png",
    scheme: "dark teal-field layout-low",
    kicker: "Clear feedback",
    title: "You always know what’s happening.",
    dek: "A real progress state keeps long captures understandable from start to finish.",
  },
  {
    number: "03",
    symbol: "PDF",
    source: "fullpage-capture/screenshot-3-formats.png",
    output: "fullpage-capture/screenshot-3-formats.png",
    scheme: "teal-field",
    layout: "layout-quiet",
    kicker: "Flexible export",
    title: "Pick the format you need.",
    dek: "PNG, WebP, JPEG, or PDF. The current choice stays visible before capture.",
  },
  {
    number: "04",
    symbol: "✦",
    source: "fullpage-capture/screenshot-4-overlays.png",
    output: "fullpage-capture/screenshot-4-overlays.png",
    scheme: "dark orange layout-wide",
    kicker: "Cleaner output",
    title: "Leave sticky clutter behind.",
    dek: "Detect and omit sticky bars, floating panels, and cookie notices.",
  },
  {
    number: "05",
    symbol: "94",
    source: "fullpage-capture/screenshot-5-progress.png",
    output: "fullpage-capture/screenshot-5-progress.png",
    scheme: "teal-field",
    kicker: "Visible and cancellable",
    title: "Progress you can see. Stop any time.",
    dek: "Live slice counts and a clear cancel action keep you in control.",
  },
];

const filter = process.argv[2];
const selected = filter ? shots.filter((shot) => shot.output.includes(filter)) : shots;
if (filter && selected.length === 0) throw new Error(`No screenshot matches: ${filter}`);

const browserInstance = await chromium.launch({ headless: true, executablePath: browser });
try {
  for (const [index, shot] of selected.entries()) {
    const htmlPath = join(renderDir, `design-${index + 1}.html`);
    const outputPath = join(assetsRoot, shot.output);
    const retinaPath = join(renderDir, `design-${index + 1}@2x.png`);
    writeFileSync(htmlPath, page(shot));
    const context = await browserInstance.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const browserPage = await context.newPage();
    await browserPage.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await browserPage.screenshot({ path: retinaPath });
    await context.close();
    await sharp(retinaPath)
      .resize(1280, 800, { kernel: sharp.kernel.lanczos3 })
      .sharpen({ sigma: 0.5 })
      .png({ compressionLevel: 9, palette: false })
      .toFile(outputPath);
    rmSync(retinaPath, { force: true });
    process.stdout.write(`composed ${shot.output}\n`);
  }
} finally {
  await browserInstance.close();
}
