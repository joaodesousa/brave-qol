importScripts("captureStore.js");

const CAPTURE_DELAY_MS = 600; // must stay above 500ms: captureVisibleTab hard-caps at 2 calls/sec
const RATE_LIMIT_RETRY_MS = 800;
const HIDE_SETTLE_MS = 150;
const MAX_SLICES = 60; // infinite-scroll safety stop
const CLIPBOARD_TIMEOUT_MS = 15000;
// Blink caps canvas dimensions and area with no exception, just a blank
// bitmap; these are the measured actual limits, not a cautious guess.
const MAX_CANVAS_SIDE_PX = 65535;
const MAX_CANVAS_AREA_PX = 268435456; // 2^28 px

const DEBUG_FIXED_ELEMENTS = false; // logs the sticky/fixed dedup decisions

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

async function captureVisibleTabWithRetry(windowId, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    } catch (err) {
      const isRateLimit = /MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/.test(err.message || "");
      if (!isRateLimit || attempt === maxRetries) throw err;
      await sleep(RATE_LIMIT_RETRY_MS);
    }
  }
}

async function execFn(tabId, func, args = []) {
  const frames = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
  // A thrown injected function can come back as an empty result, not a rejection.
  if (!frames || frames.length === 0) {
    throw new Error(`injecting ${func.name}() produced no result — the tab may have navigated or closed`);
  }
  const [{ result, error }] = frames;
  if (error) {
    throw new Error(`${func.name}() threw in the page: ${(error && error.message) || error}`);
  }
  return result;
}

function getPageMetrics() {
  // Nested: serialized and injected, so it can't reference this scope.
  const findScrollContainer = () => {
    let best = null;
    let bestArea = 0;
    for (const el of document.querySelectorAll("body *")) {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") continue;
      if (el.scrollHeight <= el.clientHeight + 2) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 240 || rect.height < 240) continue;
      const area = rect.width * rect.height;
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    }
    return best;
  };

  const de = document.documentElement;
  const body = document.body;
  const viewportHeight = window.innerHeight;
  const docHeight = Math.max(de.scrollHeight, body.scrollHeight, de.offsetHeight, body.offsetHeight, viewportHeight);
  const dpr = window.devicePixelRatio || 1;
  const documentScrolls = docHeight > viewportHeight + 2;

  if (!documentScrolls) {
    const container = findScrollContainer();
    if (container) {
      container.setAttribute("data-qol-scroll-container", "1");
      const rect = container.getBoundingClientRect();
      return {
        mode: "container",
        region: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: container.clientWidth,
          height: container.clientHeight,
        },
        step: container.clientHeight,
        totalHeight: container.scrollHeight,
        viewportHeight,
        viewportWidth: window.innerWidth,
        pageWidth: de.clientWidth,
        dpr,
        originalScroll: container.scrollTop,
      };
    }
  }

  return {
    mode: "document",
    // clientWidth excludes the scrollbar; captureVisibleTab includes it, so
    // slices are cropped down to clientWidth rather than fighting it with CSS.
    region: { x: 0, y: 0, width: de.clientWidth, height: viewportHeight },
    step: viewportHeight,
    totalHeight: docHeight,
    viewportHeight,
    viewportWidth: window.innerWidth,
    pageWidth: de.clientWidth,
    dpr,
    originalScroll: window.scrollY,
    originalScrollX: window.scrollX,
  };
}

