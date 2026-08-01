<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/banner-dark.svg">
  <img alt="Brave QoL" src="brand/banner-light.svg" height="72">
</picture>

Two small, independent extensions that add quality-of-life features Brave
doesn't have but Chrome and Edge do. No accounts, telemetry, or paid tier — a
few hundred lines each, and the source here is what runs.

- **[Omnibox Calculator](omnibox-calc/)** — calculate or convert units and
  currencies directly in the address bar.
- **[Full Page Capture](fullpage-capture/)** — save or copy an entire
  scrollable page as one image, not just the visible viewport.

## Install

1. Open `brave://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select `omnibox-calc/` or `fullpage-capture/`

They're separate — installing one doesn't install the other.

## Omnibox Calculator

Type `=`, a space, then an expression (`+ - * / % ^`, parentheses,
functions like `sqrt`, `sin`, `log`). Press Enter to copy the result.
Expressions are parsed by a hand-written parser in `mathEval.js`, not
`eval()`. Distance and weight conversions work locally (`5 km to mi`,
`10 lbs in kg`). Currency conversions (`20 USD to EUR`) use daily reference
rates from Frankfurter and fall back to the last cached rate when offline.

## Full Page Capture

Click the toolbar button to save, copy, or preview a full scrollable page as
one image — PNG, WebP, JPEG or PDF. Handles sticky headers, lazy-loaded
content, and pages that scroll an inner panel instead of the document. The
tab must stay in the foreground while capturing, and `brave://` pages can't
be captured (extensions can't run there).

## Development

No build step, no dependencies — edit a file and hit Reload on the
extension's card in `brave://extensions`.

```
node tools/check-all.js
```

Runs syntax checks plus seven suites covering slice offsets, image stitching,
injection scope, UI consistency, PDF structure, and the expression parser.

## Packaging

```powershell
Compress-Archive -Path omnibox-calc\*     -DestinationPath dist\omnibox-calc-1.1.0.zip
Compress-Archive -Path fullpage-capture\* -DestinationPath dist\fullpage-capture-1.0.0.zip
```

```bash
./tools/package.sh
```

Either way, `dist/` and `.pem` signing keys are gitignored.

## Licence

MIT — see [LICENSE](LICENSE). Privacy policy: [PRIVACY.md](PRIVACY.md).
