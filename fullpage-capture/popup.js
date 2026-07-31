// The popup is the only UI surface. Because `action.default_popup` is set,
// chrome.action.onClicked never fires, so starting and cancelling a capture
// both go through messages to the service worker from here.

const DEFAULT_DESTINATION = "file";
const POLL_MS = 350;

const $ = (id) => document.getElementById(id);
let pollTimer = null;

function show(which) {
  $("idle").hidden = which !== "idle";
  $("running").hidden = which !== "running";
}

function renderProgress(progress) {
  const bar = $("progress-bar");
  const label = $("progress-label");
  const count = $("progress-count");

  // Until the first slice lands there is nothing to measure, so the bar
  // stays indeterminate rather than sitting at a misleading 0%.
  if (!progress || !progress.total || !progress.done) {
    bar.classList.add("is-indeterminate");
    bar.style.width = "";
    label.textContent = "Preparing…";
    count.textContent = "";
    return;
  }

  const { done, total } = progress;
  bar.classList.remove("is-indeterminate");
  bar.style.width = `${Math.min(100, Math.round((done / total) * 100))}%`;
  label.textContent = "Capturing";
  // "~" because the total moves: lazy-loaded content can add slices mid-run.
  count.textContent = `${done} / ~${total}`;
}

async function poll() {
  let state;
  try {
    state = await chrome.runtime.sendMessage({ type: "qol-get-state" });
  } catch {
    // Service worker asleep or restarting; treat as idle.
    state = null;
  }

  if (state && state.running) {
    show("running");
    renderProgress(state.progress);
    pollTimer = setTimeout(poll, POLL_MS);
    return;
  }

  // The capture finished (or was cancelled) while the popup was open. It has
  // nothing left to say, so close rather than flicker back to the menu.
  if (pollTimer !== null) {
    window.close();
    return;
  }
  showIdle();
}

// A failure is only worth reporting while it is still the thing that just
// happened; a stale message from yesterday is noise.
const FAILURE_TTL_MS = 10 * 60 * 1000;

async function showFailure() {
  let lastFailure;
  try {
    ({ lastFailure } = await chrome.storage.session.get("lastFailure"));
  } catch {
    return;
  }
  if (!lastFailure || Date.now() - lastFailure.at > FAILURE_TTL_MS) return;

  $("alert-title").textContent = lastFailure.title;
  $("alert-detail").textContent = lastFailure.detail;
  $("alert").hidden = false;
}

const CHECK_FOR = { file: "save-default", clipboard: "copy-default", preview: "preview-default" };

// Cycled in this order. PNG first because lossless is the safe default; WebP
// next because it is the one most people should actually use.
const FORMATS = [
  { key: "png", label: "PNG", note: "Lossless — largest files" },
  { key: "webp", label: "WebP", note: "Sharp text, much smaller" },
  { key: "jpeg", label: "JPEG", note: "Smallest, softer text" },
];

async function showIdle() {
  const {
    destination = DEFAULT_DESTINATION,
    hideOverlays = false,
    saveFormat = "png",
  } = await chrome.storage.sync.get(["destination", "hideOverlays", "saveFormat"]);
  show("idle");
  $(CHECK_FOR[destination] || CHECK_FOR[DEFAULT_DESTINATION]).hidden = false;
  renderOverlays(hideOverlays);
  renderFormat(saveFormat);
  await Promise.all([showFailure(), countOverlays()]);
}

// Shown on the setting row and echoed in the Save row's own label, so the
// format is visible where the action is, not only where it is configured.
function renderFormat(key) {
  const format = FORMATS.find((f) => f.key === key) || FORMATS[0];
  $("format-value").textContent = format.label;
  $("format-status").textContent = format.note;
  $("save-label").textContent = `Save as ${format.label}`;
}

async function cycleFormat() {
  const { saveFormat = "png" } = await chrome.storage.sync.get("saveFormat");
  const index = FORMATS.findIndex((f) => f.key === saveFormat);
  const next = FORMATS[(index + 1) % FORMATS.length];
  await chrome.storage.sync.set({ saveFormat: next.key });
  renderFormat(next.key);
}

function renderOverlays(on) {
  $("overlays").setAttribute("aria-checked", String(Boolean(on)));
  describeOverlays();
}

// How many pinned elements this page has right now. null until the page has
// been inspected, and stays null for pages that cannot be inspected at all —
// which is different from a page that genuinely has none.
let overlayCount = null;

// The switch carries on/off, so this line carries the other half: what is
// actually on this page for the setting to act on. Always present, so the row
// never changes height.
function describeOverlays() {
  const on = $("overlays").getAttribute("aria-checked") === "true";

  if (overlayCount === null) {
    $("overlays-status").textContent = "Banners and sticky bars";
    return;
  }
  if (overlayCount === 0) {
    $("overlays-status").textContent = "Nothing pinned here";
    return;
  }

  const subject = `${overlayCount} pinned element${overlayCount === 1 ? "" : "s"}`;
  $("overlays-status").textContent = on ? `${subject} — will be left out` : `${subject} on this page`;
}

async function countOverlays() {
  try {
    const result = await chrome.runtime.sendMessage({ type: "qol-count-overlays" });
    overlayCount = result ? result.count : null;
  } catch {
    overlayCount = null;
  }
  describeOverlays();
}

// A setting, not an action: toggling it leaves the popup open so the next
// click can be the capture itself.
async function toggleOverlays() {
  const { hideOverlays = false } = await chrome.storage.sync.get("hideOverlays");
  const next = !hideOverlays;
  await chrome.storage.sync.set({ hideOverlays: next });
  renderOverlays(next);
}

// The real binding, not the one in the manifest: the suggested key is only a
// suggestion, another extension may already own it (Bitwarden owns
// Ctrl+Shift+Y), and the user can rebind it at any time.
async function renderShortcut() {
  try {
    const commands = await chrome.commands.getAll();
    const command = commands.find((c) => c.name === "capture-full-page");
    const shortcut = command && command.shortcut;
    $("foot-text").textContent = shortcut ? `Repeat with ${shortcut}` : "No shortcut assigned";
    $("foot-action").textContent = shortcut ? "Change" : "Set";
  } catch {
    $("foot-text").textContent = "Keyboard shortcut";
    $("foot-action").textContent = "Set";
  }
}

// Shortcuts are owned by the browser, not the extension — this page is the
// only place they can be changed, and it is also where a conflict with
// another extension shows up.
async function openShortcutSettings() {
  // Brave redirects chrome:// to brave://, but not every build does, so fall
  // back rather than leaving the user on an error page.
  for (const url of ["chrome://extensions/shortcuts", "brave://extensions/shortcuts"]) {
    try {
      await chrome.tabs.create({ url });
      window.close();
      return;
    } catch {
      /* try the next scheme */
    }
  }
}

async function start(destination) {
  // The old message belongs to the previous attempt.
  $("alert").hidden = true;
  // Remembered so the keyboard shortcut, which has no UI to ask through,
  // repeats whatever you chose last.
  await chrome.storage.sync.set({ destination });
  await chrome.runtime.sendMessage({ type: "qol-start-capture", destination });
  window.close();
}

$("save").addEventListener("click", () => start("file"));
$("copy").addEventListener("click", () => start("clipboard"));
$("preview").addEventListener("click", () => start("preview"));
$("overlays").addEventListener("click", toggleOverlays);
$("format").addEventListener("click", cycleFormat);
$("cancel").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "qol-cancel-capture" });
  window.close();
});

$("shortcut").addEventListener("click", openShortcutSettings);

renderShortcut();
poll();