// A fixed/sticky element already seen this page gets hidden; one seen for
// the first time is left alone, so it gets exactly one clean appearance.
// Identity is tracked both by a stamped attribute and by a fuzzy descriptor
// match, since some sites unmount/remount the element on reveal, which
// defeats node-identity tracking alone.
async function prepareFixedElementsForSlice(debug, hideAllOverlays, countOnly) {
  const POS_TOLERANCE_PX = 100; // absorbs sticky-reveal drift between slices
  const SIZE_TOLERANCE_PX = 8;

  const globalExisted = Boolean(window.__qolSeenFixed);
  if (!window.__qolSeenFixed && !countOnly) {
    window.__qolSeenFixed = [];
  }
  const seen = window.__qolSeenFixed || [];
  const seenSizeBefore = seen.length;
  const report = [];
  let hidCount = 0;

  const all = document.querySelectorAll("body *");
  for (const el of all) {
    const style = window.getComputedStyle(el);
    if (style.position !== "fixed" && style.position !== "sticky") continue;
    if (style.display === "none" || style.visibility === "hidden") continue;
    if (parseFloat(style.opacity) < 0.05) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) {
      continue;
    }

    const descriptor = {
      tag: el.tagName,
      id: el.id || null,
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    if (countOnly) {
      hidCount++;
      continue;
    }

    if (hideAllOverlays) {
      el.style.setProperty("transition", "none", "important");
      el.style.setProperty("visibility", "hidden", "important");
      el.setAttribute("data-qol-hidden-now", "1");
      hidCount++;
      continue;
    }

    const seenAsNode = el.hasAttribute("data-qol-seen-fixed");
    const seenAsDescriptor =
      !seenAsNode &&
      seen.some(
        (s) =>
          s.tag === descriptor.tag &&
          s.id === descriptor.id &&
          Math.abs(s.width - descriptor.width) <= SIZE_TOLERANCE_PX &&
          Math.abs(s.height - descriptor.height) <= SIZE_TOLERANCE_PX &&
          Math.abs(s.left - descriptor.left) <= POS_TOLERANCE_PX &&
          Math.abs(s.top - descriptor.top) <= POS_TOLERANCE_PX
      );
    const matched = seenAsNode || seenAsDescriptor;

    if (debug) {
      let uid = el.getAttribute("data-qol-fixed-uid");
      const uidIsNew = uid === null;
      if (uidIsNew) {
        window.__qolFixedUidCounter = (window.__qolFixedUidCounter || 0) + 1;
        uid = String(window.__qolFixedUidCounter);
        el.setAttribute("data-qol-fixed-uid", uid);
      }
      report.push({
        uid,
        uidIsNew,
        matched,
        matchedBy: seenAsNode ? "node" : seenAsDescriptor ? "descriptor" : "",
        tag: el.tagName,
        id: el.id || null,
        className: typeof el.className === "string" ? el.className : String(el.className),
        position: style.position,
        opacity: style.opacity,
        transform: style.transform === "none" ? "none" : style.transform,
        transition: style.transitionProperty + " " + style.transitionDuration,
        rect: {
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }

    if (matched) {
      // Not display:none — a sticky element still occupies flow space, and
      // removing it would reflow the page and desync the scroll offsets.
      el.style.setProperty("transition", "none", "important");
      el.style.setProperty("visibility", "hidden", "important");
      el.setAttribute("data-qol-hidden-now", "1");
      hidCount++;
    } else {
      seen.push(descriptor);
      el.setAttribute("data-qol-seen-fixed", "1");
    }
  }

  // Wait a frame past the hide so the caller never captures a stale composite.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  return {
    hidCount,
    globalExisted,
    seenSizeBefore,
    seenSizeAfter: seen.length,
    innerHeight: window.innerHeight,
    scrollY: Math.round(window.scrollY),
    elements: report,
  };
}

function restoreFixedElements() {
  document.querySelectorAll('[data-qol-hidden-now="1"]').forEach((el) => {
    el.style.removeProperty("visibility");
    el.style.removeProperty("transition");
    el.removeAttribute("data-qol-hidden-now");
  });
  document.querySelectorAll("[data-qol-fixed-uid]").forEach((el) => {
    el.removeAttribute("data-qol-fixed-uid");
  });
  document.querySelectorAll("[data-qol-seen-fixed]").forEach((el) => {
    el.removeAttribute("data-qol-seen-fixed");
  });
  document.querySelectorAll("[data-qol-scroll-container]").forEach((el) => {
    el.removeAttribute("data-qol-scroll-container");
  });
  delete window.__qolSeenFixed;
  delete window.__qolFixedUidCounter;
}

function scrollTargetTo(mode, y, x = 0) {
  if (mode === "container") {
    const container = document.querySelector('[data-qol-scroll-container="1"]');
    if (container) container.scrollTop = y;
    return;
  }
  window.scrollTo(x, y);
}

// Re-measured every slice: lazy-loaded content can make the page taller than
// it measured at the start, and trusting that measurement clips the footer.
function getPageHeight(mode) {
  if (mode === "container") {
    const container = document.querySelector('[data-qol-scroll-container="1"]');
    return container ? container.scrollHeight : 0;
  }
  const de = document.documentElement;
  const body = document.body;
  return Math.max(de.scrollHeight, body.scrollHeight, de.offsetHeight, body.offsetHeight, window.innerHeight);
}

// Clamped so the final slice sits flush with the bottom, not past it.
function nextSliceOffset(y, step, totalHeight) {
  if (y + step > totalHeight) return Math.max(0, totalHeight - step);
  return y;
}

function installCancelHotkey() {
  if (window.__qolCancelHandler) return;
  const handler = (event) => {
    if (event.key !== "Escape") return;
    chrome.runtime.sendMessage({ type: "qol-cancel-capture" });
  };
  window.__qolCancelHandler = handler;
  // Capture phase, so a page that swallows Escape for its own modals can't
  // stop the cancel from reaching us.
  window.addEventListener("keydown", handler, true);
}

function removeCancelHotkey() {
  if (!window.__qolCancelHandler) return;
  window.removeEventListener("keydown", window.__qolCancelHandler, true);
  delete window.__qolCancelHandler;
}

// How much the finished image must shrink to be allocatable, 1 when it fits.
function canvasScaleFor(widthPx, heightPx) {
  let scale = Math.min(1, MAX_CANVAS_SIDE_PX / widthPx, MAX_CANVAS_SIDE_PX / heightPx);
  const area = widthPx * scale * (heightPx * scale);
  if (area > MAX_CANVAS_AREA_PX) scale *= Math.sqrt(MAX_CANVAS_AREA_PX / area);
  return scale;
}

// Allocates the output canvas at a size Blink will accept, applying the
// scale to the context so callers can keep drawing in full-size coordinates.
function createOutputCanvas(widthPx, heightPx) {
  const scale = canvasScaleFor(widthPx, heightPx);
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.floor(widthPx * scale)),
    Math.max(1, Math.floor(heightPx * scale))
  );
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingQuality = "high";

  // Opaque canvases start black; paint white first or any uncovered region
  // (a region no slice reaches) comes out as a black band.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (scale !== 1) ctx.scale(scale, scale);
  return { canvas, ctx, scale };
}

