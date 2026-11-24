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
//    - squeeze: lock the system so its bars stay, and put the notes on the grid anyway,
//      closer than the minimum distance. Notes can overlap.
//
// This file is used both by Main.qml (import "core.js" as Core) and as a macros action,
// so it takes the api objects as arguments.

var WHOLE_TICKS = 1920;   // MuseScore division is 480 ticks per quarter
var TOLERANCE = 0.01;     // spatium, about 0.02 mm at default staff size
// Squeezing stops where MuseScore refuses to move a barline any closer to its notes,
// which leaves a few hundredths of a staff space. Accept that instead of failing.
var SQUEEZE_TOLERANCE = 0.1;
var PASSES = 4;            // whole-system passes before falling back to sweeps
var DENSE_SLACK = 0.05;     // spatium
var BARLINE_CLEARANCE = 1.5;   // spatium a barline keeps from the start of the note before it
var NOTE_AFTER_BARLINE = 0.4;  // spatium a downbeat keeps from the barline before it
var STRETCH_STEP = 1.15, MAX_STRETCH = 10;   // 10 is MuseScore's own limit
var MAX_ROUNDS = 400;      // bar-moving rounds, each moves at most one bar per system
var SWEEPS = 6;            // one-gap-at-a-time sweeps for tightly packed systems

function frac(eng, ticks) {
    return eng.fraction(ticks, WHOLE_TICKS);
}

function sysKey(measure) {
    var p = measure.parent.canvasPos;
    return p.x + "," + p.y;
}

// Expands the current range selection to whole bars.
// Returns { t0, t1 } in ticks, or null when there is no range selection.
function selectedRange(score) {
    var sel = score.selection;
    if (!sel || !sel.isRange || !sel.startSegment) {
        return null;
    }
    var t0 = sel.startSegment.tick;
    var last = score.lastMeasure;
    var scoreEnd = last.tick.ticks + last.ticks.ticks;
    var t1 = sel.endSegment ? sel.endSegment.tick : scoreEnd;
    var a = null, b = scoreEnd;
    for (var m = score.firstMeasure; m; m = m.nextMeasure) {
        var mt = m.tick.ticks, me = mt + m.ticks.ticks;
        if (a === null && me > t0) {
            a = mt;
        }
        if (me >= t1) {
            b = me;
            break;
        }
    }
    return a === null ? null : { t0: a, t1: b };
}

// Walks the bars overlapping [t0, t1) and returns one group per system:
// { firstBar, lastBar, measures, endsSystem, pts: [{ t, x, seg, carrier, bar }] }
// pts are the note positions in the range plus one closing reference point:
// the next note in the same system, or the system's final barline.
// carrier is the segment right after the previous note: its leading space
// sets the gap between the previous point and this one.
// ponytail: multimeasure rests are walked as their underlying bars, use nextMeasureMM if that matters.
function collect(score, eng, t0, t1) {
    var CR = eng.Segment.ChordRest, BAR = eng.Segment.EndBarLine;
    var groups = [], cur = null, barNo = 0;
    for (var m = score.firstMeasure; m; m = m.nextMeasure) {
        barNo++;
        var mt = m.tick.ticks, me = mt + m.ticks.ticks;
        if (me <= t0) {
            continue;
        }
        var key = sysKey(m);
        var closing = mt >= t1;          // first bar after the range: only its first note is needed
        if (closing && (!cur || cur.key !== key || cur.closed)) {
            break;
        }
        if (!closing && (!cur || cur.key !== key)) {
            cur = { key: key, firstBar: barNo, lastBar: barNo, pts: [], measures: [], closed: false, carrier: null, barline: null };
            groups.push(cur);
        }
        if (!closing) {
            cur.lastBar = barNo;
            cur.measures.push(m);
        }
        for (var s = m.firstSegment; s; s = s.nextInMeasure) {
            var type = s.segmentType;
            if (cur.pts.length && !cur.carrier) {
                cur.carrier = s;
            }
            if (type === BAR) {
                cur.barline = s;
            } else if (type === CR) {
                cur.pts.push({ t: s.tick, x: s.pagePos.x, seg: s, carrier: cur.carrier, bar: barNo, isNote: true });
                cur.carrier = null;
                if (closing) {
                    break;
                }
            }
        }
        if (closing) {
            cur.closed = true;
            break;
        }
        var next = m.nextMeasure;
        if ((!next || sysKey(next) !== key) && cur.barline && cur.pts.length) {
            // system ends here: the final barline stands in for the next downbeat
            cur.pts.push({ t: me, x: cur.barline.pagePos.x, seg: cur.barline, carrier: cur.carrier });
            cur.closed = true;
            cur.endsSystem = true;
        }
    }
    return groups;
}

