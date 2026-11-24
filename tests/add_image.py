"""Attaches a generated PNG to the score's first note, as if the user dropped an image file on it.

The image gets a deliberately wrong size and offset, so aligning it has work to do.
Usage: python3 add_image.py in.mscz out.mscz
"""
import hashlib
import struct
import sys
import zipfile
import zlib


def png(width, height):
    """A plain RGB gradient, no dependencies."""
    rows = b"".join(b"\0" + b"".join(bytes((x * 255 // width, 80, 160)) for x in range(width)) for _ in range(height))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def main(src, dst):
    data = png(400, 50)
    name = hashlib.new("md4", data).hexdigest() + ".png"   # MuseScore's image store finds pictures by MD4
    image = (
        f"<Image><offset x='3' y='-2'/><path>{name}</path><size w='12' h='1.5'/>"
        "<lockAspectRatio>1</lockAspectRatio><sizeIsSpatium>1</sizeIsSpatium></Image>"
    )
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            content = zin.read(item.filename)
            if item.filename.endswith(".mscx"):
                content = content.decode().replace("<Note>", "<Note>" + image, 1).encode()
            zout.writestr(item, content)
        zout.writestr("Pictures/" + name, data)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
