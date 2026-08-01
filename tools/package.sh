#!/usr/bin/env bash
# Zips each extension for Chrome Web Store submission, with manifest.json
# at the root of the archive (not nested in a subfolder).
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p dist

for ext in omnibox-calc fullpage-capture; do
  version=$(node -pe "require('./${ext}/manifest.json').version")
  out="dist/${ext}-${version}.zip"
  rm -f "$out"
  python3 - "$ext" "$out" <<'PY'
import os, sys, zipfile

src, out = sys.argv[1], sys.argv[2]
skip = {".DS_Store", "Thumbs.db"}

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(src):
        for name in files:
            if name in skip:
                continue
            path = os.path.join(root, name)
            arcname = os.path.relpath(path, src)
            zf.write(path, arcname)
PY
  echo "Wrote $out"
done
