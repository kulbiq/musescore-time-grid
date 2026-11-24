#!/bin/sh
# Headless end-to-end check: installs the extension, runs it on a generated score
# through the real MuseScore binary, and renders before/after PNGs into tests/out.
set -e
cd "$(dirname "$0")/.."
M="${MSCORE:-/Applications/MuseScore 4.app/Contents/MacOS/mscore}"
out="$PWD/tests/out"
rm -rf "$out" && mkdir -p "$out"
./install.sh >/dev/null
python3 tests/make_score.py "$out/test.musicxml"
"$M" -o "$out/before.mscz" "$out/test.musicxml" >/dev/null 2>&1
echo "[{\"in\":\"$out/before.mscz\",\"out\":\"$out/after.mscz\"}]" > "$out/job.json"
"$M" -j "$out/job.json" --extension "musescore://extensions/equal_spacing?action=selftest" >/dev/null 2>&1 || true
echo "[{\"in\":\"$out/after.mscz\",\"out\":\"$out/reloaded.mscz\"}]" > "$out/job2.json"
logs="$HOME/Library/Application Support/MuseScore/MuseScore4/logs"
show() { grep -h "equal_spacing \|core.js" "$logs/$(ls -t "$logs" | head -1)" | sed 's/.*| //'; }
show
test -f "$out/after.mscz" || { echo "FAILED: selftest"; exit 1; }
"$M" -j "$out/job2.json" --extension "musescore://extensions/equal_spacing?action=verify" >/dev/null 2>&1 || true
show
test -f "$out/reloaded.mscz" || { echo "FAILED: spacing did not survive save and reload"; exit 1; }
"$M" -r 100 -o "$out/before.png" "$out/before.mscz" >/dev/null 2>&1
"$M" -r 100 -o "$out/after.png" "$out/after.mscz" >/dev/null 2>&1
echo "OK - see $out"
