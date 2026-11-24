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
- Align image fits an image to one system, so it lines up with the music in time.

A system can be too dense to be linear: a short note would get less room than MuseScore's minimum note distance.
The checkbox "Keep bars on their line" decides what happens then.

- Unchecked (default): the last bars of that system move to the next line until the rest fits.
  The result is exact, but the systems change.
- Checked: the system is locked so every bar stays, and notes are put on the grid anyway.
  Notes and accidentals can end up closer than MuseScore normally allows.
  The barline moves up to the previous note and the downbeat moves up to the barline.
  If a bar ends on a note too short to leave room for a barline at all, the system is left unchanged.

Systems that cannot be made linear either way are left unchanged and named in the dialog.

## Images

MuseScore does not let extensions load picture files, so the image comes in through MuseScore itself: drag the image file onto a note of the system (or copy the picture and paste it onto a selected note).
Then select that system's bars on one staff and press Align image.
The image is scaled, keeping its proportions, to span exactly From to To: from the first note to the point where the system's time span ends.
It sits 1 staff space above the staff, or above the highest note if that is higher.

- Align image turns off the image's automatic placement.
  Otherwise MuseScore counts the image as part of its note and pushes the following notes out from under it.
- MuseScore does not make room above the staff for an image.
  If it runs into the system above, add space with a staff spacer or in the staff properties.
- Make linear and Reset leave images alone: press Align image again after changing the spacing.

## What it changes in the score

- Style > Measure > Spacing ratio is set to 2 for the whole score, which makes note spacing proportional to duration.
  This also changes the look of bars outside the selection.
  Reset does not restore it, because other linearized passages depend on it.
- Leading space of segments in the selection is overwritten.
- Measure stretch in the selection is overwritten.
- System locks on the selected systems are set (bars kept) or removed (bars may move), including locks you set yourself.
- The first time it runs on a score, every other system is locked too.
  Otherwise the style change would reflow the whole score.
  Remove the locks with Format > Add/remove system locks if you want free reflow back.

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
- `linearize.js`: `linearize(eng, range, { keepBars })` and `reset(eng, range)`, the only functions that change the score.
- `image.js`: `alignImages(eng, range)`, the Align image button.
- `report.js`: what the dialog shows (`describe`, `barsLabel`, `resultMessage`, `alignMessage`).
- `selftest.js`: the headless actions `selftest`, `verify` and `all`.

`Main.qml` only calls `selectedRange`, `describe`, `barsLabel`, `linearize`, `reset`, `alignImages`, `resultMessage` and `alignMessage`.
A range is `{ t0, t1, staff }`: ticks and the top selected staff, a "system" is one system's part of the selection (one row in the dialog).

## Test

`node --test tests/*.test.js` checks the grid math in a fraction of a second, without MuseScore.

`tests/run.sh` runs those, then runs the extension through the real MuseScore binary on a generated score.
It checks both modes: with bars kept, no bar may change system and the notes must be within 0.1 staff spaces of the grid.
With bars allowed to move, every note must be within 0.01 staff spaces, also after saving and reloading the file.
The test score also has an image on its first note (`tests/add_image.py`).
It is aligned before the spacing runs, which must then give the same results as without it, and aligned again at the end, where it must span the first system within 0.01 staff spaces.
Before and after PNGs are written to `tests/out`.
