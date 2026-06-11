#!/bin/bash
# update.sh — Rhizome's update-from-git path. Pulls this repo, rebuilds, swaps
# the installed app, and relaunches. Run via the in-app "Update from Git…" menu
# item or `npm run update`. Cores/extensions/settings are data in the user
# folder and never need this — only app-code changes do.
#
# macOS: rebuilds the DMG payload and swaps /Applications/Rhizome.app.
# Linux:  rebuilds the AppImage and installs it to ~/.local/bin/rhizome.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── Rhizome update — pulling latest…"
git pull --ff-only

echo "── Installing dependencies…"
npm install

echo "── Running tests…"
npm test

if [ "$(uname -s)" = "Darwin" ]; then
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
else
  echo "── Building AppImage…"
  npx electron-builder --linux AppImage --publish never

  APPIMAGE=$(ls -t dist/Rhizome-*.AppImage 2>/dev/null | head -1)
  if [ -z "$APPIMAGE" ]; then
    echo "✗ Build produced no AppImage under dist/ — aborting." >&2
    exit 1
  fi

  echo "── Installing to ~/.local/bin/rhizome…"
  mkdir -p "$HOME/.local/bin"
  install -m 755 "$APPIMAGE" "$HOME/.local/bin/rhizome"

  echo "── Relaunching…"
  nohup "$HOME/.local/bin/rhizome" >/dev/null 2>&1 &
fi
echo "── Done ✓"
