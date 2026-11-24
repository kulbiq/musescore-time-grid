# Equal Spacing

A MuseScore Studio 4.7+ extension that spaces the selected bars linearly in time.
After running it, every note in a system sits at `x = x0 + k * time`, so a linear time scale drawn above the system lines up with the music.
Bars of equal duration come out equally wide.
A barline takes its room from the time span of the note before it, so every downbeat stays on the grid.

## Install

Run `./install.sh` (macOS), then restart MuseScore.
Enable the extension once in Home > Plugins.
It then appears as Plugins > Equal Spacing > Equal Spacing.
Re-run `./install.sh` and restart MuseScore after changing the code.

## Use

Select some bars or a whole system, then open the dialog.
The dialog lists one row per selected system: bars, start time, end time, duration, and the horizontal span in millimetres from the left page edge.
"From" is the first note of the row and "To" is the point where the row's time span ends, so a scale drawn between them is exact.
The dialog stays open and follows the selection.

- Make linear spaces the selection.
- Reset removes the leading space, measure stretch and system locks from the selection.
- Reset all puts the whole score back as it was before the first Make linear: no leading space or measure stretch, the old spacing ratio, and your own system locks.
  Images stay where they are.
- Click an image instead of bars to align it, see Images.

A system can be too dense to be linear: a short note would get less room than MuseScore's minimum note distance.
The checkbox "Keep bars on their line" decides what happens then.

- Unchecked (default): the last bars of that system move to the next line until the rest fits.
  The result is exact, but the systems change, and a system that gave up bars is locked so they stay off it.
- Checked: the system is locked so every bar stays, and notes are put on the grid anyway.
  Notes and accidentals can end up closer than MuseScore normally allows.
  The barline moves up to the previous note and the downbeat moves up to the barline.
  If a bar ends on a note too short to leave room for a barline at all, the system is left unchanged.

Systems that cannot be made linear either way are left unchanged and named in the dialog.

## Images

MuseScore does not let extensions load picture files, so the image comes in through MuseScore itself: drag the image file onto the bar where it should start (or copy the picture and paste it onto a selected note).
The bar it lands in is its anchor bar.
Click the image, and the dialog offers two ways to align it:

- Align to whole system: the image spans the system its anchor bar is in.
- Align to bars: the image spans the number of bars set with the minus and plus buttons, starting at its anchor bar, up to the end of the system.

The image is scaled, keeping its proportions, to span exactly From to To of those bars: from their first note to the point where their time span ends.
It sits 1 staff space above the staff, or above the highest note if that is higher.

- A freshly dropped image takes part in automatic placement: MuseScore counts it as part of its note and pushes the following notes, sometimes whole bars, out from under it.
  Align and Make linear both turn that off for the images they touch, before they measure anything.
- MuseScore does not make room above the staff for an image.
  If it runs into the system above, add space with a staff spacer or in the staff properties.
- Make linear and Reset do not move images: align an image again after changing the spacing.

## What it changes in the score

- Style > Measure > Spacing ratio is set to 2 for the whole score, which makes note spacing proportional to duration.
  This also changes the look of bars outside the selection.
  Reset does not restore it, because other linearized passages depend on it, Reset all does.
- The first time, the old spacing ratio and your system locks are recorded in the score's properties (`equalSpacingOriginal`), for Reset all.
- Images in the selection stop taking part in automatic placement.
- Leading space of segments in the selection is overwritten.
- Measure stretch in the selection is set back to 1.
- System locks on the selected systems are set (bars kept) or removed (bars may move), including locks you set yourself.
  When bars move, the systems they moved off are locked again.
- The first time it runs on a score, every other system is locked too.
  Otherwise the style change would reflow the whole score.
  Reset all removes them again.

Times ignore repeats.
Multimeasure rests are not handled specially.
Every pass lays out the whole score, so running it on all of a long score at once is slow: work a few systems at a time.

## Code

MuseScore loads `core.js` twice: in the dialog (`Main.qml` imports it) and in the headless macros actions listed in `manifest.json`.
The two loaders cannot load sibling files the same way, so `install.sh` joins the files in `equal_spacing/src` into the one installed `core.js`.
Every function in `src` therefore shares one global scope.

- `grid.js`: the grid math, pure, on plain points.
  It never touches MuseScore objects.
- `layout.js`: reads the layout into points, and is the only file that reads `pagePos`.
  Points are a snapshot: after any `doLayout`, call `snapshot(sys)` or `collect()` again.
- `linearize.js`: `linearize(eng, range, { keepBars })`, `reset(eng, range)` and `resetAll(eng)`.
- `image.js`: `selectedImage(eng)` and `alignImage(eng, image, barCount)`, plus `releaseImages` for Make linear.
- `report.js`: what the dialog shows (`describe`, `barsLabel` and the status messages).
- `selftest.js`: the headless actions `selftest`, `verify` and `all`.

`Main.qml` calls only these and the `*Message` functions: `selectedRange`, `selectedImage`, `describe`, `barsLabel`, `linearize`, `reset`, `resetAll` and `alignImage`.
A range is `{ t0, t1 }` in ticks, a "system" is one system's part of the selection (one row in the dialog).

## Test

`node --test tests/*.test.js` checks the grid math in a fraction of a second, without MuseScore.

`tests/run.sh` runs those, then runs the extension through the real MuseScore binary on a generated score.
It checks both modes: with bars kept, no bar may change system and the notes must be within 0.1 staff spaces of the grid.
With bars allowed to move, every note must be within 0.01 staff spaces, also after saving and reloading the file.
The test score also has freshly dropped images on the first notes of bars 1 and 15, the dense one (`tests/add_image.py`).
Both are aligned before the spacing runs and must span their bars within 0.01 staff spaces; the spacing must then give the same results as without them.
After the reload, Reset all must restore the score, and Make linear must work on bars whose image was just dropped.
Before and after PNGs are written to `tests/out`.
