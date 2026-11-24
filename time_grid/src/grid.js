// Linear grid math. Pure: works on plain points and never touches MuseScore objects,
// so tests/grid.test.js runs it in node.
//
// A point is one note position of a system (or the system's closing reference point):
//   t        tick
//   x        page position in spatium
//   isNote   false for a closing point that is a final barline
//   sameBar  true when nothing (barline, key or time signature) sits between the point
//            and the one before it, so a single leading space sets the gap
//   bar      bar number, used to compare gaps within one bar
//   carrierX page position of the carrier (see layout.js), equal to x when sameBar
//   beforeX  for a downbeat: right edge of what sits right before it (barline, time signature,
//            key signature, clef), undefined otherwise
//   leftX    for a downbeat: its left edge, accidentals included (x when undefined)
//   hasGroup true when the downbeat's bar starts with a time or key signature or a clef, or with a
//            start repeat after an end repeat: the barline then moves alone, and the group with
//            the downbeat
//   groupX   left edge of that group's first segment
//   groupGap where the barline goes before the group, in spatium (BARLINE_BEFORE_GROUP when undefined)
//   leading  the point's own leading space
// The grid of a list of points is the line through its first and last point.

var TOLERANCE = 0.01;     // spatium, about 0.02 mm at default staff size
var DENSE_SLACK = 0.05;        // spatium
var BARLINE_CLEARANCE = 1.5;   // spatium a barline keeps from the start of the note before it
// With bars kept: MuseScore itself stops a barline about 0.3 spatium after the note before it,
// however negative its leading space. Pushing it into that floor achieves nothing and leaves the
// rest of the change to the downbeat too late, so the barline stops just short of it.
var COLLAPSED_BARLINE_CLEARANCE = 0.5;
var NOTE_AFTER_BARLINE = 0.4;  // spatium a downbeat keeps from the barline before it
// spatium from a barline to the time or key signature or clef after it, about MuseScore's own
var BARLINE_BEFORE_GROUP = 0.8;
// spatium from an end repeat to the start repeat right after it, MuseScore's own ":||:"
var END_REPEAT_BEFORE_START_REPEAT = 1.34;
// spatium from the end of such a group to the left edge of the downbeat after it, about MuseScore's own
var NOTE_AFTER_GROUP = 1.25;

function slope(p) {
    var n = p.length - 1;
    return (p[n].x - p[0].x) / (p[n].t - p[0].t);
}

// Largest deviation from the grid, in spatium.
function gridError(p) {
    var n = p.length - 1;
    if (n < 1) {
        return 0;
    }
    var k = slope(p), worst = 0;
    for (var i = 1; i < n; i++) {
        worst = Math.max(worst, Math.abs(p[0].x + k * (p[i].t - p[0].t) - p[i].x));
    }
    return worst;
}

// How much wider the gap between point i - 1 and point i must get to be on the grid.
function gapError(p, i) {
    return slope(p) * (p[i].t - p[i - 1].t) - (p[i].x - p[i - 1].x);
}

// True when the points cannot be linear without notes running into each other.
// Expects a layout without leading space and with spacing ratio 2: every gap inside a bar then
// has the same width per tick, except where MuseScore had to widen it to avoid a collision.
// If such a gap is already wider than its share of the system, linear spacing would overlap notes.
function tooDense(p) {
    var n = p.length - 1, i, rate = {};
    if (n < 2) {
        return false;
    }
    for (i = 1; i <= n; i++) {
        if (p[i].sameBar) {
            var r = (p[i].x - p[i - 1].x) / (p[i].t - p[i - 1].t);
            rate[p[i].bar] = Math.min(r, rate[p[i].bar] === undefined ? r : rate[p[i].bar]);
        }
    }
    var share = slope(p);
    for (i = 1; i <= n; i++) {
        var gap = p[i].x - p[i - 1].x, ticks = p[i].t - p[i - 1].t;
        if (p[i].sameBar && gap > rate[p[i].bar] * ticks + DENSE_SLACK && gap > share * ticks + DENSE_SLACK) {
            return true;
        }
    }
    return false;
}

