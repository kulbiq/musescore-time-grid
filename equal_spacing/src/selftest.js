// Headless check, run as a macros action on the score from tests/make_score.py:
//   mscore -j job.json --extension "musescore://extensions/equal_spacing?action=selftest"
// The score's last system starts with a bar of 16ths that is too dense to be linear,
// see four_with(4) in make_score.py.
var DENSE_BAR = 15;

function barTick(score, bar) {
    var m = score.firstMeasure;
    for (var i = 1; i < bar; i++) {
        m = m.nextMeasure;
    }
    return m.tick.ticks;
}

function wholeScore(score) {
    return { t0: 0, t1: scoreEnd(score) };
}

function systemsOf(eng) {
    return collect(eng, wholeScore(eng.curScore)).map(function (sys) {
        return sys.firstBar + "-" + sys.lastBar;
    }).join(" ");
}

function selftest() {
    var eng = api.engraving, score = eng.curScore, whole = wholeScore(score);
    var beforeDense = { t0: 0, t1: barTick(score, DENSE_BAR) };
    var before = maxError(collect(eng, beforeDense));

    // bars 2-3 only: one system closed by its final barline, one by the next note
    var part = linearize(eng, { t0: WHOLE_TICKS, t1: 3 * WHOLE_TICKS }, { keepBars: true });

    // keep bars: no bar may change system, the bars before the dense one must be linear
    var systems = systemsOf(eng);
    var kept = linearize(eng, whole, { keepBars: true });
    var keptError = maxError(collect(eng, beforeDense));
    var keptSystems = systemsOf(eng);

    // move bars: everything must be linear, and the dense system must have lost bars
    var mv = linearize(eng, whole, { keepBars: false });
    var mvError = maxError(collect(eng, whole));
    var mvSystems = systemsOf(eng);

    api.log.info("equal_spacing selftest: before=" + before.toFixed(3) + "sp partial=" + JSON.stringify(part)
                 + " keepBars=" + JSON.stringify(kept) + " err=" + keptError.toFixed(4) + " systems=" + systems + " -> " + keptSystems
                 + " move=" + JSON.stringify(mv) + " err=" + mvError.toFixed(4) + " systems=" + mvSystems);
    var ok = before > 1 && part.failed.length === 0 && part.error < TOLERANCE
        && keptError < KEEP_BARS_TOLERANCE && keptSystems === systems
        && mv.failed.length === 0 && mvError < TOLERANCE && mvSystems !== systems;

    // what the dialog shows: one row per system, each moving forward in time and space
    var rows = describe(eng, whole);
    api.log.info("equal_spacing dialog: rows=" + rows.length + " first=" + JSON.stringify(rows[0])
                 + " status=" + resultMessage(eng, mv));
    ok = ok && rows.length === mvSystems.split(" ").length && rows.every(function (r) {
        return r.x1Mm > r.x0Mm && r.end > r.start;
    });
    if (!ok) {
        throw new Error("equal_spacing selftest FAILED");
    }
}

// Second half of the headless check: run on the score saved by selftest,
// to prove the spacing survives a save and reload.
function verify() {
    var eng = api.engraving;
    var err = maxError(collect(eng, wholeScore(eng.curScore)));
    api.log.info("equal_spacing verify: reloaded error=" + err.toFixed(4) + "sp");
    if (!(err < TOLERANCE)) {
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
