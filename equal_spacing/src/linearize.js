// Linear (time-proportional) horizontal spacing for MuseScore Studio 4.7+.
//
// Goal: inside each system, every note position satisfies x = x0 + k * (tick - tick0),
// so a linear time scale drawn above the system lines up with the music.
//
// How (see MuseScore's horizontalspacing.cpp):
// 1. Style "spacing ratio" (measureSpacing) = 2 makes every note's spring stretch
//    proportional to its duration, so justified notes inside a bar are already linear.
// 2. What is left is a fixed extra gap wherever something sits between two notes
//    (barline, key or time signature). The segment right after a note carries a
//    "leading space" that is added to that gap outside the springs, so we feed each
//    gap's measured error back into it and re-layout until it is gone.
// 3. A system can be too dense for this: a short note would get less room than MuseScore's
//    minimum distance. There are two ways out, chosen by the caller:
//    - move bars: raise the bars' stretch until MuseScore moves the system's last bar to the
//      next line, and repeat until the rest fits. Exact, but systems change.
//    - keep bars: lock the system so its bars stay, and put the notes on the grid anyway,
//      closer than the minimum distance. Notes can overlap.
//
// The geometry is in grid.js, reading the layout in layout.js. This file writes to the score.

var PASSES = 4;            // whole-system passes before falling back to sweeps
var STRETCH_STEP = 1.15, MAX_STRETCH = 10;   // 10 is MuseScore's own limit
var MAX_ROUNDS = 400;      // bar-moving rounds, each moves at most one bar per system
var SWEEPS = 6;            // one-gap-at-a-time sweeps for tightly packed systems

function eachMeasure(score, range, fn) {
    for (var m = score.firstMeasure; m; m = m.nextMeasure) {
        var mt = m.tick.ticks;
        if (mt >= range.t1) {
            break;
        }
        if (mt + m.ticks.ticks > range.t0) {
            fn(m);
        }
    }
}

function clearLeading(score, range) {
    eachMeasure(score, range, function (m) {
        for (var s = m.firstSegment; s; s = s.nextInMeasure) {
            if (Number(s.leadingSpace) !== 0) {
                s.leadingSpace = 0;
            }
        }
    });
}

function resetStretch(m) {
    if (m.userStretch !== 1) {
        m.userStretch = 1;
    }
}

// Changes the gap before point i by `change` spatium, as splitGap decides.
// Returns false when the change is too small to act on. True does not mean anything was
// written: across a barline there may be no room left.
function applyGap(p, i, change) {
    var split = p[i].carrier ? splitGap(p, i, change) : null;
    if (!split) {
        return false;
    }
    function add(seg, v) {
        if (v !== 0) {
            seg.leadingSpace = Number(seg.leadingSpace) + v;
        }
    }
    add(p[i].carrier, split.carrier);
    add(p[i].seg, split.note);
    return true;
}

// Fast correction of a whole system at once: feeds each gap's error into its carrier.
// Exact when the system has room to spare, which settles most systems in two passes.
// Expects a fresh snapshot.
function correct(sys) {
    var p = sys.points;
    if (p.length < 3) {
        return;
    }
    for (var i = 1; i < p.length; i++) {
        applyGap(p, i, gapError(p, i));
    }
}

// Slow but robust correction for a tightly packed system: fixes one gap at a time, left to
// right, with a fresh layout after every change. In a tight system a carrier also changes the
// gap after it, which makes correct() overshoot. Going in order absorbs that.
// Returns the system's remaining error.
function sweep(sys, relayout) {
    var p = sys.points;
    for (var round = 0; round < SWEEPS; round++) {
        for (var i = 1; i < p.length; i++) {
            snapshot(sys);
            if (applyGap(p, i, gapError(p, i))) {
                relayout();
            }
        }
        snapshot(sys);
        if (gridError(p) < TOLERANCE) {
            break;
        }
    }
    return gridError(p);
}

// Makes room in the given systems by raising the stretch of their bars.
// Stretch scales all springs alike, so it cannot make a fixed set of bars linear by itself:
// what it does is grow the bars until MuseScore moves the system's last bar to the next line.
// That last bar is therefore set back to stretch 1, so it arrives on its new system unstretched.
// Returns false when nothing could be raised any further.
function widen(systems) {
    var changed = false;
    function set(m, v) {
        if (m.userStretch !== v) {
            m.userStretch = v;
            changed = true;
        }
    }
    systems.forEach(function (sys) {
        var ms = sys.measures;
        var evict = sys.endsSystem && ms.length > 1;
        var keep = evict ? ms.length - 1 : ms.length;
        var top = 0, i;
        for (i = 0; i < keep; i++) {
            top = Math.max(top, ms[i].userStretch);
        }
        for (i = 0; i < keep; i++) {
            set(ms[i], Math.min(top * STRETCH_STEP, MAX_STRETCH));
        }
        if (evict) {
            set(ms[keep], 1);
        }
    });
    return changed;
}

// One attempt at the current system layout. Lays out, then corrects every system that is not
// in `skip` (a predicate). Returns the systems, each with .error set (Infinity for skipped ones).
function attempt(eng, range, relayout, skip) {
    var systems;
    for (var pass = 0; pass < PASSES; pass++) {
        relayout();
        systems = collect(eng, range);
        var todo = systems.filter(function (sys) { return !skip(sys, pass); });
        if (maxError(todo) < TOLERANCE || pass === PASSES - 1) {
            break;
        }
        todo.forEach(correct);
    }
    systems.forEach(function (sys) {
        sys.error = skip(sys, -1) ? Infinity : gridError(sys.points);
        if (sys.error >= TOLERANCE && sys.error < Infinity) {
            sys.error = sweep(sys, relayout);
        }
        if (!barlinesFit(snapshot(sys).points)) {
            sys.error = Infinity;
        }
    });
    return systems;
}