// Largest deviation from the linear grid in a group, in spatium.
function groupError(g) {
    var p = g.pts, n = p.length - 1;
    if (n < 1) {
        return 0;
    }
    var k = (p[n].x - p[0].x) / (p[n].t - p[0].t);
    var worst = 0;
    for (var i = 1; i < n; i++) {
        worst = Math.max(worst, Math.abs(p[0].x + k * (p[i].t - p[0].t) - p[i].x));
    }
    return worst;
}

function maxError(groups) {
    var worst = 0;
    for (var i = 0; i < groups.length; i++) {
        worst = Math.max(worst, groupError(groups[i]));
    }
    return worst;
}

function eachMeasure(score, t0, t1, fn) {
    for (var m = score.firstMeasure; m; m = m.nextMeasure) {
        var mt = m.tick.ticks;
        if (mt >= t1) {
            break;
        }
        if (mt + m.ticks.ticks > t0) {
            fn(m);
        }
    }
}

function clearLeading(score, t0, t1) {
    eachMeasure(score, t0, t1, function (m) {
        for (var s = m.firstSegment; s; s = s.nextInMeasure) {
            if (Number(s.leadingSpace) !== 0) {
                s.leadingSpace = 0;
            }
        }
    });
}

// Changes the gap before point i by `change` spatium (negative = narrower).
// Inside a bar the carrier is the note itself. Across a barline there are two handles:
// the barline's leading space moves barline and downbeat together, and the downbeat's own
// leading space moves it relative to the barline. To narrow the gap, the barline first moves
// left until it is BARLINE_CLEARANCE from the previous note, then the downbeat closes in on
// the barline down to NOTE_AFTER_BARLINE. Whatever is left over cannot be had.
function changeGap(p, i, change) {
    var c = p[i].carrier, note = p[i].seg;
    if (!c || Math.abs(change) <= TOLERANCE / 4) {
        return;
    }
    function add(seg, v) {
        if (v !== 0) {
            seg.leadingSpace = Number(seg.leadingSpace) + v;
        }
    }
    if (c.is(note) || !p[i].isNote) {  // same bar, or the closing point is the final barline
        add(c, change);
        return;
    }
    if (change > 0) {
        // widen: first give the downbeat its normal distance back, then move the barline
        var back = Math.min(change, Math.max(0, -Number(note.leadingSpace)));
        add(note, back);
        add(c, change - back);
    } else {
        var cx = c.pagePos.x;
        var viaBarline = Math.max(change, -Math.max(0, cx - (p[i - 1].seg.pagePos.x + BARLINE_CLEARANCE)));
        var rest = change - viaBarline;
        var viaNote = Math.max(rest, -Math.max(0, note.pagePos.x - cx - NOTE_AFTER_BARLINE));
        add(c, viaBarline);
        add(note, viaNote);
    }
}

// Fast correction of a whole system at once: feeds each gap's error into its carrier.
// Exact when the system has room to spare, which settles most systems in two passes.
function correct(g) {
    var p = g.pts, n = p.length - 1;
    if (n < 2) {
        return;
    }
    var k = (p[n].x - p[0].x) / (p[n].t - p[0].t);
    for (var i = 1; i <= n; i++) {
        changeGap(p, i, k * (p[i].t - p[i - 1].t) - (p[i].x - p[i - 1].x));
    }
}

// Slow but robust correction for a tightly packed system: fixes one gap at a time, left to
// right, with a fresh layout after every change. In a tight system a carrier also changes the
// gap after it, which makes correct() overshoot. Going in order absorbs that.
// Returns the system's remaining error.
function sweep(score, g, f0, f1) {
    var p = g.pts, n = p.length - 1, span = p[n].t - p[0].t;
    function x(i) {
        return p[i].seg.pagePos.x;
    }
    for (var round = 0; round < SWEEPS; round++) {
        for (var i = 1; i <= n; i++) {
            var gapError = (x(n) - x(0)) / span * (p[i].t - p[i - 1].t) - (x(i) - x(i - 1));
            if (p[i].carrier && Math.abs(gapError) > TOLERANCE / 4) {
                changeGap(p, i, gapError);
                score.doLayout(f0, f1);
            }
        }
        for (i = 0; i <= n; i++) {
            p[i].x = x(i);
        }
        if (groupError(g) < TOLERANCE) {
            break;
        }
    }
    return groupError(g);
}

