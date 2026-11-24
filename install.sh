#!/bin/sh
# Copies the extension into MuseScore Studio's user extensions folder (macOS).
# MuseScore does not follow symlinks there, so re-run this after editing.
#
# core.js is loaded both by Main.qml (QML import) and by the macros actions in
# manifest.json, which cannot load sibling files the same way. So the sources in
# time_grid/src are joined into the one core.js that both load.
set -e
src="$(dirname "$0")/time_grid"
dest="$HOME/Library/Application Support/MuseScore/MuseScore4/extensions/time_grid"
rm -rf "$dest"
mkdir -p "$dest"
cp "$src/manifest.json" "$src"/*.qml "$src"/*.png "$dest/"
cat "$src"/src/*.js > "$dest/core.js"
echo "Installed to $dest - restart MuseScore, then enable it in Home > Plugins."
