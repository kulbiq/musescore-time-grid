// Headless check, run as a macros action on the score from tests/make_score.py:
//   mscore -j job.json --extension "musescore://extensions/equal_spacing?action=selftest"
// The score's last system starts with a bar of 16ths that is too dense to be linear,
// see four_with(4) in make_score.py.
var DENSE_BAR = 15;

function barTick(score, bar) {
    return barsRange(score, bar, bar).t0;
}

function wholeScore(score) {
    return { t0: 0, t1: scoreEnd(score) };
}

function systemsOf(eng) {
    return collect(eng, wholeScore(eng.curScore)).map(function (sys) {
        return sys.firstBar + "-" + sys.lastBar;
    }).join(" ");
}

// The image tests/add_image.py put on the first note of a bar.
function imageOnBar(eng, bar) {
    var score = eng.curScore, t = barTick(score, bar);
    var seg = score.findSegmentAtTick(eng.Segment.ChordRest, eng.fraction(t, WHOLE_TICKS));
    var els = seg.elementAt(0).notes[0].elements;
    for (var i = 0; i < els.length; i++) {
        if (els[i].type === eng.Element.IMAGE) {
            return els[i];
        }
    }
    return null;
}

// How far, in spatium, an image is from where alignImage puts it over the bars in `res`:
// from their first note to the end of their time span, IMAGE_GAP above the staff.
function imageError(eng, img, res) {
    var sys = collect(eng, barsRange(eng.curScore, res.firstBar, res.lastBar))[0], p = sys.points;
    var x = img.pagePos.x, y = img.pagePos.y, b = img.bbox;
    return Math.max(Math.abs(x - p[0].x), Math.abs(x + b.width - p[p.length - 1].x),
                    Math.abs(y + b.height - (staffTop(eng, sys, 0) - IMAGE_GAP)));
}

// Aligns an image and checks it: { res, error } plus a log line.
function checkAlign(eng, label, bar, barCount) {
    var img = imageOnBar(eng, bar), res = alignImage(eng, img, barCount), err = imageError(eng, img, res);
    api.log.info("equal_spacing image " + label + ": " + JSON.stringify(res) + " error=" + err.toFixed(4) + "sp"
                 + " status=" + alignMessage(res));
    return res.aligned && err < TOLERANCE;
}

function selftest() {
    var eng = api.engraving, score = eng.curScore, whole = wholeScore(score);

    // the freshly dropped images push their notes away: aligning must undo that first, and
    // everything after must come out exactly as on a score without them
    var ok = checkAlign(eng, "dropped on bar 1, whole system", 1, 0);
    ok = checkAlign(eng, "dropped on dense bar 15, 2 bars", DENSE_BAR, 2) && ok;
    var beforeDense = { t0: 0, t1: barTick(score, DENSE_BAR) };
    var before = maxError(collect(eng, beforeDense));

    // bars 2-3 only: one system closed by its final barline, one by the next note
    var part = linearize(eng, { t0: WHOLE_TICKS, t1: 3 * WHOLE_TICKS }, { keepBars: true });

    // keep bars: no bar may change system, and every bar must be linear, the dense one too:
    // its notes, barline and signatures may run into each other
    var systems = systemsOf(eng);
    var kept = linearize(eng, whole, { keepBars: true });
    var keptError = maxError(collect(eng, whole));
    var keptSystems = systemsOf(eng);

    // move bars: everything must be linear, and the dense system must have lost bars
    var mv = linearize(eng, whole, { keepBars: false });
    var mvError = maxError(collect(eng, whole));
    var mvSystems = systemsOf(eng);

    api.log.info("equal_spacing selftest: before=" + before.toFixed(3) + "sp partial=" + JSON.stringify(part)
                 + " keepBars=" + JSON.stringify(kept) + " err=" + keptError.toFixed(4) + " systems=" + systems + " -> " + keptSystems
                 + " move=" + JSON.stringify(mv) + " err=" + mvError.toFixed(4) + " systems=" + mvSystems);
    ok = ok && before > 1 && part.failed.length === 0 && part.error < TOLERANCE
        && kept.failed.length === 0 && keptError < KEEP_BARS_TOLERANCE && keptSystems === systems
        && mv.failed.length === 0 && mvError < TOLERANCE && mvSystems !== systems;

    // what the dialog shows: one row per system, each moving forward in time and space
    var rows = describe(eng, whole);
    api.log.info("equal_spacing dialog: rows=" + rows.length + " first=" + JSON.stringify(rows[0])
                 + " status=" + resultMessage(eng, mv));
    ok = ok && rows.length === mvSystems.split(" ").length && rows.every(function (r) {
        return r.x1Mm > r.x0Mm && r.end > r.start;
    });

    // bars moved, so align again, over two bars this time: verify checks it after reloading
    ok = checkAlign(eng, "bar 1 after spacing, 2 bars", 1, 2) && ok;
    if (!ok) {
        throw new Error("equal_spacing selftest FAILED");
    }
}

