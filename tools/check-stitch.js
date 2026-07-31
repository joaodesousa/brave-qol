// Checks how slices are composed into the final image, by running the real
// stitch functions against stubbed canvas APIs and recording every draw call.
// Geometry bugs here are invisible in code review and obvious only in a
// finished screenshot, which is a slow way to find them.

const { readBackground, extractFunction, extractConst, createChecker } = require("./lib");

const VIEWPORT_W = 1795;
const VIEWPORT_H = 850;

function loadStitchers({ bitmapWidth = VIEWPORT_W, bitmapHeight = VIEWPORT_H } = {}) {
  const draws = [];
  const canvases = [];

  const sandbox = {
    fetch: async () => ({ blob: async () => ({}) }),
    createImageBitmap: async () => ({ width: bitmapWidth, height: bitmapHeight, close() {} }),
    OffscreenCanvas: class {
      constructor(w, h) {
        this.width = w;
        this.height = h;
        canvases.push(this);
      }
      getContext(type, options) {
        draws.push({ op: "context", alpha: options && options.alpha });
        return {
          imageSmoothingQuality: "",
          fillStyle: "",
          scale(x, y) {
            draws.push({ op: "scale", x, y });
          },
          fillRect(x, y, w, h) {
            draws.push({ op: "fill", x, y, w, h });
          },
          drawImage(_img, sx, sy, sw, sh, dx, dy, dw, dh) {
            draws.push({ op: "draw", sx, sy, sw, sh, dx, dy, dw, dh });
          },
        };
      }
      async convertToBlob() {
        return {};
      }
    },
  };

  const src = readBackground();
  const source = [
    ...["MAX_CANVAS_SIDE_PX", "MAX_CANVAS_AREA_PX"].map((name) => extractConst(src, name)),
    ...["canvasScaleFor", "createOutputCanvas", "decodeSlice", "stitchDocument", "stitchContainer"].map((name) =>
      extractFunction(src, name)
    ),
  ].join("\n");

  const factory = new Function(
    "fetch",
    "createImageBitmap",
    "OffscreenCanvas",
    `${source}; return { stitchDocument, stitchContainer, canvasScaleFor };`
  );
  const api = factory(sandbox.fetch, sandbox.createImageBitmap, sandbox.OffscreenCanvas);
  return { ...api, draws, canvases };
}

const check = createChecker("stitch geometry");

(async () => {
  // --- container mode, real numbers from a siges.pt/dashboard capture ---
  {
    const { stitchContainer, draws, canvases } = loadStitchers();
    const metrics = {
      mode: "container",
      region: { x: 256, y: 48, width: 1524, height: 802 },
      viewportHeight: VIEWPORT_H,
      viewportWidth: VIEWPORT_W,
      pageWidth: 1780,
      dpr: 1,
    };
    await stitchContainer([{ dataUrl: "a", offset: 0 }, { dataUrl: "b", offset: 541 }], metrics, 1343, 1);

    // Page-width canvas so the sidebar has somewhere to live; chrome + content tall.
    check("canvas is page-width, chrome + content tall", [canvases[0].width, canvases[0].height], [1780, 1391]);

    const drawCalls = draws.filter((d) => d.op === "draw");
    const first = drawCalls[0];
    check("first screen drawn whole at the top", [first.dx, first.dy, first.dw, first.dh], [0, 0, 1780, 850]);

    const gutters = drawCalls.filter((d) => d.sh === 1);
    check("one gutter, stretched from a 1px row", gutters.length, 1);
    check("gutter covers the sidebar column below the first screen",
      [gutters[0].dx, gutters[0].dw, gutters[0].dy, gutters[0].dh], [0, 256, 850, 541]);

    const panels = drawCalls.filter((d) => d.sw === 1524 && d.sh === 802);
    check("panels stack below the chrome, stepped by offset",
      panels.map((d) => [d.dx, d.dy]), [[256, 48], [256, 589]]);

    check("nothing overflows the canvas",
      drawCalls.filter((d) => d.dy + d.dh > canvases[0].height).length, 0);

    // An opaque canvas saves the PNG a whole channel, but starts black — so
    // it must be painted before anything is drawn, or a region no slice
    // covers comes out as a black band.
    check("canvas is opaque", draws.find((d) => d.op === "context").alpha, false);
    const firstFill = draws.findIndex((d) => d.op === "fill");
    const firstDraw = draws.findIndex((d) => d.op === "draw");
    check("it is painted before anything is drawn", firstFill >= 0 && firstFill < firstDraw, true);
    const fill = draws[firstFill];
    check("the paint covers the whole canvas",
      [fill.x, fill.y, fill.w, fill.h], [0, 0, canvases[0].width, canvases[0].height]);
  }

  // --- document mode ---
  {
    const { stitchDocument, draws, canvases } = loadStitchers();
    const region = { x: 0, y: 0, width: 1780, height: 850 };
    await stitchDocument([{ dataUrl: "a", offset: 0 }, { dataUrl: "b", offset: 850 }], region, 1700, 1);
    check("document canvas is content-width, full page height", [canvases[0].width, canvases[0].height], [1780, 1700]);
    check("slices laid end to end",
      draws.filter((d) => d.op === "draw").map((d) => d.dy), [0, 850]);
  }

  // --- the canvas ceiling ---
  {
    const { canvasScaleFor } = loadStitchers();
    check("a normal page is not scaled", canvasScaleFor(1780, 4000), 1);

    // Regression guard: an expresso.pt capture measured 1780x16734 and was
    // verified to come out complete. Scaling it would throw away detail from a
    // page that works, so any limit that touches this size is wrong.
    check("a verified-good 29.8Mpx capture is not scaled", canvasScaleFor(1780, 16734), 1);
    check("the same page at dpr 2 is still not scaled", canvasScaleFor(3560, 33468), 1);

    // Area binding on its own: both sides are legal, the product is not.
    const areaBound = canvasScaleFor(20000, 20000); // 400 Mpx, past 2^28
    check("a capture past the area cap is scaled down", Math.round(areaBound * 10000) / 10000, 0.8192);
    check("scaling brings it under the area cap", 20000 * areaBound * (20000 * areaBound) <= 268435456 + 1, true);

    // Side binding on its own: a very long page hits 65535 first.
    const sideBound = canvasScaleFor(3560, 100000);
    check("the per-side limit binds on very long pages", Math.round(sideBound * 10000) / 10000, 0.6554);
    check("scaling brings it under the side limit", Math.floor(100000 * sideBound) <= 65535, true);
  }

  {
    const { stitchDocument, canvases } = loadStitchers();
    const region = { x: 0, y: 0, width: 1780, height: 850 };
    await stitchDocument([{ dataUrl: "a", offset: 0 }], region, 200000, 1);
    const { width, height } = canvases[0];
    check("oversized canvas is allocated within both limits",
      width <= 65535 && height <= 65535 && width * height <= 268435456, true);
  }

  process.exit(check.done());
})();
