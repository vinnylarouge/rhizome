#!/bin/bash
# update.sh — Rhizome's update-from-git path. Pulls this repo, rebuilds the DMG
# payload, swaps /Applications/Rhizome.app, and relaunches. Run via the in-app
# "Update from Git…" menu item (opens in Terminal so progress is visible) or
# `npm run update`. Cores/extensions/settings are data in the user folder and
# never need this — only app-code changes do.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── Rhizome update — pulling latest…"
git pull --ff-only

echo "── Installing dependencies…"
npm install

echo "── Running tests…"
npm test

echo "── Building Rhizome.app…"
npm run dist

APP=$(ls -d dist/mac*/Rhizome.app 2>/dev/null | head -1)
if [ -z "$APP" ]; then
  echo "✗ Build produced no Rhizome.app under dist/ — aborting before touching /Applications." >&2
  exit 1
fi

echo "── Installing to /Applications…"
rm -rf /Applications/Rhizome.app
ditto "$APP" /Applications/Rhizome.app

echo "── Relaunching…"
open /Applications/Rhizome.app
echo "── Done ✓"