// True when a system cannot be linear without notes running into each other.
// Call on a fresh layout without leading space. With spacing ratio 2 every gap inside a bar
// then has the same width per tick, except where MuseScore had to widen it to avoid a collision.
// If such a gap is already wider than its share of the system, linear spacing would overlap notes.
function tooDense(g) {
    var p = g.pts, n = p.length - 1, i, rate = {};
    if (n < 2) {
        return false;
    }
    function inBar(i) {
        return p[i].carrier && p[i].carrier.is(p[i].seg);   // nothing between the two notes
    }
    for (i = 1; i <= n; i++) {
        if (inBar(i)) {
            var r = (p[i].x - p[i - 1].x) / (p[i].t - p[i - 1].t);
            rate[p[i].bar] = Math.min(r, rate[p[i].bar] === undefined ? r : rate[p[i].bar]);
        }
    }
    var share = (p[n].x - p[0].x) / (p[n].t - p[0].t);
    for (i = 1; i <= n; i++) {
        var gap = p[i].x - p[i - 1].x, ticks = p[i].t - p[i - 1].t;
        if (inBar(i) && gap > rate[p[i].bar] * ticks + DENSE_SLACK && gap > share * ticks + DENSE_SLACK) {
            return true;
        }
    }
    return false;
}

// True when a barline (or anything else that sits between two notes) has been pushed out of
// its place: onto the note before it or past the downbeat after it. Reads the live layout.
function barlineMisplaced(g) {
    var p = g.pts;
    for (var i = 1; i < p.length; i++) {
        var c = p[i].carrier;
        if (!c || c.is(p[i].seg)) {
            continue;
        }
        var x = c.pagePos.x;
        if (x < p[i - 1].seg.pagePos.x + BARLINE_CLEARANCE - 0.01 || x > p[i].seg.pagePos.x) {
            return true;
        }
    }
    return false;
}

