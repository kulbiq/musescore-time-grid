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

function systemsOf(score, eng, t1) {
    return collect(score, eng, 0, t1).map(function (g) { return g.firstBar + "-" + g.lastBar; }).join(" ");
}

function selftest() {
    var eng = api.engraving, score = eng.curScore;
    var last = score.lastMeasure, t1 = last.tick.ticks + last.ticks.ticks;
    var denseFrom = barTick(score, DENSE_BAR);
    var before = maxError(collect(score, eng, 0, denseFrom));

    // bars 2-3 only: one system closed by its final barline, one by the next note
    var part = linearize(score, eng, WHOLE_TICKS, 3 * WHOLE_TICKS, true);

    // squeeze: no bar may change system, bars 1-14 must be linear
    var systems = systemsOf(score, eng, t1);
    var sq = linearize(score, eng, 0, t1, true);
    var sqError = maxError(collect(score, eng, 0, denseFrom));
    var sqSystems = systemsOf(score, eng, t1);

    // move bars: everything must be linear, and the dense system must have lost bars
    var mv = linearize(score, eng, 0, t1, false);
    var mvError = maxError(collect(score, eng, 0, t1));
    var mvSystems = systemsOf(score, eng, t1);

    api.log.info("equal_spacing selftest: before=" + before.toFixed(3) + "sp partial=" + JSON.stringify(part)
                 + " squeeze=" + JSON.stringify(sq) + " err=" + sqError.toFixed(4) + " systems=" + systems + " -> " + sqSystems
                 + " move=" + JSON.stringify(mv) + " err=" + mvError.toFixed(4) + " systems=" + mvSystems);
    var ok = before > 1 && part.failed.length === 0 && part.error < TOLERANCE
        && sqError < SQUEEZE_TOLERANCE && sqSystems === systems
        && mv.failed.length === 0 && mvError < TOLERANCE && mvSystems !== systems;
    if (!ok) {
        throw new Error("equal_spacing selftest FAILED");
    }
}

// Second half of the headless check: run on the score saved by selftest,
// to prove the spacing survives a save and reload.
function verify() {
    var eng = api.engraving, score = eng.curScore;
    var last = score.lastMeasure;
    var err = maxError(collect(score, eng, 0, last.tick.ticks + last.ticks.ticks));
    api.log.info("equal_spacing verify: reloaded error=" + err.toFixed(4) + "sp");
    if (!(err < TOLERANCE)) {
        throw new Error("equal_spacing verify FAILED");
    }
}

// Headless helper: makes the whole score linear and logs the outcome.
//   mscore -j job.json --extension "musescore://extensions/equal_spacing?action=all"
function all() {
    var eng = api.engraving, score = eng.curScore;
    var last = score.lastMeasure, t1 = last.tick.ticks + last.ticks.ticks;
    var res = linearize(score, eng, 0, t1, false);
    api.log.info("equal_spacing all: systems=" + systemsOf(score, eng, t1) + " result=" + JSON.stringify(res));
}
