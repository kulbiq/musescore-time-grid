// Unit tests for the pure grid math, no MuseScore needed: node --test tests/*.test.js
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
    assert.deepStrictEqual({ ...grid.splitGap(p, 1, -1) }, { carrier: -1, group: 0, note: 0 });
    assert.strictEqual(grid.splitGap(p, 1, 0.001), null);   // below tolerance
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

test("splitGap moves a time signature and its downbeat as a group, the barline follows", () => {
    // previous note at 0, barline at 10, time signature from 10.8 to 11.75, downbeat at 13
    const p = points([[0, 0], [480, 13]],
        [{}, { sameBar: false, hasGroup: true, carrierX: 10, groupX: 10.8, beforeX: 11.75, leftX: 13 }]);
    const r = grid.splitGap(p, 1, -3);
    assert.ok(Math.abs(r.group + 3) < 1e-12);
    assert.ok(Math.abs(r.note) < 1e-12);
    assert.ok(Math.abs(r.carrier + 3) < 1e-12);   // barline stays 0.8 before the group
});

test("splitGap stops the group where the barline reaches the previous note", () => {
    const p = points([[0, 0], [480, 13]],
        [{}, { sameBar: false, hasGroup: true, carrierX: 10, groupX: 10.8, beforeX: 11.75, leftX: 13 }]);
    // group may move until the barline is 1.5 after the note: 10.8 - 0.8 - 1.5 = 8.5,
    // then the downbeat closes in on the signature: 13 - 11.75 - 0.4 = 0.85
    const r = grid.splitGap(p, 1, -20);
    assert.ok(Math.abs(r.group + 8.5) < 1e-12);
    assert.ok(Math.abs(r.note + 0.85) < 1e-12);
    assert.ok(Math.abs(r.carrier + 8.5) < 1e-12);
});

test("splitGap brings a group that ran ahead back to its downbeat", () => {
    // the group moved left without the downbeat: signature 3 to 3.95, downbeat at 13, barline at 2.2
    const p = points([[0, 0], [480, 13]],
        [{}, { sameBar: false, hasGroup: true, carrierX: 2.2, groupX: 3, beforeX: 3.95, leftX: 13 }]);
    const r = grid.splitGap(p, 1, -1);
    assert.ok(Math.abs(r.group - 6.8) < 1e-12);         // to 12 - 1.25 - 0.95 = 9.8
    assert.ok(Math.abs(r.group + r.note + 1) < 1e-12);  // the downbeat moves by the change
    assert.ok(Math.abs(r.carrier - 6.8) < 1e-12);       // barline 0.8 before the group
});

test("barlinesFit catches a downbeat under a time signature", () => {
    const at = (leftX) => points([[0, 0], [480, 13]],
        [{}, { sameBar: false, hasGroup: true, carrierX: 10, groupX: 10.8, beforeX: 12.5, leftX }]);
    assert.strictEqual(grid.barlinesFit(at(13)), true);
    assert.strictEqual(grid.barlinesFit(at(12)), false);
});

test("splitGap with collapse lets barline and downbeat go all the way", () => {
    // previous note at 0, barline at 3, downbeat at 4: without clearances the gap can close fully
    const p = points([[0, 0], [480, 4]], [{}, { sameBar: false, carrierX: 3, beforeX: 3.18, leftX: 3.5 }]);
    const r = grid.splitGap(p, 1, -10, true);
    assert.ok(Math.abs(r.carrier + 2.5) < 1e-12);  // barline up to MuseScore's limit after the previous note
    assert.ok(Math.abs(r.note + 1) < 1e-12);       // downbeat onto the barline
});


test("noteShift moves the downbeat alone, up to the group before it", () => {
    const p = points([[0, 0], [480, 13]],
        [{}, { sameBar: false, hasGroup: true, carrierX: 10, groupX: 10.8, beforeX: 11.75, leftX: 13 }]);
    assert.ok(Math.abs(grid.noteShift(p, 1, -0.3) + 0.3) < 1e-12);
    assert.ok(Math.abs(grid.noteShift(p, 1, -5) + 0.85) < 1e-12);       // 13 - 11.75 - 0.4
    assert.ok(Math.abs(grid.noteShift(p, 1, -5, true) + 3) < 1e-12);    // with collapse: onto the barline
    assert.ok(Math.abs(grid.noteShift(p, 1, 2) - 2) < 1e-12);
});

test("noteAlone: the downbeat takes a change alone between the group and its natural distance", () => {
    // group ends at 11.75, downbeat at 13: it may go from 12.15 to 13
    const p = points([[0, 0], [480, 13]],
        [{}, { sameBar: false, hasGroup: true, carrierX: 10, groupX: 10.8, beforeX: 11.75, leftX: 13 }]);
    assert.strictEqual(grid.noteAlone(p, 1, -0.5), true);
    assert.strictEqual(grid.noteAlone(p, 1, -1), false);    // would run into the group
    assert.strictEqual(grid.noteAlone(p, 1, 0.5), false);   // would leave a hole after the group
});
