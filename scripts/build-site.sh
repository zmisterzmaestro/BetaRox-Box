#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/_site"

# Compile only the editor and synthesizer. The separate player and lab pages
# remain in the source project and are intentionally outside this site copy.
(cd "$ROOT/goldbox" && npm run build-synth && npm run build-editor)

rm -rf "$OUT"
mkdir -p "$OUT/editor" "$OUT/licenses"
cp -r "$ROOT/site/." "$OUT/"
cp "$ROOT/goldbox/website/index.html" "$OUT/editor/"
cp "$ROOT/goldbox/website/beepbox_editor.min.js" "$OUT/editor/"
cp "$ROOT/goldbox/website/user-assistant.js" "$OUT/editor/"
for file in favicon.ico apple-touch-icon.png icon_32.png icon_maskable_192.png icon_shadow_192.png icon_windows_150.png browserconfig.xml manifest.webmanifest; do
  [ ! -f "$ROOT/goldbox/website/$file" ] || cp "$ROOT/goldbox/website/$file" "$OUT/editor/"
done
cp "$ROOT/goldbox/LICENSE.md" "$OUT/licenses/GoldBox-MIT.txt"
touch "$OUT/.nojekyll"
echo "BetaRox editor site assembled in $OUT"
