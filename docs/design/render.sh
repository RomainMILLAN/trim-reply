#!/usr/bin/env bash
# Renders the README screenshots into docs/assets/ with headless Chrome.
#
#   docs/design/render.sh
#
# No mailbox is ever captured: the compose is a mock (compose-mock.html) that
# mounts the real bar, and the popup / options pages are the real ones, served
# from a temporary copy of src/ with fake-browser.js injected first.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/docs/assets"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
CHROME="${CHROME:-google-chrome}"

shot() { # url width height output
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --allow-file-access-from-files --window-size="$2,$3" --screenshot="$4" "$1" >/dev/null 2>&1
  echo "$4"
}

mkdir -p "$OUT"
for state in trimmed uncertain offer; do
  shot "file://$ROOT/docs/design/compose-mock.html?state=$state" 760 250 "$OUT/screenshot-bar-$state.png"
done

cp -r "$ROOT/src/." "$TMP/"
cp "$ROOT/docs/design/fake-browser.js" "$TMP/fake-browser.js"
for page in options popup; do
  sed -i 's#<script src="platform.js"></script>#<script src="fake-browser.js"></script>\n  <script src="platform.js"></script>#' "$TMP/$page.html"
done
shot "file://$TMP/options.html" 820 1060 "$OUT/screenshot-options.png"
shot "file://$TMP/popup.html" 340 470 "$OUT/screenshot-popup.png"