// Makes spacing linear in range { t0, t1 } of the current score.
// options.keepBars false: bars of a too dense system move to the next line.
// options.keepBars true: every bar stays on its system, notes may end up closer than MuseScore allows.
// Returns { error, failed }: the worst remaining error in spatium among the systems that worked,
// and the systems that could not be made linear and were left alone, as [{ firstBar, lastBar }].
// Runs as a single undoable command.
// ponytail: every pass lays out the whole score, because MuseScore's partial layout can break
// systems differently from the full layout. Fine for selections, slow for whole long scores.
function linearize(eng, range, options) {
    var score = eng.curScore, keepBars = options.keepBars;
    function relayout() {
        layoutAll(eng);
    }
    var failed = [], err = 0, dense = {};
    var tolerance = keepBars ? KEEP_BARS_TOLERANCE : TOLERANCE;
    score.startCmd("Linear spacing");
    if (releaseImages(eng, range)) {
        relayout();   // released images let go of the notes they pushed, bars may come back
    }
    var systems = collect(eng, range);
    if (Number(score.style.value("measureSpacing")) !== 2) {
        recordOriginal(score);
        // The style is score-wide and would reflow every system. Lock them all first, so that
        // only the selection changes.
        for (var m = score.firstMeasure; m; m = m.nextMeasure) {
            if (!m.parent.isLocked) {
                m.parent.isLocked = true;
            }
        }
        score.style.setValue("measureSpacing", 2);
    }
    systems.forEach(function (sys) {
        sys.measures[0].parent.isLocked = keepBars;
    });
    eachMeasure(score, range, resetStretch);
    for (var round = 0; round < (keepBars ? 1 : MAX_ROUNDS); round++) {
        clearLeading(score, range);
        // when bars may move, systems that are too dense are not corrected but widened
        systems = attempt(eng, range, relayout, function (sys, pass) {
            if (pass === 0) {
                dense[sys.firstBar] = !keepBars && tooDense(sys.points);
            }
            return dense[sys.firstBar];
        });
        var bad = systems.filter(function (sys) { return sys.error >= tolerance; });
        if (keepBars || !bad.length || !widen(bad)) {
            break;
        }
    }
    systems.forEach(function (sys) {
        if (sys.error < tolerance) {
            err = Math.max(err, sys.error);
        } else {
            // drop any half-finished corrections so the system looks normal again
            var ms = sys.measures, lastM = ms[ms.length - 1];
            clearLeading(score, { t0: ms[0].tick.ticks, t1: lastM.tick.ticks + lastM.ticks.ticks });
            failed.push({ firstBar: sys.firstBar, lastBar: sys.lastBar });
        }
    });
    score.endCmd();
    return { error: err, failed: failed };
}

// Undoes the per-bar changes in range { t0, t1 }: leading space, measure stretch and system locks.
// The score-wide spacing ratio style is left alone.
function reset(eng, range) {
    var score = eng.curScore;
    score.startCmd("Reset linear spacing");
    clearLeading(score, range);
    eachMeasure(score, range, function (m) {
        resetStretch(m);
        m.parent.isLocked = false;
    });
    score.endCmd();
}

// Score metadata: what the score looked like before the first Make linear, so Reset all can restore it.
var ORIGINAL_TAG = "equalSpacingOriginal";

// Records the spacing ratio style and the user's own system locks, as { measureSpacing, locks },
// locks being [first bar tick, last bar tick] of each locked system. Call before changing either.
function recordOriginal(score) {
    var locks = [];
    for (var m = score.firstMeasure; m; m = m.nextMeasure) {
        var sys = m.parent;
        if (sys.isLocked && sys.firstMeasure.is(m)) {
            locks.push([m.tick.ticks, sys.lastMeasure.tick.ticks]);
        }
    }
    score.setMetaTag(ORIGINAL_TAG, JSON.stringify({
        measureSpacing: Number(score.style.value("measureSpacing")), locks: locks
    }));
}

// Undoes everything Make linear changed in the whole score: leading space, measure stretch, and,
// when the first Make linear recorded them, the spacing ratio style and the system locks.
// Images stay where they are. Returns { restored }: whether style and locks were restored.
function resetAll(eng) {
    var score = eng.curScore, whole = { t0: 0, t1: scoreEnd(score) };
    var original = score.metaTag(ORIGINAL_TAG);
    score.startCmd("Reset all linear spacing");
    clearLeading(score, whole);
    eachMeasure(score, whole, resetStretch);
    if (original) {
        var o = JSON.parse(original);
        eachMeasure(score, whole, function (m) {
            if (m.parent.isLocked) {
                m.parent.isLocked = false;
            }
        });
        score.style.setValue("measureSpacing", o.measureSpacing);
        layoutAll(eng);
        o.locks.forEach(function (lock) {
            var a = score.tick2measure(eng.fraction(lock[0], WHOLE_TICKS));
            var b = score.tick2measure(eng.fraction(lock[1], WHOLE_TICKS));
            if (a && b) {
                score.makeIntoSystem(a, b);
            }
        });
        score.setMetaTag(ORIGINAL_TAG, "");
    }
    score.endCmd();
    return { restored: !!original };
}
