# Refactor plan: Equal Spacing

**Status: done (steps 0-7).**
The selftest numbers are identical to the baseline after every step.
Differences from the plan below:

- Steps 3 and 4 went in as one commit, because the pure functions need the snapshot fields (`carrierX`, `leading`).
- `grid.js` has `gapError(points, i)` instead of `gapErrors(points)`, and `splitGap(points, i, change)` and `barlinesFit(points)` read from the points.
- `splitGap` returns null for a change too small to act on, so `sweep` re-lays out under exactly the old condition.
- `selectedRange` and `resultMessage` take `eng` like the rest.
- Visible change: the dialog's summary line now reads "Bars 3" for a single bar instead of "Bars 3-3".
- `describe` rows lost the unused `error` field.
- The selftest log says `keepBars=` instead of `squeeze=`.
- The selftest now also runs `describe` and `resultMessage`, so the dialog's core calls are covered headless.

Goal: make the plugin easier to change without changing what it does.
Every step is a pure move, checked by `tests/run.sh`.
Vocabulary follows the codebase-design glossary: module, interface, seam, adapter, depth.

## Where things stand

| File | Lines | Holds |
|---|---|---|
| `equal_spacing/core.js` | 517 | Everything: reading the layout, grid math, writing to the score, the linearize loop, timing, the dialog's table data, the headless selftest |
| `equal_spacing/Main.qml` | 206 | Dialog: selection polling, table, checkbox, buttons, plus some domain knowledge |
| `tests/run.sh` + `make_score.py` | 133 | End-to-end check through the real MuseScore binary |

What `core.js` offers its callers today is fine: `selectedRange`, `describe`, `linearize`, `reset`, plus the macros `selftest`, `verify` and `all`.
The problems are inside it, and in what callers have to know.

### Problems, ranked

1. **The grid math has no seam of its own.**
   The linear fit `k = (x_n - x_0) / (t_n - t_0)` is recomputed in `groupError`, `correct`, `sweep` and `tooDense`.
   The barline-clearance policy in `changeGap` and `barlineMisplaced` is plain arithmetic mixed with MuseScore reads and writes.
   None of it can be tested without launching MuseScore, so every tweak to the algorithm costs a full end-to-end run.
2. **Cached and live positions are mixed.**
   `collect` stores `p[i].x` as a snapshot.
   `correct` and `groupError` read that snapshot.
   `changeGap`, `sweep` and `barlineMisplaced` read `seg.pagePos.x` live.
   A caller has to know which one is fresh at any moment, and that is part of the interface nobody wrote down.
3. **Test code and fixture knowledge ship inside the logic.**
   `selftest`, `verify`, `all` and `TEST_DENSE_FROM = 24000` sit in `core.js`.
   `24000` is "bar 15 of the score that `make_score.py` writes", so a change to the fixture silently breaks the test.
4. **The `linearize` interface is noisier than it needs to be.**
   The UI says `keepBars`, the core says `squeeze`, for the same thing.
   `score` and `eng` are both passed, though every caller uses `eng.curScore`.
   `t0` and `t1` are passed separately, though `selectedRange` already returns `{ t0, t1 }`.
   `f0` and `f1` are threaded through `attempt` and `sweep` only to call `score.doLayout`.
   The score's end tick is computed five times, and the stretch reset is written twice (`linearize` and `reset`).
5. **`Main.qml` holds domain knowledge.**
   It converts spatium to millimetres (`spatium / 1200 * 25.4`).
   It formats a bar range in two places.
   It builds the result message from `res.failed` and `res.error`.

## The loader constraint

`core.js` is loaded two different ways.
`Main.qml` loads it with `import "core.js" as Core`, which runs it in the QML engine.
The macros actions in `manifest.json` load it through MuseScore's extensions script engine.
The binary has `requireFile` and `requireModule` in that engine, but nothing shows a QML-imported file can load a sibling the same way, and `.import` is QML-only.

**Recommendation:** split the source into several files, and have `install.sh` concatenate them into the one `core.js` that MuseScore sees.
`install.sh` is already mandatory (MuseScore does not follow symlinks), and `tests/run.sh` already calls it, so the build step costs one line and works with both loaders.
Function declarations are hoisted and the constants are only read at call time, so the order of the files barely matters, but list them explicitly anyway.

**Alternative, behind a spike:** native imports.
Make a two-file split, check that the dialog still loads and that the `selftest` action still runs.
Only if both work, drop the concatenation.

## Target layout

```
equal_spacing/
  manifest.json      unchanged
  Main.qml           view only
  src/
    grid.js          pure: grid math and barline policy, no MuseScore objects
    layout.js        adapter: the only place that reads positions from MuseScore
    linearize.js     the loop: linearize, reset, and their score writes
    report.js        describe, timing, bar labels, mm conversion
    selftest.js      selftest, verify, all
install.sh           copies manifest + QML, cats src/*.js into core.js
tests/
  grid.test.js       node --test, no MuseScore
  run.sh             unchanged end-to-end check
  make_score.py
```

### `grid.js`: the deep module

Plain data in, numbers out.
A point is `{ t, x, sameBar }`, and `sameBar` replaces the `carrier.is(seg)` check so the module never touches a segment.

Interface:

- `gridError(points)`: the worst deviation from the line through the first and last point, in spatium.
- `gapErrors(points)`: per gap, how much wider it should be.
  `correct` uses all of them at once, and `sweep` takes one per step.
