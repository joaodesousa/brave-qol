# Privacy Policy

Last updated: 2026-08-01

This repository contains two independent browser extensions: **Omnibox
Calculator** (`omnibox-calc/`) and **Full Page Capture** (`fullpage-capture/`).
Neither extension collects or transmits personal data, browsing history, or
usage analytics. There are no accounts or telemetry. The calculator contacts
a third-party exchange-rate service only for currency conversions; the source
in this repository is exactly what runs.

## Omnibox Calculator

- Reads the text you type after the `=` omnibox keyword, evaluates it locally
  using the hand-written parser in `mathEval.js`, and writes the result to
  your clipboard via `clipboardWrite`.
- Distance and weight conversions are calculated entirely on your device.
- For a currency conversion, the two three-letter currency codes are sent to
  `api.frankfurter.dev`. The numeric amount and the rest of the expression are
  not sent. Returned daily reference rates are cached locally for faster use
  and as an offline fallback. Frankfurter's own privacy terms apply to those
  requests.
- `activeTab` and `scripting` are used only to insert the result into the
  page you're on when requested; nothing is read from the page or sent
  anywhere.
- `storage` is used only for the cached currency rates.

## Full Page Capture

- Captures visible screenshots of the active tab (`activeTab`, `scripting`)
  and stitches them into one image locally in an offscreen document
  (`offscreen`).
- Saves the resulting image to disk only when you choose to, via the
  `downloads` permission.
- `storage` is used solely to remember your last-used output format (PNG,
  WebP, JPEG, PDF) and capture preferences on your device.
- `clipboardWrite` is used only when you choose to copy the result.
- No image, page content, or usage data is ever transmitted off your device.

## Changes

If this policy changes, the update will be reflected in this file and in the
"Last updated" date above.

## Contact

Questions can be raised via GitHub issues on
https://github.com/joaodesousa/brave-qol.
