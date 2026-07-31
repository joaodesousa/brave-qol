// Preview tab: review the capture, optionally crop it, then export.
//
// Exporting from here rather than the service worker is deliberate — this is a
// real document, so it has a canvas, a clipboard and the ability to encode
// JPEG, none of which a service worker has.

const $ = (id) => document.getElementById(id);

// A4 at 72dpi, used to decide where a long capture breaks across PDF pages.
const A4_RATIO = 842 / 595.28;
// High enough that JPEG artefacts stay off screenshot text, which is the
// least forgiving subject for the format — flat colour with hard edges.
const JPEG_QUALITY = 0.96;
// WebP holds hard edges far better than JPEG at the same setting, so text
// stays clean well below the quality this would need in JPEG.
const WEBP_QUALITY = 0.92;

let capture = null; // { dataUrl, width, height, sourceUrl, sourceTitle }
let bitmap = null; // decoded once, reused for every export
let crop = null; // { x, y, w, h } in image pixels, or null for the whole image

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function describe() {
  const region = crop ? `${Math.round(crop.w)} × ${Math.round(crop.h)} selected of ` : "";
  const scaled = capture.scale && capture.scale < 1 ? ` · capture scaled to ${Math.round(capture.scale * 100)}%` : "";
  // Displayed percentage, so a soft-looking preview is never mistaken for a
  // soft capture — the saved file is always full size. Measured in device
  // pixels, which is what "100%" means to the eye on a scaled display.
  const displayedDevicePx = $("image").clientWidth * window.devicePixelRatio;
  const shown = `${Math.round((displayedDevicePx / capture.width) * 100)}%`;
  // Confirms the hide-overlays setting did something, rather than leaving you
  // to work out what is missing from the image.
  const hidden = capture.hiddenCount
    ? ` · ${capture.hiddenCount} overlay${capture.hiddenCount === 1 ? "" : "s"} hidden`
    : "";
  $("meta").textContent = `${region}${capture.width} × ${capture.height} px${scaled} · shown at ${shown}${hidden}`;
}

function toggleZoom() {
  const frame = $("frame");
  const actual = frame.classList.toggle("is-actual");

  // "Actual pixels" has to mean one captured pixel per *device* pixel. Left
  // at its natural CSS size the browser stretches the image by the display
  // scale — on a 107%-scaled display that resamples every glyph edge, making
  // a pixel-exact capture look blurry.
  $("image").style.width = actual ? `${capture.width / window.devicePixelRatio}px` : "";

  $("zoom-label").textContent = actual ? "Fit" : "Actual";
  $("zoom").classList.toggle("is-active", actual);
  describe();
}

// Everything exported goes through here, so crop applies uniformly.
function renderToCanvas() {
  const region = crop || { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(region.w));
  canvas.height = Math.max(1, Math.round(region.h));

  // Opaque: screenshots have no transparency, and the alpha channel is dead
  // weight in the PNG. It also means JPEG and PDF need no separate flatten
  // pass — an unpainted RGBA canvas composites to black in those formats.
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, region.x, region.y, region.w, region.h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(`could not encode ${type}`))), type, quality);
  });
}

function baseFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let host = "capture";
  try {
    host = new URL(capture.sourceUrl).hostname.replace(/^www\./, "") || host;
  } catch {
    /* keep the fallback */
  }
  return `${host}-${stamp}`;
}

function download(blob, extension) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${baseFilename()}.${extension}`;
  link.click();
  // Revoke on the next turn: revoking synchronously can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function savePng() {
  const blob = await canvasToBlob(renderToCanvas(), "image/png");
  download(blob, "png");
  toast(`Saved PNG · ${formatBytes(blob.size)}`);
}

async function saveJpeg() {
  const blob = await canvasToBlob(renderToCanvas(), "image/jpeg", JPEG_QUALITY);
  download(blob, "jpg");
  toast(`Saved JPEG · ${formatBytes(blob.size)}`);
}

// Usually the best trade for a screenshot: sharp text like PNG, photographic
// regions compressed like JPEG, typically a fraction of the PNG's size.
async function saveWebp() {
  const blob = await canvasToBlob(renderToCanvas(), "image/webp", WEBP_QUALITY);
  download(blob, "webp");
  toast(`Saved WebP · ${formatBytes(blob.size)}`);
}

// A tall capture becomes several A4-shaped pages rather than one absurdly
// long one, which is what makes the PDF printable.
async function savePdf() {
  const canvas = renderToCanvas();
  const pageHeight = Math.round(canvas.width * A4_RATIO);
  const pageCount = Math.max(1, Math.ceil(canvas.height / pageHeight));
  const pages = [];

  for (let i = 0; i < pageCount; i++) {
    const y = i * pageHeight;
    const sliceHeight = Math.min(pageHeight, canvas.height - y);

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const ctx = pageCanvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    const jpegBlob = await canvasToBlob(pageCanvas, "image/jpeg", JPEG_QUALITY);
    pages.push({
      jpeg: new Uint8Array(await jpegBlob.arrayBuffer()),
      width: pageCanvas.width,
      height: pageCanvas.height,
    });
  }

  const blob = self.QolPdf.buildPdf(pages);
  download(blob, "pdf");
  toast(`Saved PDF · ${pageCount} page${pageCount === 1 ? "" : "s"} · ${formatBytes(blob.size)}`);
}

async function copy() {
  const blob = await canvasToBlob(renderToCanvas(), "image/png");
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast("Copied to clipboard");
  } catch (err) {
    toast(`Couldn't copy: ${err.message}`);
  }
}

