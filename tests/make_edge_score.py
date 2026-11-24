"""Writes a MusicXML score of the things that sit between notes in the middle of a system.

One case per system, two staves:
  bars 1-4    time signature changes: 4/4, 4/4, 3/4, 2/4
  bars 5-8    clef changes: at the start of bar 6, and in the middle of bar 7
  bars 9-12   repeats: start repeat on bar 10, end repeat on bar 11, both on bar 12
  bars 13-16  accidentals: chords of four, 16ths with double sharps and flats, a key change to 6 sharps
  bars 17-20  all at once on bar 18: clef, key and time signature change and a start repeat
Usage: python3 make_edge_score.py out.musicxml
"""
import sys

from make_score import DIV, note

LOWER = {16: ("whole", False), 12: ("half", True), 8: ("half", False)}


def lower(beats):
    typ, dot = LOWER[beats * DIV]
    return f"<backup><duration>{beats * DIV}</duration></backup>" + note("C", 3, beats * DIV, typ, 2, dot=dot)


def eighths(beats, octave=5):
    return "".join(note("CDEFGAB"[i % 7], octave, 2, "eighth", 1) for i in range(beats * 2))


def quarters(beats, octave=5):
    return "".join(note("EGBD"[i % 4], octave, 4, "quarter", 1) for i in range(beats))


def chords(beats):
    """Eighth chords of four notes, every note with an accidental."""
    out = ""
    for _ in range(beats * 2):
        for k, (step, alter) in enumerate((("C", 1), ("E", -1), ("F", 1), ("A", -1))):
            out += note(step, 5, 2, "eighth", 1, alter=alter, chord=k > 0)
    return out


def doubles(beats):
    """16ths with double sharps and double flats."""
    out = ""
    for i in range(beats * 4):
        out += note("CDEFGAB"[i % 7], 5, 1, "16th", 1, alter=(2, -2)[i % 2])
    return out


def attrs(time=None, key=None, clef=None):
    a = ""
    if key is not None:
        a += f"<key><fifths>{key}</fifths></key>"
    if time:
        a += f"<time><beats>{time}</beats><beat-type>4</beat-type></time>"
    if clef:
        a += "<clef number='1'>" + {"F": "<sign>F</sign><line>4</line>", "G": "<sign>G</sign><line>2</line>"}[clef] + "</clef>"
    return f"<attributes>{a}</attributes>" if a else ""


FORWARD = "<barline location='left'><bar-style>heavy-light</bar-style><repeat direction='forward'/></barline>"
BACKWARD = "<barline location='right'><bar-style>light-heavy</bar-style><repeat direction='backward'/></barline>"


def main(path):
    # (beats, content before the notes, staff 1 notes, content after the notes)
    bars = [
        (4, attrs(4), eighths(4), ""),
        (4, "", quarters(4), ""),
        (3, attrs(3), eighths(3), ""),
        (2, attrs(2), quarters(2), ""),
        (4, attrs(4), quarters(4), ""),
        (4, attrs(clef="F"), quarters(4, 3), ""),
        (4, "", quarters(2, 3) + attrs(clef="G") + quarters(2), ""),
        (4, "", eighths(4), ""),
        (4, "", quarters(4), ""),
        (4, FORWARD, eighths(4), ""),
        (4, "", quarters(4), BACKWARD),
        (4, FORWARD, eighths(4), BACKWARD),
        (4, "", chords(4), ""),
        (4, "", doubles(4), ""),
        (4, attrs(key=6), chords(4), ""),
        (4, "", quarters(4), ""),
        (4, attrs(key=0), eighths(4), ""),
        (3, FORWARD + attrs(3, key=-5, clef="F"), quarters(3, 3), ""),
        (3, "", eighths(3, 3), BACKWARD),
        (3, "", quarters(3, 3), ""),
    ]
    parts = []
    for i, (beats, before, upper, after) in enumerate(bars, 1):
        head = ""
        if i == 1:
            head = (f"<attributes><divisions>{DIV}</divisions><key><fifths>0</fifths></key>"
                    "<time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>"
                    "<clef number='1'><sign>G</sign><line>2</line></clef>"
                    "<clef number='2'><sign>F</sign><line>4</line></clef></attributes>"
                    "<direction><sound tempo='90'/></direction>")
            before = ""
        if i % 4 == 1 and i > 1:
            head = "<print new-system='yes'/>"
        parts.append(f"<measure number='{i}'>{head}{before}{upper}{lower(beats)}{after}</measure>")
    xml = ("<?xml version='1.0' encoding='UTF-8'?>"
           "<score-partwise version='4.0'><part-list><score-part id='P1'>"
           "<part-name>Piano</part-name></score-part></part-list>"
           f"<part id='P1'>{''.join(parts)}</part></score-partwise>")
    with open(path, "w") as f:
        f.write(xml)


if __name__ == "__main__":
    main(sys.argv[1])
