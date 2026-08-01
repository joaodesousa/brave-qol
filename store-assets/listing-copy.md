# Chrome Web Store listing copy

## Shared publisher details

- Homepage: https://github.com/joaodesousa/brave-qol
- Support: https://github.com/joaodesousa/brave-qol/issues
- Privacy policy: https://github.com/joaodesousa/brave-qol/blob/main/PRIVACY.md
- Language: English
- Visibility: Public
- Regions: All regions
- Pricing: Free

## Brave QoL: Omnibox Calc

### Summary

Instant calculations and unit or currency conversions in the address bar.

### Detailed description

Calculate without leaving the page you are on. Type `=` followed by a space in the address bar, enter an expression, and see the result immediately.

Features:

- Basic arithmetic with `+`, `-`, `*`, `/`, `%`, and `^`
- Parentheses and decimal values
- Functions including `sqrt`, `sin`, `cos`, `log`, `ln`, `min`, `max`, and more
- Constants including `pi` and `e`
- Distance and weight conversions such as `5 km to mi` and `10 lbs in kg`
- Currency conversions such as `20 USD to EUR`, using cached daily reference rates
- Press Enter to copy the result
- Local math and unit evaluation; currency codes are sent only when fetching exchange rates

Expressions are evaluated by a small purpose-built parser. The extension does not use `eval()` and does not read page content.

### Category

Productivity

### Single purpose

Evaluate calculations and conversions entered through the address bar and copy the result when requested.

### Permission justifications

- `activeTab`: Identifies the active tab only after the user presses Enter, so the result can be copied from the focused page.
- `scripting`: Injects a small clipboard-writing function into the active tab after the user requests a copy. It does not read or retain page content.
- `clipboardWrite`: Writes the calculated result to the clipboard after the user presses Enter.
- `storage`: Caches daily exchange rates so repeat currency conversions are fast and can work offline.
- `https://api.frankfurter.dev/*`: Fetches a reference rate only when the user enters a currency conversion. Only the source and target currency codes appear in the request.

### Privacy practices

- Data collection: None
- Data sale: No
- Data use for purposes unrelated to the extension's single purpose: No
- Data use for creditworthiness or lending: No
- Remote code: No

### Test instructions

1. Install the extension.
2. In the address bar, type `=` followed by Space.
3. Enter `sqrt(144) + 7^2 - 3`.
4. Confirm that the suggestion displays `58`.
5. Press Enter and paste into a text field to confirm that `58` was copied.
6. Enter `5 km to mi` and confirm that the suggestion displays approximately `3.1068559612 mi`.
7. Enter `10 USD to EUR` and confirm that a dated EUR result appears.

No account or test credentials are required.

## Brave QoL: Full Page Capture

### Summary

Capture a complete scrollable page as PNG, WebP, JPEG, or PDF. No account, uploads, or telemetry.

### Detailed description

Capture an entire scrollable page as one clean image, including content beyond the visible viewport.

Features:

- Save as PNG, WebP, JPEG, or PDF
- Copy the finished capture directly to the clipboard
- Preview captures before saving
- Handles document scrolling and large inner scroll panels
- Optionally leaves out sticky bars, banners, and other pinned overlays
- Loads lazy content while capturing
- Keyboard shortcut support
- Local processing with no accounts, cloud uploads, telemetry, or third-party requests

The active tab stays in the foreground during capture while the extension scrolls, captures, and stitches the result locally. Browser-internal pages cannot be captured because browsers do not allow extensions to run on them.

### Category

Productivity

### Single purpose

Capture the full scrollable contents of the active browser tab and let the user save, copy, or preview the result.

### Permission justifications

- `activeTab`: Captures only the tab where the user explicitly starts a capture.
- `scripting`: Measures and scrolls the active page, manages fixed elements, and restores the page after capture.
- `downloads`: Saves the completed image or PDF only when the user selects Save.
- `clipboardWrite`: Copies the completed image only when the user selects Copy.
- `offscreen`: Stitches captured slices and creates the selected output format locally without opening another visible tab.
- `storage`: Remembers the user's selected output format, destination, overlay preference, and temporary capture state.

### Privacy practices

- Data collection: None
- Data sale: No
- Data use for purposes unrelated to the extension's single purpose: No
- Data use for creditworthiness or lending: No
- Remote code: No

### Test instructions

1. Open a normal webpage that is taller than the browser window.
2. Open the extension popup.
3. Select Save, Copy, or Preview and start the capture.
4. Keep the tab in the foreground until capture completes.
5. Confirm that the result contains the full scrollable page.
6. Repeat with a different output format or enable the overlay option if desired.

No account or test credentials are required.