// Splits a change of the gap before point i (spatium, negative = narrower) between the leading
// spaces that set it. Returns { carrier, group, note }: what to add to each, or null when the
// change is too small to act on.
//
// Inside a bar the carrier is the note itself. Across a barline there are two handles:
// the barline's leading space moves barline and downbeat together, and the downbeat's own
// leading space moves it relative to the barline. To narrow the gap, the barline first moves
// left until it is BARLINE_CLEARANCE from the previous note, then the downbeat closes in on
// what sits right before it down to NOTE_AFTER_BARLINE. Whatever is left over cannot be had.
//
// When the downbeat's bar starts with a time or key signature, a clef, or a start repeat after an end
// repeat (hasGroup), the barline's leading space only moves the barline. The group's leading space
// moves the group, and the downbeat with it only until MuseScore's minimum distance from the note
// before stops the downbeat: past that, the group would run off and leave a hole before the downbeat.
// So everything is placed from where the downbeat should go: the group NOTE_AFTER_GROUP before it,
// the barline groupGap before the group, and the downbeat's own leading space makes up whatever the
// group did not carry it. Measured on the current layout, so repeated passes settle them.
//
// collapse (keep bars) drops the clearances: the barline may go up to MuseScore's own limit after
// the previous note, and the downbeat right up to the barline, onto any signature after it.
function splitGap(p, i, change, collapse) {
    if (Math.abs(change) <= TOLERANCE / 4) {
        return null;
    }
    if (p[i].sameBar || !p[i].isNote) {  // same bar, or the closing point is the final barline
        return { carrier: change, group: 0, note: 0 };
    }
    var cx = p[i].carrierX, limit = p[i - 1].x + (collapse ? COLLAPSED_BARLINE_CLEARANCE : BARLINE_CLEARANCE);
    var before = collapse || p[i].beforeX === undefined ? cx : p[i].beforeX;
    var left = collapse || p[i].leftX === undefined ? p[i].x : p[i].leftX;
    var noteAfter = collapse ? 0 : NOTE_AFTER_BARLINE;
    // widen: first give the downbeat its normal distance back
    var back = change > 0 ? Math.min(change, Math.max(0, -p[i].leading)) : 0;
    if (p[i].hasGroup) {
        var gap = p[i].groupGap || BARLINE_BEFORE_GROUP, width = p[i].beforeX - p[i].groupX;
        var groupTo = Math.max(p[i].leftX + change - NOTE_AFTER_GROUP - width, limit + gap);
        // how far left the downbeat's left edge may go: onto the barline, or noteAfter after the group
        var lowest = collapse ? groupTo - gap - (p[i].x - p[i].leftX) : groupTo + width + noteAfter;
        var move = Math.max(change, Math.min(0, lowest - p[i].leftX)), groupMove = groupTo - p[i].groupX;
        return { carrier: groupTo - gap - cx, group: groupMove, note: move - groupMove };
    }
    if (change > 0) {
        return { carrier: change - back, group: 0, note: back };
    }
    var viaBarline = Math.max(change, -Math.max(0, cx - limit));
    var viaNote = Math.max(change - viaBarline, -Math.max(0, left - before - noteAfter));
    return { carrier: viaBarline, group: 0, note: viaNote };
}

// How far left the left edge of a downbeat may go with what sits before it where it is:
// NOTE_AFTER_BARLINE after it, or with collapse until the note reaches the barline.
function lowestNote(p, i, collapse) {
    return collapse ? p[i].carrierX - (p[i].x - p[i].leftX) : p[i].beforeX + NOTE_AFTER_BARLINE;
}

// For a downbeat: how far its own leading space should move it to change the gap before it by
// `change`, with what sits before it left where it is. Stops where splitGap would.
function noteShift(p, i, change, collapse) {
    return Math.max(change, Math.min(0, lowestNote(p, i, collapse) - p[i].leftX));
}

// True when a downbeat after a group can take a change of the gap before it by itself: it neither
// runs into the group nor gets further from it than MuseScore would put it.
function noteAlone(p, i, change, collapse) {
    var to = p[i].leftX + change;
    return to >= lowestNote(p, i, collapse) && to <= p[i].beforeX + NOTE_AFTER_GROUP;
}

// False when a barline (or anything else that sits between two notes) has been pushed out of
// its place: onto the note before it or past the downbeat after it, or when the downbeat has
// run into what sits right before it, such as a time signature.
function barlinesFit(p) {
    for (var i = 1; i < p.length; i++) {
        if (p[i].sameBar) {
            continue;
        }
        var x = p[i].carrierX;
        if (x < p[i - 1].x + BARLINE_CLEARANCE - 0.01 || x > p[i].x || p[i].leftX < p[i].beforeX - 0.01
                || x > p[i].groupX - BARLINE_BEFORE_GROUP / 2) {
            return false;
        }
    }
    return true;
}