// Decoded, drawn and closed one at a time — holding every slice's bitmap
// live at once risks the service worker being killed mid-capture.
async function decodeSlice(slice) {
  const blob = await (await fetch(slice.dataUrl)).blob();
  slice.dataUrl = null;
  return createImageBitmap(blob);
}

async function stitchDocument(slices, region, totalHeight, dpr) {
  const sw = Math.round(region.width * dpr);
  const { canvas, ctx, scale } = createOutputCanvas(sw, Math.round(totalHeight * dpr));

  for (const slice of slices) {
    const bitmap = await decodeSlice(slice);
    // Clamp: a reflow mid-capture can leave the region larger than the bitmap.
    const cropW = Math.min(sw, bitmap.width);
    const cropH = Math.min(Math.round(region.height * dpr), bitmap.height);
    ctx.drawImage(bitmap, 0, 0, cropW, cropH, 0, Math.round(slice.offset * dpr), cropW, cropH);
    bitmap.close();
  }
  return { canvas, scale };
}

// The app's chrome (sidebar, header) doesn't scroll, so only the first
// screen draws it; later slices contribute just the scrolling panel.
async function stitchContainer(slices, metrics, totalHeight, dpr) {
  const { region, viewportHeight, pageWidth } = metrics;
  const px = (v) => Math.round(v * dpr);

  const chromeTop = region.y;
  const chromeBottom = Math.max(0, viewportHeight - (region.y + region.height));
  const canvasW = px(pageWidth);
  const canvasH = px(chromeTop + totalHeight + chromeBottom);

  const { canvas, ctx, scale } = createOutputCanvas(canvasW, canvasH);

  const sx = px(region.x);
  const sy = px(region.y);
  const sw = px(region.width);
  const sh = px(region.height);
  const drawPanel = (bitmap, offset) => {
    const cropW = Math.min(sw, bitmap.width - sx);
    const cropH = Math.min(sh, bitmap.height - sy);
    if (cropW > 0 && cropH > 0) {
      ctx.drawImage(bitmap, sx, sy, cropW, cropH, sx, px(chromeTop + offset), cropW, cropH);
    }
  };

  const first = await decodeSlice(slices[0]);

  // The whole first screen, so the sidebar/header appear exactly once.
  ctx.drawImage(first, 0, 0, canvasW, px(viewportHeight), 0, 0, canvasW, px(viewportHeight));

  // Continue the gutters beside the panel by stretching their bottom pixel row.
  const fillTop = px(viewportHeight);
  const fillBottom = canvasH - px(chromeBottom);
  const sampleY = Math.min(px(region.y + region.height) - 1, first.height - 1);
  if (fillBottom > fillTop) {
    const gutters = [
      { x: 0, w: px(region.x) },
      { x: px(region.x + region.width), w: canvasW - px(region.x + region.width) },
    ];
    for (const g of gutters) {
      if (g.w > 0) {
        ctx.drawImage(first, g.x, sampleY, g.w, 1, g.x, fillTop, g.w, fillBottom - fillTop);
      }
    }
  }

  // Anything below the panel (a status bar) belongs at the very bottom.
  if (chromeBottom > 0) {
    ctx.drawImage(
      first,
      0,
      px(region.y + region.height),
      canvasW,
      px(chromeBottom),
      0,
      canvasH - px(chromeBottom),
      canvasW,
      px(chromeBottom)
    );
  }

  drawPanel(first, slices[0].offset);
  first.close();

  for (const slice of slices.slice(1)) {
    const bitmap = await decodeSlice(slice);
    drawPanel(bitmap, slice.offset);
    bitmap.close();
  }

  return { canvas, scale };
}