// Makes room in the given systems by raising the stretch of their bars.
// Stretch scales all springs alike, so it cannot make a fixed set of bars linear by itself:
// what it does is grow the bars until MuseScore moves the system's last bar to the next line.
// That last bar is therefore set back to stretch 1, so it arrives on its new system unstretched.
// Returns false when nothing could be raised any further.
function widen(groups) {
    var changed = false;
    function set(m, v) {
        if (m.userStretch !== v) {
            m.userStretch = v;
            changed = true;
        }
    }
    groups.forEach(function (g) {
        var ms = g.measures;
        var evict = g.endsSystem && ms.length > 1;
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
// in `skip` (a predicate). Returns the groups, each with .error set (Infinity for skipped ones).
function attempt(score, eng, t0, t1, f0, f1, skip) {
    var groups;
    for (var pass = 0; pass < PASSES; pass++) {
        score.doLayout(f0, f1);
        groups = collect(score, eng, t0, t1);
        var todo = groups.filter(function (g) { return !skip(g, pass); });
        if (maxError(todo) < TOLERANCE || pass === PASSES - 1) {
            break;
        }
        todo.forEach(correct);
    }
    groups.forEach(function (g) {
        g.error = skip(g, -1) ? Infinity : groupError(g);
        if (g.error >= TOLERANCE && g.error < Infinity) {
            g.error = sweep(score, g, f0, f1);
        }
        if (barlineMisplaced(g)) {
            g.error = Infinity;
        }
    });
    return groups;
}

// Makes spacing linear in [t0, t1).
// squeeze false: bars of a too dense system move to the next line.
// squeeze true: every bar stays on its system, notes may end up closer than MuseScore allows.
// Returns { error, failed }: the worst remaining error in spatium among the systems that worked,
// and the systems that could not be made linear and were left alone, as [{ firstBar, lastBar }].
// Runs as a single undoable command.
// ponytail: every pass lays out the whole score, because MuseScore's partial layout can break
// systems differently from the full layout. Fine for selections, slow for whole long scores.
function linearize(score, eng, t0, t1, squeeze) {
    var last = score.lastMeasure;
    var f0 = frac(eng, 0), f1 = frac(eng, last.tick.ticks + last.ticks.ticks);
    var groups = collect(score, eng, t0, t1), failed = [], err = 0, dense = {};
    var tolerance = squeeze ? SQUEEZE_TOLERANCE : TOLERANCE;
    score.startCmd("Linear spacing");
    if (Number(score.style.value("measureSpacing")) !== 2) {
        // The style is score-wide and would reflow every system. Lock them all first, so that
        // only the selection changes.
        for (var m = score.firstMeasure; m; m = m.nextMeasure) {
            if (!m.parent.isLocked) {
                m.parent.isLocked = true;
            }
        }
        score.style.setValue("measureSpacing", 2);
    }
    groups.forEach(function (g) {
        g.measures[0].parent.isLocked = squeeze;
    });
    eachMeasure(score, t0, t1, function (m) {
        if (m.userStretch !== 1) {
            m.userStretch = 1;
        }
    });
    for (var round = 0; round < (squeeze ? 1 : MAX_ROUNDS); round++) {
        clearLeading(score, t0, t1);
        // when bars may move, systems that are too dense are not corrected but widened
        groups = attempt(score, eng, t0, t1, f0, f1, function (g, pass) {
            if (pass === 0) {
                dense[g.firstBar] = !squeeze && tooDense(g);
            }
            return dense[g.firstBar];
        });
        var bad = groups.filter(function (g) { return g.error >= tolerance; });
        if (squeeze || !bad.length || !widen(bad)) {
            break;
        }
    }
    groups.forEach(function (g) {
        if (g.error < tolerance) {
            err = Math.max(err, g.error);
        } else {
            // drop any half-finished corrections so the system looks normal again
            var ms = g.measures, lastM = ms[ms.length - 1];
            clearLeading(score, ms[0].tick.ticks, lastM.tick.ticks + lastM.ticks.ticks);
            failed.push({ firstBar: g.firstBar, lastBar: g.lastBar });
        }
    });
    score.endCmd();
    return { error: err, failed: failed };
}

// Undoes the per-bar changes in [t0, t1): leading space, measure stretch and system locks.
// The score-wide spacing ratio style is left alone.
function reset(score, eng, t0, t1) {
    score.startCmd("Reset linear spacing");
    clearLeading(score, t0, t1);
    eachMeasure(score, t0, t1, function (m) {
        if (m.userStretch !== 1) {
            m.userStretch = 1;
        }
        m.parent.isLocked = false;
    });
    score.endCmd();
}

// Playback time of a tick in seconds (repeats not unrolled).
function seconds(cursor, tick, scoreEnd) {
    cursor.rewindToTick(Math.min(tick, scoreEnd.lastTick));
    var s = cursor.time() / 1000;
    if (tick > scoreEnd.lastTick) {
        // past the last note: extend at the final tempo (cursor.tempo is quarter notes per second)
        s += (tick - scoreEnd.lastTick) / 480 / cursor.tempo;
    }
    return s;
}

// One row per selected system, for the dialog:
// { firstBar, lastBar, start, end, duration (seconds), x0, x1 (spatium from page left), error (spatium) }
function describe(score, eng, t0, t1) {
    var cursor = score.newCursor();
    var scoreEnd = { lastTick: score.lastSegment.tick };
    for (var s = score.lastSegment; s && s.segmentType !== eng.Segment.ChordRest; s = s.prev) {
        scoreEnd.lastTick = s.prev ? s.prev.tick : 0;
    }
    var rows = [], groups = collect(score, eng, t0, t1);
    for (var i = 0; i < groups.length; i++) {
        var p = groups[i].pts;
        if (p.length < 2) {
            continue;
        }
        var a = p[0], b = p[p.length - 1];
        var start = seconds(cursor, a.t, scoreEnd), end = seconds(cursor, b.t, scoreEnd);
        rows.push({
            firstBar: groups[i].firstBar, lastBar: groups[i].lastBar,
            start: start, end: end, duration: end - start,
            x0: a.x, x1: b.x, error: groupError(groups[i])
        });
    }
    return rows;
}
