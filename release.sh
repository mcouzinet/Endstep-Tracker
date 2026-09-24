#!/bin/sh
# Builds dist/endstep-tracker-<version>[-firefox].zip for the stores: runtime files only, without the Coach
# (coach.js and coach-model.json are personal / experimental; dashboard.js hides the Coach block when coach.js is absent).
# Usage: ./release.sh [chrome|firefox]   (chrome by default; the Chrome zip also serves Edge)
set -e
cd "$(dirname "$0")"
target=${1:-chrome}
v=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
suffix=$([ "$target" = firefox ] && echo -firefox || true)
out="$PWD/dist/endstep-tracker-$v$suffix.zip"
mkdir -p dist && rm -f "$out"
stage=$(mktemp -d)
cp -R manifest.json background.js hook.js tracker.js content.js dashboard.js meta.js shared.js theme.css popup.html popup.js _locales "$stage"/
mkdir "$stage/icons" && cp icons/*.png "$stage/icons/"
grep -v '<script src="coach.js">' dashboard.html > "$stage/dashboard.html"
if [ "$target" = firefox ]; then
  # Firefox has no background service worker (event page instead), needs a gecko id, and AMO requires the
  # data-collection declaration for new extensions (nothing leaves the browser: "none").
  node -e '
    const fs = require("fs"), p = process.argv[1], m = JSON.parse(fs.readFileSync(p, "utf8"));
    delete m.minimum_chrome_version;
    m.background = { scripts: ["background.js"] };
    m.browser_specific_settings = { gecko: { id: "endstep-tracker@mcouzinet.github.io", strict_min_version: "140.0", data_collection_permissions: { required: ["none"] } }, gecko_android: { strict_min_version: "142.0" } }; // Android learnt data_collection_permissions in 142
    fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
  ' "$stage/manifest.json"
fi
(cd "$stage" && zip -qr "$out" . -x '*/.DS_Store')
rm -rf "$stage"
unzip -l "$out" | grep -q coach && { echo "coach leaked into $out"; exit 1; }
unzip -l "$out" | tail -1 | awk -v o="$out" '{print o ": " $2 " files, " $1 " bytes"}'
