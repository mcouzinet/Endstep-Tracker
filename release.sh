#!/bin/sh
# Builds dist/endstep-tracker-<version>.zip: the runtime files only, what the Chrome Web Store gets.
set -e
cd "$(dirname "$0")"
v=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
out="dist/endstep-tracker-$v.zip"
mkdir -p dist && rm -f "$out"
zip -qr "$out" manifest.json background.js hook.js tracker.js content.js dashboard.html dashboard.js meta.js coach.js coach-model.json _locales icons -x 'icons/*.svg' '*/.DS_Store'
unzip -l "$out" | tail -1 | awk -v o="$out" '{print o ": " $2 " files, " $1 " bytes"}'
