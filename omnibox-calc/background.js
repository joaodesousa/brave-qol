importScripts("mathEval.js", "conversions.js");

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

const RATE_CACHE_MAX_AGE = 12 * 60 * 60 * 1000;

async function getCurrencyRate(from, to) {
  if (from === to) return { rate: 1, date: "", cached: false };

  const cacheKey = `currency-rate:${from}:${to}`;
  let cached;
  try {
    const stored = await chrome.storage.local.get(cacheKey);
    cached = stored[cacheKey];
  } catch (err) {
    console.warn("Omnibox Calc: could not read the currency cache:", err);
  }
  if (cached && Date.now() - cached.fetchedAt < RATE_CACHE_MAX_AGE) {
    return { ...cached, cached: true };
  }

  try {
    const response = await fetch(`https://api.frankfurter.dev/v2/rate/${from}/${to}`);
    if (!response.ok) throw new Error(`rate service returned ${response.status}`);
    const data = await response.json();
    if (!Number.isFinite(data.rate) || data.rate <= 0) throw new Error("invalid rate response");
    const fresh = { rate: data.rate, date: data.date || "", fetchedAt: Date.now() };
    try {
      await chrome.storage.local.set({ [cacheKey]: fresh });
    } catch (err) {
      console.warn("Omnibox Calc: could not cache the currency rate:", err);
    }
    return { ...fresh, cached: false };
  } catch (err) {
    if (cached && Number.isFinite(cached.rate)) return { ...cached, cached: true };
    throw new Error(`Currency rate unavailable: ${err.message}`);
  }
}

async function evaluateInput(input) {
  const conversion = self.Conversions.parseConversion(input, self.MathEval.evaluate);
  if (!conversion) {
    const value = self.MathEval.evaluate(input);
    return { formatted: formatResult(value), copyText: formatResult(value), detail: "" };
  }

  if (conversion.kind === "unit") {
    const formatted = formatResult(conversion.value);
    return { formatted: `${formatted} ${conversion.to}`, copyText: `${formatted} ${conversion.to}`, detail: "" };
  }

  const rate = await getCurrencyRate(conversion.from, conversion.to);
  const formatted = formatResult(conversion.amount * rate.rate);
  const freshness = rate.date ? `rate ${rate.date}${rate.cached ? ", cached" : ""}` : "same currency";
  return {
    formatted: `${formatted} ${conversion.to}`,
    copyText: `${formatted} ${conversion.to}`,
    detail: freshness,
  };
}

// No cached last-result variable: MV3 service workers can be killed between
// onInputChanged and onInputEntered, so both recompute from scratch.
let inputVersion = 0;

chrome.omnibox.onInputChanged.addListener((text) => {
  const version = ++inputVersion;
  const trimmed = text.trim();
  if (!trimmed) {
    chrome.omnibox.setDefaultSuggestion({
      description: "Try <match>2 + 2 * 3</match>, <match>5 km to mi</match>, or <match>10 USD to EUR</match>",
    });
    return;
  }

  void evaluateInput(trimmed).then((result) => {
    if (version !== inputVersion) return;
    const detail = result.detail ? `${result.detail}; ` : "";
    chrome.omnibox.setDefaultSuggestion({
      description: `<match>${escapeXml(trimmed)}</match> = <match>${escapeXml(result.formatted)}</match> <dim>(${escapeXml(detail)}Enter to copy)</dim>`,
    });
  }).catch((err) => {
    if (version !== inputVersion) return;
    chrome.omnibox.setDefaultSuggestion({
      description: `<match>${escapeXml(trimmed)}</match> <dim>- ${escapeXml(err.message || "invalid expression")}</dim>`,
    });
  });
});

chrome.omnibox.onInputEntered.addListener(async (text) => {
  const trimmed = text.trim();
  if (!trimmed) return;

  try {
    const result = await evaluateInput(trimmed);
    await copyToClipboard(result.copyText);
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
