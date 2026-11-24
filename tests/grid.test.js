// Unit tests for the pure grid math, no MuseScore needed: node --test tests/
// grid.js is a plain script (MuseScore loads it without modules), so it runs in a vm context.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const grid = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../equal_spacing/src/grid.js"), "utf8"), grid);

// Points from [t, x] pairs, all notes in one bar unless overridden.
function points(pairs, extra) {
    return pairs.map(([t, x], i) => Object.assign(
        { t, x, isNote: true, sameBar: i > 0, bar: 1, carrierX: x, leading: 0 }, extra && extra[i]));
}

test("points on a line have no error", () => {
    const p = points([[0, 10], [480, 14], [1440, 22], [1920, 26]]);
    assert.ok(grid.gridError(p) < 1e-12);
    assert.ok(Math.abs(grid.gapError(p, 2)) < 1e-12);
});

test("a shifted point reports its shift", () => {
    const p = points([[0, 10], [480, 14.5], [1920, 26]]);
    assert.ok(Math.abs(grid.gridError(p) - 0.5) < 1e-12);
    assert.ok(Math.abs(grid.gapError(p, 1) + 0.5) < 1e-12);   // narrow the first gap by 0.5
    assert.ok(Math.abs(grid.gapError(p, 2) - 0.5) < 1e-12);
});

test("a gap MuseScore widened beyond its share is too dense", () => {
    // 4 eighths then a half: eighths at 2 sp each, the half at 8 sp is linear
    const ok = points([[0, 0], [240, 2], [480, 4], [720, 6], [960, 8], [1920, 16]]);
    assert.strictEqual(grid.tooDense(ok), false);
    // one 16th gap pushed out to 3 sp by an accidental: wider than its share of the system
    const dense = points([[0, 0], [120, 3], [240, 4], [1920, 18]]);
    assert.strictEqual(grid.tooDense(dense), true);
});

test("splitGap inside a bar uses the note's own leading space", () => {
    const p = points([[0, 0], [480, 4]]);
    assert.deepStrictEqual({ ...grid.splitGap(p, 1, -1) }, { carrier: -1, note: 0 });
    assert.deepStrictEqual({ ...grid.splitGap(p, 1, 0.001) }, { carrier: 0, note: 0 });   // below tolerance
});

test("splitGap narrows across a barline only down to the clearances", () => {
    // previous note at 0, barline at 3, downbeat at 4
    const p = points([[0, 0], [480, 4]], [{}, { sameBar: false, carrierX: 3 }]);
    // barline may move 3 - 1.5 = 1.5, then the downbeat 4 - 3 - 0.4 = 0.6
    const r = grid.splitGap(p, 1, -5);
    assert.ok(Math.abs(r.carrier + 1.5) < 1e-12);
    assert.ok(Math.abs(r.note + 0.6) < 1e-12);
});

test("splitGap widens across a barline by giving the downbeat its room back first", () => {
    const p = points([[0, 0], [480, 4]], [{}, { sameBar: false, carrierX: 3, leading: -0.3 }]);
    const r = grid.splitGap(p, 1, 1);
    assert.ok(Math.abs(r.note - 0.3) < 1e-12);
    assert.ok(Math.abs(r.carrier - 0.7) < 1e-12);
});

test("barlinesFit catches a barline on the note before it or past the downbeat", () => {
    const at = (bx) => points([[0, 0], [480, 4]], [{}, { sameBar: false, carrierX: bx }]);
    assert.strictEqual(grid.barlinesFit(at(3)), true);
    assert.strictEqual(grid.barlinesFit(at(1)), false);
    assert.strictEqual(grid.barlinesFit(at(4.5)), false);
});
