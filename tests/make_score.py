"""Writes a MusicXML test score designed to break linear spacing.

Two staves, a key signature, eighths with accidentals next to whole notes,
a time signature change, and enough bars for several systems.
The first eight bars are forced two to a system so they have room to be linear.
The last four bars start with a bar of 16ths that is too dense to be linear.
Usage: python3 make_score.py out.musicxml [repeats]
"""
import sys

DIV = 4  # divisions per quarter


def note(step, octave, dur, typ, staff, alter=None, dot=False, chord=False):
    acc = {1: "sharp", -1: "flat", 0: "natural"}
    return (
        "<note>"
        + ("<chord/>" if chord else "")
        + f"<pitch><step>{step}</step>"
        + (f"<alter>{alter}</alter>" if alter else "")
        + f"<octave>{octave}</octave></pitch><duration>{dur}</duration><voice>{staff}</voice>"
        + f"<type>{typ}</type>"
        + ("<dot/>" if dot else "")
        + (f"<accidental>{acc[alter]}</accidental>" if alter is not None else "")
        + f"<staff>{staff}</staff></note>"
    )


def bar(upper, beats):
    """upper: list of notes for staff 1. Staff 2 gets one long note."""
    total = beats * DIV
    lower_typ = {16: ("whole", False), 12: ("half", True)}[total]
    return (
        "".join(upper)
        + f"<backup><duration>{total}</duration></backup>"
        + note("C", 3, total, lower_typ[0], 2, dot=lower_typ[1])
    )


def run(beats, per_beat):
    """A bar of equal short notes with accidentals: per_beat 2 = eighths, 4 = 16ths."""
    steps = "CDEFGAB"
    dur, typ = {2: (2, "eighth"), 4: (1, "16th")}[per_beat]
    out = []
    for i in range(beats * per_beat):
        alter = (1, -1, 0, None)[i % 4]
        out.append(note(steps[i % 7], 5, dur, typ, 1, alter=alter))
    return out


def mixed():
    return [
        note("E", 5, 4, "quarter", 1),
        note("F", 5, 2, "eighth", 1, alter=0),
        note("G", 5, 2, "eighth", 1),
        note("A", 5, 6, "quarter", 1, dot=True),
        note("B", 5, 2, "eighth", 1, alter=-1),
    ]


def main(path, repeats=1):
    def four_with(per_beat):
        return [run(4, per_beat)] + four[1:]

    four = [
        run(4, 2),
        [note("D", 5, 16, "whole", 1)],
        mixed(),
        [note("E", 5, 8, "half", 1), note("F", 5, 8, "half", 1)],
    ]
    three = [
        [note("D", 5, 12, "half", 1, dot=True)],
        run(3, 2),
        [note("E", 5, 4, "quarter", 1)] * 3,
    ]
    bars = ([(b, 4) for b in four * 2] + [(b, 3) for b in three * 2] + [(b, 4) for b in four_with(4)]) * repeats

    parts = []
    beats_now = None
    for i, (upper, beats) in enumerate(bars, 1):
        attrs = ""
        if i == 1:
            attrs = (
                f"<attributes><divisions>{DIV}</divisions><key><fifths>2</fifths></key>"
                "<time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>"
                "<clef number='1'><sign>G</sign><line>2</line></clef>"
                "<clef number='2'><sign>F</sign><line>4</line></clef></attributes>"
                "<direction><sound tempo='90'/></direction>"
            )
        elif beats != beats_now:
            attrs = f"<attributes><time><beats>{beats}</beats><beat-type>4</beat-type></time></attributes>"
        # two bars per system at the start, and the dense ending on its own systems
        if i in (3, 5, 7, 9, 12, 15):
            attrs = "<print new-system='yes'/>" + attrs
        beats_now = beats
        parts.append(f"<measure number='{i}'>{attrs}{bar(upper, beats)}</measure>")

    xml = (
        "<?xml version='1.0' encoding='UTF-8'?>"
        "<score-partwise version='4.0'><part-list><score-part id='P1'>"
        "<part-name>Piano</part-name></score-part></part-list>"
        f"<part id='P1'>{''.join(parts)}</part></score-partwise>"
    )
    with open(path, "w") as f:
        f.write(xml)


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1)
