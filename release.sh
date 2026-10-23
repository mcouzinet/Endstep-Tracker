#!/bin/sh
# Builds dist/endstep-tracker-<version>[-firefox|-safari].zip for the stores: runtime files only, without the Coach
# (the coach lives in Endstep-coach/extension-coach and is never in this repository; the leak check below stays as a guard).
# Usage: ./release.sh [chrome|firefox|safari]   (chrome by default; the Chrome zip also serves Edge)
# safari also leaves the package in dist/safari/, which the Xcode projects reference (Mac in safari/, iPhone in safari-ios/):
# run it before archiving.
set -e
cd "$(dirname "$0")"
target=${1:-chrome}
v=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
suffix=$([ "$target" = chrome ] || echo "-$target")
out="$PWD/dist/endstep-tracker-$v$suffix.zip"
mkdir -p dist && rm -f "$out"
if [ "$target" = safari ]; then stage="$PWD/dist/safari"; rm -rf "$stage"; mkdir -p "$stage"; else stage=$(mktemp -d); fi
cp -R manifest.json background.js telemetry.js hook.js tracker.js content.js dashboard.js meta.js shared.js theme.css popup.html popup.js overlay.js _locales "$stage"/
mkdir "$stage/icons" && cp icons/*.png "$stage/icons/"
[ "$target" = safari ] || rm "$stage/icons/icon-1024.png"
cp dashboard.html "$stage/"
# Development-only code (the Coach loader, the decision journal) sits between "// dev-only {" and "// } dev-only":
# left out of every store build. After that no file may mention the coach, and every script must still parse.
for f in "$stage"/*.js; do sed -i '' '/\/\/ dev-only {/,/\/\/ } dev-only/d' "$f"; node --check "$f"; done
if grep -ril coach "$stage" >/dev/null; then echo "coach mentioned in: $(grep -ril coach "$stage" | tr '\n' ' ')"; exit 1; fi
if [ "$target" = firefox ]; then
  # Firefox has no background service worker (event page instead), needs a gecko id, and AMO requires the
  # data-collection declaration: nothing is required; the anonymous usage statistics (telemetry.js) are the optional
  # "technicalAndInteraction" kind, which Firefox offers at install time and telemetry.js checks before sending.
  node -e '
    const fs = require("fs"), p = process.argv[1], m = JSON.parse(fs.readFileSync(p, "utf8"));
    delete m.minimum_chrome_version;
    m.background = { scripts: ["telemetry.js", "background.js"] };
    m.browser_specific_settings = { gecko: { id: "endstep-tracker@mcouzinet.github.io", strict_min_version: "143.0", data_collection_permissions: { required: ["none"], optional: ["technicalAndInteraction"] } }, gecko_android: { strict_min_version: "143.0" } }; // 143 for storage.getKeys
    fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
  ' "$stage/manifest.json"
fi
if [ "$target" = safari ]; then
  # Safari: 18.4 for storage.getKeys. browser_specific_settings instead of minimum_chrome_version, a 1024 px icon (Apple's
  # packager builds the app's App Store icon from the largest one), and hook.js out of the manifest: Safari ignores
  # "world" there, background.js registers it in the page world instead.
  node -e '
    const fs = require("fs"), p = process.argv[1], m = JSON.parse(fs.readFileSync(p, "utf8"));
    delete m.minimum_chrome_version;
    m.browser_specific_settings = { safari: { strict_min_version: "18.4" } };
    m.icons["1024"] = "icons/icon-1024.png";
    m.content_scripts = m.content_scripts.filter((c) => c.world !== "MAIN");
    fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
  ' "$stage/manifest.json"
  # No tip link in the App Store builds (guideline 3.1.1): the "Buy me a coffee" pill leaves the HTML here, instead of
  # being removed by a script once the page has loaded (Apple refused the Mac 1.5 for it), and nothing may still point there.
  perl -0pi -e 's#\s*<a class="bmc"[^>]*>.*?</a>##gs' "$stage/dashboard.html" "$stage/popup.html"
  if grep -ril buymeacoffee "$stage" >/dev/null; then echo "tip link left in: $(grep -ril buymeacoffee "$stage" | tr '\n' ' ')"; exit 1; fi
  # The App Store reads the apps' version from the Xcode projects (Mac in safari/, iPhone in safari-ios/): keep it on the manifest's.
  for x in safari safari-ios; do sed -i '' "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $v;/" "$x/Endstep Tracker/Endstep Tracker.xcodeproj/project.pbxproj"; done
fi
(cd "$stage" && zip -qr "$out" . -x '*/.DS_Store')
[ "$target" = safari ] || rm -rf "$stage"
unzip -l "$out" | grep -q coach && { echo "coach leaked into $out"; exit 1; }
unzip -l "$out" | tail -1 | awk -v o="$out" '{print o ": " $2 " files, " $1 " bytes"}'
