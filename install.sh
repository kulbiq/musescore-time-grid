#!/bin/sh
# Copies the extension into MuseScore Studio's user extensions folder (macOS).
# MuseScore does not follow symlinks there, so re-run this after editing.
set -e
dest="$HOME/Library/Application Support/MuseScore/MuseScore4/extensions/equal_spacing"
rm -rf "$dest"
cp -R "$(dirname "$0")/equal_spacing" "$dest"
echo "Installed to $dest - restart MuseScore, then enable it in Home > Plugins."
