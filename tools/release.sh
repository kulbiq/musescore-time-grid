#!/bin/sh
# Builds dist/time_grid-<version>.zip, the download for a GitHub release: one time_grid folder,
# ready to drop into MuseScore's extensions folder. The version comes from time_grid/manifest.json.
set -e
cd "$(dirname "$0")/.."
version=$(python3 -c "import json; print(json.load(open('time_grid/manifest.json'))['version'])")
rm -rf dist && mkdir dist
./install.sh dist/time_grid >/dev/null
(cd dist && zip -qr "time_grid-$version.zip" time_grid)
echo "dist/time_grid-$version.zip"