- `tooDense(points)`: true when linear spacing would make notes collide.
- `splitGap(change, { prevNoteX, barlineX, noteX, noteLeading })`: how a gap change across a barline splits between the barline's leading space and the downbeat's.
  This is where `BARLINE_CLEARANCE` and `NOTE_AFTER_BARLINE` live.
- `barlineFits({ prevNoteX, barlineX, noteX })`: the check now inside `barlineMisplaced`.

The constants that are about geometry (`TOLERANCE`, `SQUEEZE_TOLERANCE`, `DENSE_SLACK`, the two clearances) move here too.

Deletion test: delete `grid.js` and the fit and the clearance rules come back in four or five places.
It earns its keep.

### `layout.js`: one read site

- `selectedRange(score)`: unchanged.
- `collect(eng, range)`: walks the bars and returns one entry per system with plain points.
- `snapshot(system)`: re-reads every position of a system from the live layout.

Rule written at the top of the file: points are a snapshot; after any `doLayout`, call `snapshot` or `collect` again.
`pagePos` is read nowhere else.
This fixes problem 2: `changeGap`, `sweep` and `barlineMisplaced` stop reading live positions and get them from a fresh snapshot instead.
`correct` applies all gap changes before the next layout, so its snapshot and the live layout agree, and its results should not change.
`sweep` takes a snapshot before each gap, which is what it does today in effect.

The system grouping trick (`sysKey` from `canvasPos`) and the multimeasure-rest caveat stay private here.

### `linearize.js`: the loop

Interface after the tidy:

- `linearize(eng, range, { keepBars })` returns `{ error, failed }` as now.
- `reset(eng, range)`.

Inside, one context `{ score, eng, relayout() }` is built once and replaces the `f0, f1` threading.
`correct`, `sweep`, `widen`, `attempt` and the whole-score lock on first run stay private.
Shared helpers: `scoreEndTick(score)` and `resetStretch(m)`.

No fake score.
The loop is a feedback loop against MuseScore's real layout engine, so a fake would have to re-implement `horizontalspacing.cpp`.
With only one real adapter, a seam there would be hypothetical.
The pure parts go to `grid.js` and get fast tests; the loop keeps the end-to-end test.

### `report.js`: what the dialog shows

- `describe(eng, range)` returns rows with `x0Mm` and `x1Mm`, so `Main.qml` no longer knows about spatium.
- `barsLabel(firstBar, lastBar)` replaces the two copies in `Main.qml`.
- `resultMessage(result, mmPerSpatium)` builds the status text after Make linear, or keep it in QML if the wording is a UI concern.

`clock` can stay in QML; it is display formatting and has one caller.

### `selftest.js`

Moves `selftest`, `verify` and `all` out of the logic.
`TEST_DENSE_FROM = 24000` becomes `DENSE_BAR = 15`, looked up by bar number, with a comment pointing to the line in `make_score.py` that makes bar 15 dense.

### Naming

One word per idea, used the same way in code, README and dialog:

- "system" for one system's slice of the selection (today `group` in code, "row" in the dialog); MuseScore's own system element is only touched as `m.parent` inside `layout.js`.
- `keepBars` everywhere (today also `squeeze`).
- "carrier" stays, defined once in `layout.js`: the segment whose leading space sets the gap before a point.

## Steps

Each step ends with `tests/run.sh` green **and** the selftest log line's numbers identical to the baseline.
"OK" alone is not enough; identical numbers mean behaviour did not change.

0. **Safety net.**
   `git init`, add `.DS_Store` to `.gitignore`, commit the current state.
   Run `tests/run.sh` once and save the `equal_spacing selftest:` and `verify:` log lines as the baseline.
1. **Build step.**
   Move `core.js` to `equal_spacing/src/core.js` unchanged, make `install.sh` cat `src/*.js` into the installed `core.js`.
   Nothing else changes.
2. **Split out `selftest.js`.**
   Switch to `DENSE_BAR`.
3. **Extract `grid.js` and add `tests/grid.test.js`.**
   `collect` sets `sameBar` on each point.
   Node tests load `grid.js` with `vm.runInNewContext`, so the file needs no `module.exports` and stays valid for both MuseScore loaders.
   Cases: points on a line give 0; one shifted point gives its shift; a widened in-bar gap is too dense; `splitGap` stops at each clearance.
4. **One read site in `layout.js`.**
   This is the only step that could move a number.
   If it does, find out why before going on.
5. **Tidy the `linearize` and `reset` interfaces**, rename `squeeze` to `keepBars`, add `scoreEndTick` and `resetStretch`, update `Main.qml` to the new calls.
6. **Move domain knowledge out of `Main.qml`** into `report.js`.
7. **Update the README**: a short "Code" section with the layout above and the snapshot rule.

## Left out on purpose

- A `CheckBox.qml` component for the hand-drawn checkbox: add it when a second option appears.
- Partial layout instead of whole-score layout: the `ponytail:` note in `linearize` already names the cost; change it when long scores become a real use.
- A fake score for unit-testing the loop: see `linearize.js` above.

## Open question

What features come next?
If the next work is a new spacing mode, `grid.js` and `linearize.js` matter most; if it is more dialog options, steps 5 and 6 and the checkbox component move up.
