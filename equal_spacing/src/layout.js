// Reads the score's layout into plain points (see grid.js). The only file that reads pagePos.
//
// Points are a snapshot: after any doLayout, call snapshot(sys) or collect() again.
//
// Each point also keeps the MuseScore objects needed to change it:
//   seg      the note's segment, or the final barline for a closing point
//   carrier  the segment right after the previous point: its leading space sets the gap
//            between the previous point and this one. The note itself when sameBar.

var WHOLE_TICKS = 1920;   // MuseScore division is 480 ticks per quarter

function scoreEnd(score) {
    var last = score.lastMeasure;
    return last.tick.ticks + last.ticks.ticks;
}

function sysKey(measure) {
    var p = measure.parent.canvasPos;
    return p.x + "," + p.y;
}

// Expands the current score's range selection to whole bars.
// Returns { t0, t1, staff }: ticks, and the top selected staff.
// null when there is no score or no range selection.
function selectedRange(eng) {
    var score = eng.curScore;
    var sel = score && score.selection;
    if (!sel || !sel.isRange || !sel.startSegment) {
        return null;
    }
    var t0 = sel.startSegment.tick;
    var end = scoreEnd(score);
    var t1 = sel.endSegment ? sel.endSegment.tick : end;
    var a = null, b = end;
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
    return a === null ? null : { t0: a, t1: b, staff: sel.startStaff };
}

// Re-reads the positions of a system's points from the live layout.
function snapshot(sys) {
    sys.points.forEach(function (pt) {
        pt.x = pt.seg.pagePos.x;
        pt.carrierX = pt.carrier ? pt.carrier.pagePos.x : undefined;
        pt.leading = Number(pt.seg.leadingSpace);
    });
    return sys;
}

// Walks the bars of the current score overlapping range { t0, t1 } and returns one entry per system:
// { firstBar, lastBar, measures, endsSystem, points }
// points are the note positions in the range plus one closing reference point:
// the next note in the same system, or the system's final barline.
// ponytail: multimeasure rests are walked as their underlying bars, use nextMeasureMM if that matters.
function collect(eng, range) {
    var score = eng.curScore, t0 = range.t0, t1 = range.t1;
    var CR = eng.Segment.ChordRest, BAR = eng.Segment.EndBarLine;
    var systems = [], cur = null, barNo = 0;
    function add(seg, t, bar, isNote) {
        var c = cur.carrier;
        cur.points.push({ t: t, seg: seg, carrier: c, bar: bar, isNote: isNote, sameBar: !!c && c.is(seg) });
        cur.carrier = null;
    }
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
            cur = { key: key, firstBar: barNo, lastBar: barNo, points: [], measures: [], closed: false, carrier: null, barline: null };
            systems.push(cur);
        }
        if (!closing) {
            cur.lastBar = barNo;
            cur.measures.push(m);
        }
        for (var s = m.firstSegment; s; s = s.nextInMeasure) {
            var type = s.segmentType;
            if (cur.points.length && !cur.carrier) {
                cur.carrier = s;
            }
            if (type === BAR) {
                cur.barline = s;
            } else if (type === CR) {
                add(s, s.tick, barNo, true);
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
        if ((!next || sysKey(next) !== key) && cur.barline && cur.points.length) {
            // system ends here: the final barline stands in for the next downbeat
            add(cur.barline, me, undefined, false);
            cur.closed = true;
            cur.endsSystem = true;
        }
    }
    return systems.map(snapshot);
}

function maxError(systems) {
    var worst = 0;
    for (var i = 0; i < systems.length; i++) {
        worst = Math.max(worst, gridError(systems[i].points));
    }
    return worst;
}
