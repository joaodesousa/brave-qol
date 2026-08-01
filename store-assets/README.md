# Chrome Web Store screenshots

The release images in `omnibox-calc/` and `fullpage-capture/` are branded
playful compositions built around authentic screenshots from the macOS Brave
app. The untouched 1280 × 800 browser captures live in `source/native/`, and
their 2560 × 1600 Retina masters live in `source/native-retina/`.
Both unpacked extensions were loaded into an isolated Brave profile, so the
source images show the real omnibox, popup, page state, and capture progress
without exposing or changing the everyday browser profile.

`compose.mjs` combines the Retina captures with the brave-qol paper, ink, teal,
orange, wordmark, rounded type, stickers, and oversized symbols. It renders at
2× resolution, then uses a sharpened Lanczos reduction for crisp 1280 × 800
store assets. It requires Playwright and Sharp to be available to Node and uses
Brave as the rendering engine:

```bash
node store-assets/compose.mjs
```

Pass part of a filename or directory to render only matching assets:

```bash
node store-assets/compose.mjs screenshot-3-formats
node store-assets/compose.mjs omnibox-calc
```

Set `BRAVE_BIN` if Brave is installed somewhere non-standard. The earlier
mockup renderer remains in `generate.mjs` as a design reference only; running
it will overwrite the branded native compositions.

The generated files are:

- `omnibox-calc/screenshot-1-functions.png`
- `omnibox-calc/screenshot-2-percentage.png`
- `omnibox-calc/screenshot-3-range.png`
- `fullpage-capture/screenshot-1-menu.png`
- `fullpage-capture/screenshot-2-capturing.png`
- `fullpage-capture/screenshot-3-formats.png`
- `fullpage-capture/screenshot-4-overlays.png`
- `fullpage-capture/screenshot-5-progress.png`
