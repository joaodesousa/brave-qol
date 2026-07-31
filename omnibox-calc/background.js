importScripts("mathEval.js");

const MAX_DECIMALS = 10;

function formatResult(n) {
  if (!isFinite(n)) return "Error";
  const rounded = Math.round(n * 10 ** MAX_DECIMALS) / 10 ** MAX_DECIMALS;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: MAX_DECIMALS });
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// No cached last-result variable: MV3 service workers can be killed between
// onInputChanged and onInputEntered, so both recompute from scratch.
chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  const trimmed = text.trim();
  if (!trimmed) {
    chrome.omnibox.setDefaultSuggestion({
      description: "Type a math expression, e.g. <match>2 + 2 * 3</match>",
    });
    return;
  }

  try {
    const value = self.MathEval.evaluate(trimmed);
    const formatted = formatResult(value);
    chrome.omnibox.setDefaultSuggestion({
      description: `<match>${escapeXml(trimmed)}</match> = <match>${escapeXml(formatted)}</match> <dim>(Enter to copy)</dim>`,
    });
  } catch (err) {
    chrome.omnibox.setDefaultSuggestion({
      description: `<match>${escapeXml(trimmed)}</match> <dim>- ${escapeXml(err.message || "invalid expression")}</dim>`,
    });
  }
});

chrome.omnibox.onInputEntered.addListener(async (text) => {
  const trimmed = text.trim();
  if (!trimmed) return;

  try {
    const value = self.MathEval.evaluate(trimmed);
    const formatted = formatResult(value);
    await copyToClipboard(formatted);
  } catch (err) {
    console.error("Omnibox Calc: could not evaluate on enter:", err.message);
  }
});

// Offscreen documents are never focused and both copy APIs require focus
// (crbug 41497480), so inject into the active tab, which is focused, instead.
async function copyToClipboard(text) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      console.error("Omnibox Calc: no active tab found to copy into");
      return;
    }
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (value) => {
        try {
          await navigator.clipboard.writeText(value);
          return true;
        } catch (err) {
          const textarea = document.createElement("textarea");
          textarea.value = value;
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          const ok = document.execCommand("copy");
          textarea.remove();
          return ok ? true : `execCommand fallback also failed after: ${err}`;
        }
      },
      args: [text],
    });
    if (result.result !== true) {
      console.error("Omnibox Calc: clipboard write failed:", result.result);
    }
  } catch (err) {
    console.error("Omnibox Calc: failed to copy to clipboard:", err);
  }
}