// ---------- crop ----------

let dragging = null;

function setCropMode(on) {
  $("overlay").hidden = !on;
  $("crop").classList.toggle("is-active", on);
  if (!on) return;
  $("crop-label").textContent = "Done";
}

function clearCrop() {
  crop = null;
  dragging = null;
  $("selection").hidden = true;
  $("overlay").classList.remove("has-selection");
  $("crop-label").textContent = "Crop";
  describe();
}

function pointerPosition(event) {
  const rect = $("image").getBoundingClientRect();
  return {
    x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
    y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
    scale: bitmap.width / rect.width, // displayed px -> image px
  };
}

function drawSelection(a, b) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const width = Math.abs(a.x - b.x);
  const height = Math.abs(a.y - b.y);

  const selection = $("selection");
  selection.style.left = `${left}px`;
  selection.style.top = `${top}px`;
  selection.style.width = `${width}px`;
  selection.style.height = `${height}px`;
  selection.hidden = false;
  $("overlay").classList.add("has-selection");

  return { left, top, width, height, scale: a.scale };
}

function initCropHandlers() {
  const overlay = $("overlay");

  overlay.addEventListener("pointerdown", (event) => {
    overlay.setPointerCapture(event.pointerId);
    dragging = pointerPosition(event);
    drawSelection(dragging, dragging);
  });

  overlay.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    drawSelection(dragging, pointerPosition(event));
  });

  overlay.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    const box = drawSelection(dragging, pointerPosition(event));
    dragging = null;

    // A click rather than a drag clears the selection instead of cropping to
    // nothing, which would otherwise look like the image vanishing.
    if (box.width < 4 || box.height < 4) {
      clearCrop();
      return;
    }

    crop = {
      x: box.left * box.scale,
      y: box.top * box.scale,
      w: box.width * box.scale,
      h: box.height * box.scale,
    };
    describe();
  });
}

// ---------- boot ----------

async function init() {
  capture = await chrome.runtime.sendMessage({ type: "qol-get-capture" });

  if (!capture || !capture.dataUrl) {
    $("empty").hidden = false;
    for (const id of ["crop", "zoom", "copy", "png", "webp", "jpg", "pdf"]) $(id).disabled = true;
    return;
  }

  const image = $("image");
  image.src = capture.dataUrl;
  await image.decode();
  bitmap = await createImageBitmap(await (await fetch(capture.dataUrl)).blob());

  $("frame").hidden = false;
  $("title").textContent = capture.sourceTitle || capture.sourceUrl || "Capture";
  document.title = `${capture.sourceTitle || "Capture"} · preview`;
  describe();

  initCropHandlers();
  $("crop").addEventListener("click", () => {
    const turningOff = !$("overlay").hidden;
    if (turningOff && !crop) clearCrop();
    setCropMode(!turningOff);
    if (turningOff) $("crop-label").textContent = crop ? "Recrop" : "Crop";
  });
  $("zoom").addEventListener("click", toggleZoom);
  $("copy").addEventListener("click", copy);
  // The fitted percentage depends on the window width.
  window.addEventListener("resize", describe);
  $("png").addEventListener("click", savePng);
  $("webp").addEventListener("click", saveWebp);
  $("jpg").addEventListener("click", saveJpeg);
  $("pdf").addEventListener("click", savePdf);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("overlay").hidden) {
      clearCrop();
      setCropMode(false);
    }
  });
}

init();
