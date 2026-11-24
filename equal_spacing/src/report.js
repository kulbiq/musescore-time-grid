// What the dialog shows about the selection.

// Playback time of a tick in seconds (repeats not unrolled).
// lastNoteTick is the tick of the score's last note: past it the cursor cannot go.
function seconds(cursor, tick, lastNoteTick) {
    cursor.rewindToTick(Math.min(tick, lastNoteTick));
    var s = cursor.time() / 1000;
    if (tick > lastNoteTick) {
        // past the last note: extend at the final tempo (cursor.tempo is quarter notes per second)
        s += (tick - lastNoteTick) / 480 / cursor.tempo;
    }
    return s;
}

// One row per selected system, for the dialog:
// { firstBar, lastBar, start, end, duration (seconds), x0, x1 (spatium from page left), error (spatium) }
function describe(score, eng, t0, t1) {
    var cursor = score.newCursor();
    var lastNoteTick = score.lastSegment.tick;
    for (var s = score.lastSegment; s && s.segmentType !== eng.Segment.ChordRest; s = s.prev) {
        lastNoteTick = s.prev ? s.prev.tick : 0;
    }
    var rows = [], systems = collect(score, eng, t0, t1);
    for (var i = 0; i < systems.length; i++) {
        var p = systems[i].points;
        if (p.length < 2) {
            continue;
        }
        var a = p[0], b = p[p.length - 1];
        var start = seconds(cursor, a.t, lastNoteTick), end = seconds(cursor, b.t, lastNoteTick);
        rows.push({
            firstBar: systems[i].firstBar, lastBar: systems[i].lastBar,
            start: start, end: end, duration: end - start,
            x0: a.x, x1: b.x, error: gridError(p)
        });
    }
    return rows;
}
