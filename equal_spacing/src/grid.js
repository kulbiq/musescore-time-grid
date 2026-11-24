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
//   leading  the point's own leading space
// The grid of a list of points is the line through its first and last point.

var TOLERANCE = 0.01;     // spatium, about 0.02 mm at default staff size
// Squeezing stops where MuseScore refuses to move a barline any closer to its notes,
// which leaves a few hundredths of a staff space. Accept that instead of failing.
var SQUEEZE_TOLERANCE = 0.1;
var DENSE_SLACK = 0.05;        // spatium
var BARLINE_CLEARANCE = 1.5;   // spatium a barline keeps from the start of the note before it
var NOTE_AFTER_BARLINE = 0.4;  // spatium a downbeat keeps from the barline before it

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

// Splits a change of the gap before point i (spatium, negative = narrower) between the two
// leading spaces that set it. Returns { carrier, note }: what to add to each.
// Inside a bar the carrier is the note itself. Across a barline there are two handles:
// the barline's leading space moves barline and downbeat together, and the downbeat's own
// leading space moves it relative to the barline. To narrow the gap, the barline first moves
// left until it is BARLINE_CLEARANCE from the previous note, then the downbeat closes in on
// the barline down to NOTE_AFTER_BARLINE. Whatever is left over cannot be had.
function splitGap(p, i, change) {
    if (Math.abs(change) <= TOLERANCE / 4) {
        return { carrier: 0, note: 0 };
    }
    if (p[i].sameBar || !p[i].isNote) {  // same bar, or the closing point is the final barline
        return { carrier: change, note: 0 };
    }
    if (change > 0) {
        // widen: first give the downbeat its normal distance back, then move the barline
        var back = Math.min(change, Math.max(0, -p[i].leading));
        return { carrier: change - back, note: back };
    }
    var cx = p[i].carrierX;
    var viaBarline = Math.max(change, -Math.max(0, cx - (p[i - 1].x + BARLINE_CLEARANCE)));
    var viaNote = Math.max(change - viaBarline, -Math.max(0, p[i].x - cx - NOTE_AFTER_BARLINE));
    return { carrier: viaBarline, note: viaNote };
}

// False when a barline (or anything else that sits between two notes) has been pushed out of
// its place: onto the note before it or past the downbeat after it.
function barlinesFit(p) {
    for (var i = 1; i < p.length; i++) {
        if (p[i].sameBar) {
            continue;
        }
        var x = p[i].carrierX;
        if (x < p[i - 1].x + BARLINE_CLEARANCE - 0.01 || x > p[i].x) {
            return false;
        }
    }
    return true;
}