const SAVE_FORMATS = {
  png: { type: "image/png", ext: "png" },
  webp: { type: "image/webp", ext: "webp", quality: 0.92 },
  jpeg: { type: "image/jpeg", ext: "jpg", quality: 0.96 },
};

// Verifies the encoder honoured the format — it can silently fall back to
// PNG for a type it can't encode, producing a PNG file named .webp.
async function encodeCanvas(canvas, format) {
  const spec = SAVE_FORMATS[format] || SAVE_FORMATS.png;
  let blob;
  try {
    blob = await canvas.convertToBlob({ type: spec.type, quality: spec.quality });
  } catch (err) {
    console.warn(`Full Page Capture: ${spec.type} encoding failed (${err.message}); saving PNG instead.`);
    return { blob: await canvas.convertToBlob({ type: "image/png" }), ext: "png" };
  }

  if (blob.type && blob.type !== spec.type) {
    console.warn(
      `Full Page Capture: this browser encoded ${blob.type} when asked for ${spec.type}; naming the file accordingly.`
    );
    const fallback = Object.values(SAVE_FORMATS).find((f) => f.type === blob.type);
    return { blob, ext: fallback ? fallback.ext : "png" };
  }
  return { blob, ext: spec.ext };
}

function stitchSlices(slices, metrics, totalHeight, dpr) {
  return metrics.mode === "container"
    ? stitchContainer(slices, metrics, totalHeight, dpr)
    : stitchDocument(slices, metrics.region, totalHeight, dpr);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function logSliceDiagnostics(index, offset, scrollHeight, diag) {
  if (!diag) return;
  const estimatedTotal = Math.max(1, Math.ceil(scrollHeight / (diag.innerHeight || 1)));
  const label = `[qol] slice ${index + 1}/~${estimatedTotal} @y=${offset} (page height ${scrollHeight})`;
  console.log(
    `${label} — seen set: ${diag.seenSizeBefore} → ${diag.seenSizeAfter}` +
      ` (global persisted from a previous call: ${diag.globalExisted})` +
      `, visible fixed/sticky elements: ${diag.elements.length}, hidden this slice: ${diag.hidCount}`
  );
  console.table(
    diag.elements.map((e) => ({
      uid: e.uid,
      newNode: e.uidIsNew,
      hidden: e.matched,
      via: e.matchedBy,
      transition: e.transition,
      tag: e.tag,
      id: e.id,
      pos: e.position,
      top: e.rect.top,
      left: e.rect.left,
      w: e.rect.width,
      h: e.rect.height,
      opacity: e.opacity,
      transform: e.transform,
      className: e.className,
    }))
  );
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

let activeCapture = null; // the one in-flight capture, or null

function friendlyError(err) {
  const raw = (err && err.message) || String(err);

  if (/stopped being the visible one/i.test(raw)) {
    return {
      title: "Capture stopped",
      detail: "The tab moved to the background. Keep it in front while capturing.",
    };
  }
  if (/MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/i.test(raw)) {
    return { title: "Brave throttled the capture", detail: "Too many screenshots at once. Try again in a moment." };
  }
  if (/could not measure the page/i.test(raw)) {
    return { title: "Couldn't measure this page", detail: "It may still be loading. Reload it and try again." };
  }
  if (/clipboard/i.test(raw)) {
    return { title: "Couldn't copy to the clipboard", detail: "Nothing was saved. Try Save as PNG instead." };
  }
  if (/download/i.test(raw)) {
    return { title: "Couldn't save the file", detail: "Check that downloads aren't blocked, then try again." };
  }
  if (/Cannot access|Extension manifest|chrome-extension:|cannot be scripted/i.test(raw)) {
    return { title: "This page can't be captured", detail: "Brave blocks extensions on its own and store pages." };
  }
  if (/navigat|no longer exists|No tab with id|frame was removed/i.test(raw)) {
    return { title: "The page changed mid-capture", detail: "It navigated or closed before finishing." };
  }
  return { title: "Capture failed", detail: raw };
}

// Session storage, not memory: the worker can be torn down before the popup opens.
async function recordFailure(err) {
  const { title, detail } = friendlyError(err);
  try {
    await chrome.storage.session.set({ lastFailure: { title, detail, at: Date.now() } });
  } catch {
    /* session storage unavailable; the badge and console still report it */
  }
}

async function clearFailure() {
  try {
    await chrome.storage.session.remove("lastFailure");
  } catch {
    /* nothing to clear */
  }
}

function cancelActiveCapture(source) {
  if (!activeCapture) return;
  console.log(`Full Page Capture: cancelling (${source}).`);
  activeCapture.cancelled = true;
}

function throwIfCancelled(state) {
  if (!state.cancelled) return;
  const err = new Error("Capture cancelled");
  err.name = "QolCaptureCancelled";
  throw err;
}

// captureVisibleTab photographs whatever's on screen, not a specific tab —
// switching tabs mid-capture would stitch in the wrong page's pixels.
async function assertTabStillVisible(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.active) return;
  throw new Error(
    "the tab stopped being the visible one (switched tabs or windows). " +
      "captureVisibleTab can only photograph the foreground tab, so the capture was stopped " +
      "to avoid stitching another page into the image."
  );
}

async function cleanupPage(tabId, metrics) {
  // Scroll back first: container mode's restore needs the marker attribute
  // that restoreFixedElements strips.
  if (metrics) {
    await execFn(tabId, scrollTargetTo, [metrics.mode, metrics.originalScroll, metrics.originalScrollX || 0]);
  }
  await execFn(tabId, restoreFixedElements);
  await execFn(tabId, removeCancelHotkey);
}

// Runs in the captured page, which (unlike an offscreen document) can
// actually be focused.
async function copyImageInPage(dataUrl) {
  const asBlob = async () => (await fetch(dataUrl)).blob();

  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": await asBlob() })]);
    return { ok: true, via: "page-async-clipboard" };
  } catch (asyncErr) {
    // Off-screen, not hidden: execCommand copies the rendered selection, and
    // display:none renders nothing.
    const staging = document.createElement("div");
    staging.contentEditable = "true";
    staging.style.cssText = "position:fixed;top:0;left:-99999px;opacity:0;";
    document.body.appendChild(staging);
    const selection = window.getSelection();
    const savedRanges = Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i));

    try {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      staging.appendChild(img);

      staging.focus();
      const range = document.createRange();
      range.selectNode(img);
      selection.removeAllRanges();
      selection.addRange(range);

      if (!document.execCommand("copy")) throw new Error("execCommand('copy') returned false");
      return { ok: true, via: "page-exec-command" };
    } catch (execErr) {
      return {
        ok: false,
        error: `async clipboard: ${asyncErr && asyncErr.message}; execCommand: ${execErr && execErr.message}`,
      };
    } finally {
      selection.removeAllRanges();
      for (const range of savedRanges) selection.addRange(range);
      staging.remove();
    }
  }
}

