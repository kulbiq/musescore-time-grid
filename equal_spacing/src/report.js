// What the dialog shows about the selection.

function mmPerSpatium(score) {
    return score.firstMeasure.spatium / 1200 * 25.4;   // spatium is in 1/1200 inch
}

function barsLabel(firstBar, lastBar) {
    return firstBar === lastBar ? "" + firstBar : firstBar + "-" + lastBar;
}

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

// One row per system in range { t0, t1 } of the current score:
// { firstBar, lastBar, start, end, duration (seconds), x0Mm, x1Mm (from the left page edge) }
function describe(eng, range) {
    var score = eng.curScore, mm = mmPerSpatium(score);
    var cursor = score.newCursor();
    var lastNoteTick = score.lastSegment.tick;
    for (var s = score.lastSegment; s && s.segmentType !== eng.Segment.ChordRest; s = s.prev) {
        lastNoteTick = s.prev ? s.prev.tick : 0;
    }
    var rows = [], systems = collect(eng, range);
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
            x0Mm: a.x * mm, x1Mm: b.x * mm
        });
    }
    return rows;
}

// The status line after Make linear, from the { error, failed } that linearize returns.
function resultMessage(eng, result) {
    if (result.failed.length) {
        return "Could not make these bars linear, they are unchanged: "
            + result.failed.map(function (f) { return barsLabel(f.firstBar, f.lastBar); }).join(", ") + ".";
    }
    var off = (result.error * mmPerSpatium(eng.curScore)).toFixed(2);
    return "Done. Every note in the selection is within " + off + " mm of a linear time grid.";
}

// The status line after Align image, from the { aligned, firstBar, lastBar } of alignImage.
function alignMessage(result) {
    var bars = "bar" + (result.firstBar === result.lastBar ? " " : "s ") + barsLabel(result.firstBar, result.lastBar);
    if (!result.aligned) {
        return "Could not align the image to " + bars + ": its staff has no notes there.";
    }
    return "Image aligned to " + bars + ": from the first note to the end of their time span, above the staff.";
}

// The status line after Reset all, from the { restored } of resetAll.
function resetAllMessage(result) {
    return result.restored
        ? "Reset the whole score: spacing adjustments removed, spacing ratio and system locks as before."
        : "Removed all spacing adjustments. The spacing ratio and system locks from before were not recorded "
          + "(spaced by an older version of this extension): reset them in Format > Style and "
          + "Format > Add/remove system locks.";
}
