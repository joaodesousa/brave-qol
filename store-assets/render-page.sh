#!/usr/bin/env bash
set -euo pipefail

page_url=$1
output_path=$2
profile_path=$3
browser_bin=${BRAVE_BIN:-brave-browser}
raw_capture=$(mktemp --suffix=.png)

"$browser_bin" \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --disable-breakpad \
  --disable-crash-reporter \
  --disable-infobars \
  --no-first-run \
  --disable-brave-update \
  --allow-file-access-from-files \
  --hide-scrollbars \
  --force-device-scale-factor=1 \
  --window-position=0,0 \
  --window-size=2560,1657 \
  --user-data-dir="$profile_path" \
  --app="$page_url" &
browser_pid=$!

cleanup() {
  kill "$browser_pid" 2>/dev/null || true
  wait "$browser_pid" 2>/dev/null || true
  rm -f "$raw_capture"
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  window_id=$(xdotool search --onlyvisible --class brave 2>/dev/null | head -n 1 || true)
  if [[ -n "$window_id" ]]; then
    xdotool windowmove "$window_id" 0 0
    xdotool windowsize "$window_id" 2560 1657
    sleep 2.5
    import -window "$window_id" "$raw_capture"
    convert "$raw_capture" -crop 2560x1600+0+57 +repage -filter Lanczos -resize 1280x800 "$output_path"
    exit 0
  fi
  sleep 0.1
done

echo "Brave window did not appear" >&2
exit 1
