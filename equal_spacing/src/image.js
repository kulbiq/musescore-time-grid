// Aligns an image to the time span of whole bars, so it lines up with linearly spaced music.
//
// MuseScore 4.7 gives extensions no way to load a picture file, so the image itself comes in
// through MuseScore's own drag and drop. What this file adds is the exact placement: the image
// spans its bars from their first note (the dialog's From) to where their time span ends (To),
// and sits IMAGE_GAP above the staff, or above the highest note if that is higher.
//
// The image is anchored to whatever it was dropped on: a note, a rest, a time signature, a bar.
// The bar of that anchor is where the image starts.

var IMAGE_GAP = 1;   // spatium between the image and the staff or notes below it

function anchorMeasure(eng, item) {
    for (var e = item.parent; e; e = e.parent) {
        if (e.type === eng.Element.MEASURE) {
            return e;
        }
    }
    return null;
}

// The image selected in the score, when exactly one image is selected:
// { image, bar, firstBar, lastBar }: its anchor bar, and the first and last bar of that bar's system.
// null otherwise.
function selectedImage(eng) {
    var score = eng.curScore, sel = score && score.selection;
    if (!sel || sel.isRange || sel.elements.length !== 1 || sel.elements[0].type !== eng.Element.IMAGE) {
        return null;
    }
    var img = sel.elements[0], m = anchorMeasure(eng, img);
    if (!m) {
        return null;
    }
    var sys = systemBars(score, m);
    return { image: img, bar: barNumber(score, m), firstBar: sys.firstBar, lastBar: sys.lastBar };
}

// Page y of the highest point of a staff's content in a system: its top line, or its highest chord
// if that is higher. null when the staff has no chord there.
function staffTop(eng, sys, staff) {
    var CR = eng.Segment.ChordRest, top = null;
    sys.measures.forEach(function (m) {
        for (var s = m.firstSegment; s; s = s.nextInMeasure) {
            if (s.segmentType !== CR) {
                continue;
            }
            for (var track = staff * 4; track < staff * 4 + 4; track++) {
                var cr = s.elementAt(track);
                if (cr && cr.notes) {
                    // a chord sits on its staff's top line, its box covers noteheads, stem and beam
                    var y = Math.min(cr.pagePos.y, cr.pagePos.y + cr.bbox.y);
                    top = top === null ? y : Math.min(top, y);
                }
            }
        }
    });
    return top;
}

// Sizes and places an image over barCount bars starting at its anchor bar, or over its anchor's
// whole system when barCount is 0. The bars are cut off where the system ends.
// Returns { aligned, firstBar, lastBar }: whether it worked, and the bars it spans.
function alignImage(eng, img, barCount) {
    var score = eng.curScore;
    score.startCmd("Align image");
    // Take the image out of automatic placement before measuring anything. While it takes part,
    // it counts as part of its note, pushes the following notes out from under it and can even
    // push bars to the next line.
    img.autoplace = false;
    if (!img.sizeIsSpatium) {
        img.sizeIsSpatium = true;
    }
    img.lockAspectRatio = true;
    layoutAll(eng);

    var m = anchorMeasure(eng, img), bar = barNumber(score, m), line = systemBars(score, m);
    var first = barCount ? bar : line.firstBar;
    var last = barCount ? Math.min(bar + barCount - 1, line.lastBar) : line.lastBar;
    var sys = collect(eng, barsRange(score, first, last))[0];
    var p = sys ? sys.points : [], top = sys ? staffTop(eng, sys, img.staffIdx) : null;
    var result = { aligned: false, firstBar: first, lastBar: last };
    if (p.length >= 2 && top !== null) {
        // where the image's anchor is: its page position without the offset
        var px = img.pagePos.x - img.offsetX, py = img.pagePos.y - img.offsetY;
        img.imageWidth = p[p.length - 1].x - p[0].x;
        img.offsetX = p[0].x - px;
        img.offsetY = top - IMAGE_GAP - img.imageHeight - py;
        result.aligned = true;
    }
    score.endCmd();
    return result;
}

// Takes the images on notes, rests and bars in range { t0, t1 } out of automatic placement.
// While an image takes part, it counts as part of its note and pushes the following notes away,
// which makes linear spacing impossible. Returns how many images changed. Call inside a command.
function releaseImages(eng, range) {
    var IMAGE = eng.Element.IMAGE, CR = eng.Segment.ChordRest, score = eng.curScore, n = 0;
    function release(list) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].type === IMAGE && list[i].autoplace) {
                list[i].autoplace = false;
                n++;
            }
        }
    }
    eachMeasure(score, range, function (m) {
        release(m.elements);
        for (var s = m.firstSegment; s; s = s.nextInMeasure) {
            if (s.segmentType !== CR) {
                continue;
            }
            for (var track = 0; track < score.ntracks; track++) {
                var cr = s.elementAt(track);
                if (cr) {
                    release(cr.elements);
                    for (var k = 0; cr.notes && k < cr.notes.length; k++) {
                        release(cr.notes[k].elements);
                    }
                }
            }
        }
    });
    return n;
}