// Second half of the headless check: run on the score saved by selftest,
// to prove the spacing survives a save and reload.
function verify() {
    var eng = api.engraving;
    var score = eng.curScore, whole = wholeScore(score);
    var err = maxError(collect(eng, whole));
    var imgError = imageError(eng, imageOnBar(eng, 1), { firstBar: 1, lastBar: 2 });
    api.log.info("equal_spacing verify: reloaded error=" + err.toFixed(4) + "sp");
    api.log.info("equal_spacing verify: reloaded image error=" + imgError.toFixed(4) + "sp");

    // Reset all: the score as before the first Make linear (make_score.py's score has no locks)
    var original = JSON.parse(score.metaTag(ORIGINAL_TAG));
    var reset = resetAll(eng), leading = 0, stretched = 0, locked = 0;
    for (var m = score.firstMeasure; m; m = m.nextMeasure) {
        stretched += m.userStretch !== 1 ? 1 : 0;
        locked += m.parent.isLocked ? 1 : 0;
        for (var s = m.firstSegment; s; s = s.nextInMeasure) {
            leading += Number(s.leadingSpace) !== 0 ? 1 : 0;
        }
    }
    var spacing = Number(score.style.value("measureSpacing"));
    api.log.info("equal_spacing verify: reset all " + JSON.stringify(reset) + " spacing=" + spacing
                 + " (was " + original.measureSpacing + ") leading=" + leading + " stretched=" + stretched
                 + " locked=" + locked + " status=" + resetAllMessage(reset));
    var resetOk = reset.restored && spacing === original.measureSpacing && original.locks.length === 0
        && leading === 0 && stretched === 0 && locked === 0 && score.metaTag(ORIGINAL_TAG) === "";

    // an image dropped but not aligned pushes the notes after it, bars 2 and on leave the line:
    // Make linear must take it out of automatic placement first, as Align image does
    var img = imageOnBar(eng, 1);
    score.startCmd("Drop image again");
    img.autoplace = true;   // as dropped: on its note, taking part in automatic placement
    img.offsetX = 0;
    img.offsetY = 0;
    score.endCmd();
    var pushed = systemsOf(eng);
    var dropped = linearize(eng, barsRange(score, 1, 2), { keepBars: false });
    var droppedError = maxError(collect(eng, barsRange(score, 1, 2)));
    api.log.info("equal_spacing verify: dropped image " + JSON.stringify(dropped) + " err=" + droppedError.toFixed(4)
                 + " autoplace=" + img.autoplace + " systems=" + pushed + " -> " + systemsOf(eng));
    var droppedOk = dropped.failed.length === 0 && droppedError < TOLERANCE && !img.autoplace;

    // a time signature change in the middle of a line, between bars 8 and 9: barline, signature and
    // downbeat must move together, and the downbeat must not end up under the signature
    var sigBars = barsRange(score, 8, 9);
    score.startCmd("Bars 8 and 9 on one line");
    score.makeIntoSystem(score.tick2measure(eng.fraction(sigBars.t0, WHOLE_TICKS)),
                         score.tick2measure(eng.fraction(barTick(score, 9), WHOLE_TICKS)));
    score.endCmd();
    var sig = linearize(eng, sigBars, { keepBars: true });
    var sigLine = collect(eng, sigBars), sigError = maxError(sigLine);
    var sigFits = sigLine.length === 1 && barlinesFit(sigLine[0].points);
    api.log.info("equal_spacing verify: time signature mid-line " + JSON.stringify(sig) + " err=" + sigError.toFixed(4)
                 + " fits=" + sigFits + " systems=" + systemsOf(eng));
    droppedOk = droppedOk && sig.failed.length === 0 && sigError < TOLERANCE && sigFits;
    if (!(err < TOLERANCE && imgError < TOLERANCE && resetOk && droppedOk)) {
        throw new Error("equal_spacing verify FAILED");
    }
}

// Headless helper: makes the whole score linear and logs the outcome.
//   mscore -j job.json --extension "musescore://extensions/equal_spacing?action=all"
function all() {
    var eng = api.engraving;
    var res = linearize(eng, wholeScore(eng.curScore), { keepBars: false });
    api.log.info("equal_spacing all: systems=" + systemsOf(eng) + " result=" + JSON.stringify(res));
}
