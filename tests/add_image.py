"""Attaches a generated PNG to the first note of bars 1 and 15, as if the user dropped an image file there.

The images look freshly dropped: full size in millimetres, automatic placement on. That makes
them push the notes after them out of the way, so aligning them has to undo that first.
Bar 15 is the dense bar of 16ths from make_score.py.
Usage: python3 add_image.py in.mscz out.mscz
"""
import hashlib
import re
import struct
import sys
import zipfile
import zlib

BARS = (1, 15)


def png(width, height):
    """A plain RGB gradient, no dependencies."""
    rows = b"".join(
        b"\0" + b"".join(bytes((x * 255 // width, 80, 160)) for x in range(width)) for _ in range(height))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def add_images(mscx, image):
    """Puts image into the first note of each bar in BARS, in the first staff."""
    staff = mscx.index('<Staff id="1">', mscx.index("</Part>"))
    starts = [m.start() for m in re.finditer("<Measure", mscx[staff:])]
    for bar in sorted(BARS, reverse=True):   # from the back, so earlier positions stay valid
        note = mscx.index("<Note>", staff + starts[bar - 1]) + len("<Note>")
        mscx = mscx[:note] + image + mscx[note:]
    return mscx


def main(src, dst):
    data = png(400, 50)
    name = hashlib.new("md4", data).hexdigest() + ".png"   # MuseScore's image store finds pictures by MD4
    image = (f"<Image><path>{name}</path><size w='70' h='8.75'/>"
             "<lockAspectRatio>1</lockAspectRatio><sizeIsSpatium>0</sizeIsSpatium></Image>")
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            content = zin.read(item.filename)
            if item.filename.endswith(".mscx"):
                content = add_images(content.decode(), image).encode()
            zout.writestr(item, content)
        zout.writestr("Pictures/" + name, data)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
