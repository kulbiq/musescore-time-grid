#!/bin/sh
# Builds dist/time_grid-<version>.mext, the download for a GitHub release. A .mext file is a zip
# with manifest.json at its root: dragged onto MuseScore Studio's window, MuseScore installs it.
# The version comes from time_grid/manifest.json.
set -e
cd "$(dirname "$0")/.."
version=$(python3 -c "import json; print(json.load(open('time_grid/manifest.json'))['version'])")
rm -rf dist && mkdir dist
./install.sh dist/time_grid >/dev/null
(cd dist/time_grid && zip -qr "../time_grid-$version.mext" .)
echo "dist/time_grid-$version.mext"
