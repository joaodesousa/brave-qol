# Chrome Web Store screenshots

The release screenshots are rendered from branded HTML/CSS templates at
2560 × 1600, then downsampled to the Chrome Web Store's 1280 × 800 size. The
product surfaces are native markup: popup fixtures reuse the extension's actual
HTML/CSS, while the omnibox and preview states are deterministic vector-like
HTML/CSS recreations. No legacy raster capture appears in the final images.

The old source captures are retained in `source/` for comparison only.
`.render/` contains temporary pages; isolated Brave profiles live in `/tmp`.

Regenerate every screenshot from the repository root:

```bash
node store-assets/generate.mjs
```

Pass part of a filename or directory to render only matching assets:

```bash
node store-assets/generate.mjs screenshot-3-formats
node store-assets/generate.mjs omnibox-calc
```

Set `BRAVE_BIN` if the Brave executable is not named `brave-browser`.

The generated files are:

- `omnibox-calc/screenshot-1-functions.png`
- `omnibox-calc/screenshot-2-percentage.png`
- `omnibox-calc/screenshot-3-range.png`
- `fullpage-capture/screenshot-1-menu.png`
- `fullpage-capture/screenshot-2-capturing.png`
- `fullpage-capture/screenshot-3-formats.png`
- `fullpage-capture/screenshot-4-overlays.png`
- `fullpage-capture/screenshot-5-progress.png`
