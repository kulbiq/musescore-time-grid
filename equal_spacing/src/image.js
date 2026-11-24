// Aligns an image the user put on a note (drag and drop, or paste) to the time span of its system.
//
// MuseScore 4.7 gives extensions no way to load a picture file, so the image itself comes in
// through MuseScore's own drag and drop. What this file adds is the exact placement: the image
// spans the system from its first note (the dialog's From) to where its time span ends (To),
// and sits IMAGE_GAP above the staff, or above the highest note if that is higher.
// It also stops taking part in automatic placement: an image on a note otherwise counts as part
// of that note's shape, and MuseScore pushes the following notes out from under it.

var IMAGE_GAP = 1;   // spatium between the image and the staff or notes below it

// Images on the given staff in a system's bars, and how high that staff's content reaches:
// { images, top }, top being the page y of the staff's top line or of the highest chord, whichever
// is higher (null when the staff has no chord in these bars).
function findImages(eng, sys, staff) {
    var IMAGE = eng.Element.IMAGE, CR = eng.Segment.ChordRest;
    var images = [], top = null;
    function take(list) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].type === IMAGE && list[i].staffIdx === staff) {
                images.push(list[i]);
            }
        }
    }
    sys.measures.forEach(function (m) {
        take(m.elements);
        for (var s = m.firstSegment; s; s = s.nextInMeasure) {
            if (s.segmentType !== CR) {
                continue;
            }
            for (var track = staff * 4; track < staff * 4 + 4; track++) {
                var cr = s.elementAt(track);
                if (!cr) {
                    continue;
                }
                take(cr.elements);
                if (cr.notes) {
                    // a chord sits on its staff's top line, its box covers noteheads, stem and beam
                    var y = Math.min(cr.pagePos.y, cr.pagePos.y + cr.bbox.y);
                    top = top === null ? y : Math.min(top, y);
                    for (var n = 0; n < cr.notes.length; n++) {
                        take(cr.notes[n].elements);
                    }
                }
            }
        }
    });
    return { images: images, top: top };
}

// Sizes and places every image on range.staff in the one system of range { t0, t1, staff }.
// Returns { aligned, firstBar, lastBar }; aligned is the number of images placed.
// ponytail: assumes the staff has the score's staff size, a small staff would need its own spatium.
function alignImages(eng, range) {
    var score = eng.curScore, staff = range.staff || 0;
    var systems = collect(eng, range);
    if (systems.length !== 1 || systems[0].points.length < 2) {
        return { aligned: 0 };
    }
    var sys = systems[0], p = sys.points;
    var x0 = p[0].x, width = p[p.length - 1].x - x0;
    var found = findImages(eng, sys, staff);
    var result = { aligned: 0, firstBar: sys.firstBar, lastBar: sys.lastBar };
    if (!found.images.length || found.top === null) {
        return result;
    }
    score.startCmd("Align image");
    found.images.forEach(function (img) {
        // where the image's parent is: page position without the offset
        var px = img.pagePos.x - img.offsetX, py = img.pagePos.y - img.offsetY;
        if (!img.sizeIsSpatium) {
            img.sizeIsSpatium = true;
        }
        img.autoplace = false;
        img.lockAspectRatio = true;
        img.imageWidth = width;
        img.offsetX = x0 - px;
        img.offsetY = found.top - IMAGE_GAP - img.imageHeight - py;
    });
    score.endCmd();
    result.aligned = found.images.length;
    return result;
}