async function copyImageViaOffscreen(dataUrl) {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["CLIPBOARD"],
      justification: "Write the captured screenshot to the clipboard.",
    });
  }
  try {
    const response = await withTimeout(
      chrome.runtime.sendMessage({
        type: "qol-copy-image",
        target: "offscreen",
        dataUrl,
      }),
      CLIPBOARD_TIMEOUT_MS,
      "clipboard copy"
    );
    if (!response || !response.ok) {
      throw new Error((response && response.error) || "the offscreen document did not respond");
    }
    return response.via;
  } finally {
    await chrome.offscreen.closeDocument();
  }
}

async function copyImageToClipboard(tab, dataUrl) {
  // Clipboard writes require a focused document; an offscreen one never is.
  await chrome.windows.update(tab.windowId, { focused: true });
  const pageResult = await withTimeout(
    execFn(tab.id, copyImageInPage, [dataUrl]),
    CLIPBOARD_TIMEOUT_MS,
    "in-page clipboard copy"
  );

  if (pageResult && pageResult.ok) {
    console.log(`Full Page Capture: copied to clipboard via ${pageResult.via}.`);
    return;
  }

  const pageError = (pageResult && pageResult.error) || "the page did not respond";
  console.warn(`Full Page Capture: in-page copy failed (${pageError}); trying an offscreen document.`);
  const via = await copyImageViaOffscreen(dataUrl);
  console.log(`Full Page Capture: copied to clipboard via ${via}.`);
}

