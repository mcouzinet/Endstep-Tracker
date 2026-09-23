#!/bin/sh
# Builds dist/endstep-tracker-<version>.zip for the Chrome Web Store: runtime files only, without the Coach
# (coach.js and coach-model.json are personal / experimental; dashboard.js hides the Coach block when coach.js is absent).
set -e
cd "$(dirname "$0")"
v=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
out="$PWD/dist/endstep-tracker-$v.zip"
mkdir -p dist && rm -f "$out"
stage=$(mktemp -d)
cp -R manifest.json background.js hook.js tracker.js content.js dashboard.js meta.js _locales "$stage"/
mkdir "$stage/icons" && cp icons/*.png "$stage/icons/"
grep -v '<script src="coach.js">' dashboard.html > "$stage/dashboard.html"
(cd "$stage" && zip -qr "$out" . -x '*/.DS_Store')
rm -rf "$stage"
unzip -l "$out" | grep -q coach && { echo "coach leaked into $out"; exit 1; }
unzip -l "$out" | tail -1 | awk -v o="$out" '{print o ": " $2 " files, " $1 " bytes"}'
