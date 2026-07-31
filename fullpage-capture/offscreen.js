// Service workers have no DOM and no navigator.clipboard, so image copying
// happens here, in an offscreen document the worker creates on demand.

// Deliberately NOT the primary path, despite being the modern API. An
// offscreen document is never focused, and in that state some Chrome/Brave
// versions leave this promise permanently pending instead of rejecting —
// which hangs the whole capture rather than falling through to a fallback.
// Kept only as a backstop, and always behind a timeout.
async function copyViaAsyncClipboard(blob) {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

// The primary path: synchronous, no focus requirement, and the approach
// Chrome's own offscreen-clipboard sample uses. Selecting a rendered <img>
// puts the image itself on the clipboard, not a link to it.
async function copyViaExecCommand(dataUrl) {
  const staging = document.getElementById("staging");
  const img = new Image();
  img.src = dataUrl;
  await img.decode(); // execCommand copies nothing if the image hasn't rendered

  staging.replaceChildren(img);
  const range = document.createRange();
  range.selectNode(img);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  const ok = document.execCommand("copy");
  selection.removeAllRanges();
  staging.replaceChildren();
  if (!ok) throw new Error("execCommand('copy') returned false");
}

// Never let a pending-forever promise become a hung capture.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

// Returns which path succeeded, plus why the first one failed if it did. This
// document is closed immediately after copying, so its own console is
// effectively impossible to read — the caller logs this instead.
async function copyImage(dataUrl) {
  try {
    await withTimeout(copyViaExecCommand(dataUrl), 5000, "execCommand copy");
    return { via: "exec-command" };
  } catch (err) {
    const firstError = String((err && err.message) || err);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await withTimeout(copyViaAsyncClipboard(blob), 5000, "navigator.clipboard.write");
      return { via: "offscreen-async-clipboard", firstError };
    } catch (secondErr) {
      // Report both reasons — knowing only that the last attempt failed hides
      // why the preferred path did.
      throw new Error(`execCommand: ${firstError}; async clipboard: ${(secondErr && secondErr.message) || secondErr}`);
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "offscreen" || message.type !== "qol-copy-image") return;
  copyImage(message.dataUrl).then(
    (result) => sendResponse({ ok: true, ...result }),
    (err) => sendResponse({ ok: false, error: String((err && err.message) || err) })
  );
  return true; // keep the message channel open for the async response
});