const DESTINATIONS = ["file", "clipboard", "preview"];

async function getDestination() {
  const { destination } = await chrome.storage.sync.get("destination");
  return DESTINATIONS.includes(destination) ? destination : "file";
}

// The pixels never travel through chrome.runtime messaging — a stitched
// capture routinely exceeds the 64MiB cap that Chrome puts on a single
// message, which fails silently rather than throwing. Only this id does;
// the preview tab pulls the actual dataUrl out of IndexedDB itself.
async function openPreview(dataUrl, meta) {
  const id = crypto.randomUUID();
  await qolPutCapture(id, { dataUrl, ...meta, at: Date.now() });
  qolPruneStaleCaptures();
  await chrome.tabs.create({ url: chrome.runtime.getURL(`preview.html?capture=${id}`) });
}

async function runCapture(tab, destination = "file") {
  if (!tab || !tab.id || !tab.url || /^(chrome|brave|edge):\/\//.test(tab.url)) {
    console.error("Full Page Capture: cannot capture this page (internal browser page).");
    setBadge("!", "#c0392b");
    setTimeout(() => setBadge(""), 2000);
    await chrome.storage.session.set({
      lastFailure: {
        title: "This page can't be captured",
        detail: "Brave's own pages, like Settings and Extensions, are off limits to extensions.",
        at: Date.now(),
      },
    });
    return;
  }

  await clearFailure();

  const state = { tabId: tab.id, cancelled: false, progress: { done: 0, total: 0 } };
  activeCapture = state;

  setBadge("...", "#00968c");
  let metrics = null;
  try {
    const { hideOverlays = false, saveFormat = "png" } = await chrome.storage.sync.get(["hideOverlays", "saveFormat"]);
    metrics = await execFn(tab.id, getPageMetrics);
    if (!metrics || !metrics.step) {
      throw new Error("could not measure the page — getPageMetrics returned nothing usable");
    }
    await execFn(tab.id, installCancelHotkey);

    const step = metrics.step;
    let scrollHeight = metrics.totalHeight;
    const slices = [];
    let y = 0;
    let hiddenCount = 0;

    while (y < scrollHeight && slices.length < MAX_SLICES) {
      throwIfCancelled(state);
      const offset = nextSliceOffset(y, step, scrollHeight);
      await execFn(tab.id, scrollTargetTo, [metrics.mode, offset]);
      await sleep(CAPTURE_DELAY_MS);
      throwIfCancelled(state);
      // Runs after scrolling + settling, so scroll-triggered reveals (e.g. a
      // header that fades in past the hero) have already happened by the
      // time we check what's currently visible.
      const diag = await execFn(tab.id, prepareFixedElementsForSlice, [DEBUG_FIXED_ELEMENTS, hideOverlays]);
      if (DEBUG_FIXED_ELEMENTS) logSliceDiagnostics(slices.length, offset, scrollHeight, diag);
      if (diag && diag.hidCount > 0) await sleep(HIDE_SETTLE_MS);
      hiddenCount += (diag && diag.hidCount) || 0;

      throwIfCancelled(state);
      await assertTabStillVisible(tab.id);
      const dataUrl = await captureVisibleTabWithRetry(tab.windowId);
      slices.push({ dataUrl, offset });

      const liveHeight = await execFn(tab.id, getPageHeight, [metrics.mode]);
      if (liveHeight > scrollHeight) scrollHeight = liveHeight;
      y = offset + step;

      state.progress = {
        done: slices.length,
        total: Math.max(slices.length, Math.ceil(scrollHeight / step)),
      };
    }

    if (slices.length >= MAX_SLICES) {
      console.warn(
        `Full Page Capture: stopped at the ${MAX_SLICES}-slice limit — the page kept growing as it scrolled ` +
          `(infinite scroll?). Captured the first ${MAX_SLICES} viewports.`
      );
    }

    console.log(
      `Full Page Capture: tab ${tab.id} ${tab.url}\n` +
        `  scrolling the ${metrics.mode}, ${slices.length} slice(s), ` +
        `viewport ${metrics.viewportWidth}x${metrics.viewportHeight} at dpr ${metrics.dpr}, ` +
        `region ${metrics.region.width}x${metrics.region.height} at (${metrics.region.x}, ${metrics.region.y}), ` +
        `height ${scrollHeight} (measured ${metrics.totalHeight} at start), ` +
        `offsets [${slices.map((s) => s.offset).join(", ")}]`
    );

    await cleanupPage(tab.id, metrics);

    const { canvas, scale } = await stitchSlices(slices, metrics, scrollHeight, metrics.dpr);
    if (scale < 1) {
      console.warn(
        `Full Page Capture: the page is taller than the maximum image size, so the capture was scaled to ` +
          `${Math.round(scale * 100)}% (${canvas.width}x${canvas.height}px).`
      );
    }

    // Only a saved file honours the chosen format; clipboard/preview always get PNG.
    const { blob, ext } =
      destination === "file"
        ? await encodeCanvas(canvas, saveFormat)
        : { blob: await canvas.convertToBlob({ type: "image/png" }), ext: "png" };

    // Service workers have no URL.createObjectURL; downloads and the
    // offscreen document both accept a data URL directly instead.
    const dataUrl = await blobToDataUrl(blob);

    if (destination === "preview") {
      await openPreview(dataUrl, {
        width: canvas.width,
        height: canvas.height,
        scale,
        hiddenCount,
        sourceUrl: tab.url,
        sourceTitle: tab.title || "",
      });
    } else if (destination === "clipboard") {
      await copyImageToClipboard(tab, dataUrl);
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      console.log(`Full Page Capture: saved ${ext.toUpperCase()}, ${(blob.size / (1024 * 1024)).toFixed(1)} MB.`);
      await chrome.downloads.download({
        url: dataUrl,
        filename: `full-page-capture-${timestamp}.${ext}`,
        saveAs: false,
      });
    }

    setBadge("✓", "#1e8e3e");
    setTimeout(() => setBadge(""), 2000);
  } catch (err) {
    if (err && err.name === "QolCaptureCancelled") {
      console.log("Full Page Capture: capture cancelled.");
      setBadge("✕", "#7f8c8d");
    } else {
      console.error("Full Page Capture: capture failed:", err);
      setBadge("!", "#c0392b");
      await recordFailure(err);
    }
    setTimeout(() => setBadge(""), 2000);
    try {
      await cleanupPage(tab.id, metrics);
    } catch {
      /* tab may have navigated away or closed; nothing more we can do */
    }
  } finally {
    if (activeCapture === state) activeCapture = null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target === "offscreen") return;

  switch (message.type) {
    case "qol-get-state":
      sendResponse({
        running: Boolean(activeCapture),
        progress: activeCapture ? activeCapture.progress : null,
      });
      return false;

    case "qol-start-capture":
      startCaptureOnActiveTab(DESTINATIONS.includes(message.destination) ? message.destination : "file");
      return false;

    case "qol-count-overlays":
      countOverlaysOnActiveTab().then(sendResponse);
      return true; // async response

    case "qol-cancel-capture":
      // Only the tab being captured (Escape) or our own popup (no sender.tab) may cancel.
      if (sender.tab && (!activeCapture || sender.tab.id !== activeCapture.tabId)) return false;
      cancelActiveCapture(sender.tab ? "Escape key" : "popup");
      return false;

    default:
      return false;
  }
});

// null means the page couldn't be inspected at all, distinct from a genuine 0.
async function countOverlaysOnActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url || /^(chrome|brave|edge):\/\//.test(tab.url)) return null;
    const result = await execFn(tab.id, prepareFixedElementsForSlice, [false, false, true]);
    return { count: (result && result.hidCount) || 0 };
  } catch {
    return null;
  }
}

async function startCaptureOnActiveTab(destination) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  runCapture(tab, destination);
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "capture-full-page") return;
  if (activeCapture) {
    cancelActiveCapture("keyboard shortcut");
    return;
  }
  startCaptureOnActiveTab(await getDestination());
});
