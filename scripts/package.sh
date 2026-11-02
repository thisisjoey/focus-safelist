#!/bin/sh
# Builds dist/focus-safelist-<version>.zip for the Chrome Web Store: only the
# files the extension needs (no tests, scripts, store assets or docs).
# Run from anywhere:  sh scripts/package.sh
set -e
cd "$(dirname "$0")/.."
version=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
out="dist/focus-safelist-$version.zip"
mkdir -p dist
rm -f "$out"
zip -rq -X "$out" manifest.json background.js lib content popup options icons -x '*/.*' -x '.*'
echo "$out"
