// Reads the score's layout into plain points (see grid.js). The only file that reads pagePos.
//
// Points are a snapshot: after any doLayout, call snapshot(sys) or collect() again.
//
// Each point also keeps the MuseScore objects needed to change it:
//   seg      the note's segment, or the final barline for a closing point
//   carrier  the segment right after the previous point: its leading space sets the gap
//            between the previous point and this one. The note itself when sameBar.
//   group    for a downbeat whose bar starts with a time signature, key signature or clef, or with a
//            start repeat right after an end repeat: that first segment of the bar. Its leading space
//            moves the group and, up to MuseScore's minimum distances, the downbeat with it, while the
//            barline's own leading space would mostly just move the barline.
//   before   for a downbeat, the segment right before it: the barline, or a time signature,
//            key signature or clef after the barline. Its right edge is the point's beforeX,
//            the downbeat's own left edge, accidentals included, its leftX.

var WHOLE_TICKS = 1920;   // MuseScore division is 480 ticks per quarter

function scoreEnd(score) {
    var last = score.lastMeasure;
    return last.tick.ticks + last.ticks.ticks;
}

// Lays out the whole score. Partial layout can break systems differently from the full one.
function layoutAll(eng) {
    var score = eng.curScore;
    score.doLayout(eng.fraction(0, WHOLE_TICKS), eng.fraction(scoreEnd(score), WHOLE_TICKS));
}

// Bar numbers count measures from 1, as the dialog shows them.
function barNumber(score, measure) {
    var n = 1;
    for (var m = score.firstMeasure; m && !m.is(measure); m = m.nextMeasure) {
        n++;
    }
    return n;
}

// The range { t0, t1 } of bars firstBar to lastBar.
function barsRange(score, firstBar, lastBar) {
    var range = {}, n = 0;
    for (var m = score.firstMeasure; m; m = m.nextMeasure) {
        n++;
        if (n === firstBar) {
            range.t0 = m.tick.ticks;
        }
        if (n === lastBar) {
            range.t1 = m.tick.ticks + m.ticks.ticks;
            break;
        }
    }
    return range;
}

// The first and last bar of the system a measure is in: { firstBar, lastBar }.
function systemBars(score, measure) {
    var key = sysKey(measure), first = null, last = null, n = 0;
    for (var m = score.firstMeasure; m; m = m.nextMeasure) {
        n++;
        if (sysKey(m) === key) {
            first = first === null ? n : first;
            last = n;
        } else if (first !== null) {
            break;
        }
    }
    return { firstBar: first, lastBar: last };
}

function sysKey(measure) {
    var p = measure.parent.canvasPos;
    return p.x + "," + p.y;
}

// Expands the current score's range selection to whole bars.
// Returns { t0, t1 } in ticks, or null when there is no score or no range selection.
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
    return a === null ? null : { t0: a, t1: b };
}

// Page x of the left or right edge of what a segment shows on any staff, accidentals included.
function edge(seg, ntracks, right) {
    var x = seg.pagePos.x;
    for (var track = 0; track < ntracks; track++) {
        var e = seg.elementAt(track);
        if (e) {
            var b = e.bbox, ex = e.pagePos.x + b.x + (right ? b.width : 0);
            x = right ? Math.max(x, ex) : Math.min(x, ex);
        }
    }
    return x;
}

// Re-reads the positions of a system's points from the live layout.
function snapshot(sys) {
    sys.points.forEach(function (pt) {
        pt.x = pt.seg.pagePos.x;
        pt.carrierX = pt.carrier ? pt.carrier.pagePos.x : undefined;
        pt.beforeX = pt.before ? edge(pt.before, sys.ntracks, true) : undefined;
        pt.leftX = pt.before ? edge(pt.seg, sys.ntracks, false) : undefined;
        pt.groupX = pt.group ? edge(pt.group, sys.ntracks, false) : undefined;
        pt.hasGroup = !!pt.group;
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
    var CR = eng.Segment.ChordRest, BAR = eng.Segment.EndBarLine, REPEAT = eng.Segment.StartRepeatBarLine;
    var systems = [], cur = null, barNo = 0, prev = null;
    function add(measure, seg, t, bar, isNote) {
        var c = cur.carrier, sameBar = !!c && c.is(seg);
        var before = isNote && !sameBar && prev && prev.segmentType !== CR ? prev : null;
        // A start repeat after a plain barline stands where that barline is and moves with it, so it is
        // no group. After an end repeat, the end repeat moves alone, and the start repeat is a group.
        var first = measure.firstSegment, repeat = first.segmentType === REPEAT;
        var group = before && !first.is(seg) && first.tick === seg.tick
            && (!repeat || (measure.prevMeasure && measure.prevMeasure.repeatEnd)) ? first : null;
        cur.points.push({ t: t, seg: seg, carrier: c, before: before, group: group, bar: bar, isNote: isNote,
                          sameBar: sameBar,
                          groupGap: repeat ? END_REPEAT_BEFORE_START_REPEAT : BARLINE_BEFORE_GROUP });
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
            cur = { key: key, firstBar: barNo, lastBar: barNo, points: [], measures: [], closed: false, carrier: null,
                    barline: null, ntracks: score.ntracks };
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
                add(m, s, s.tick, barNo, true);
                if (closing) {
                    break;
                }
            }
            prev = s;
        }
        if (closing) {
            cur.closed = true;
            break;
        }
        var next = m.nextMeasure;
        if ((!next || sysKey(next) !== key) && cur.barline && cur.points.length) {
            // system ends here: the final barline stands in for the next downbeat
            add(m, cur.barline, me, undefined, false);
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
