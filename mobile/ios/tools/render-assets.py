#!/usr/bin/env python3
"""Render the iOS app icon and in-app mark from the Kindred SVG mark.

Requires `rsvg-convert` (librsvg). The App Store icon must be opaque, so the
rendered RGBA PNG is re-encoded as RGB with only the standard library.

    python3 mobile/ios/tools/render-assets.py
"""
import pathlib
import struct
import subprocess
import tempfile
import zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "KindredCompanion" / "Assets.xcassets"
MARK = ROOT / "tools" / "kindred-mark.svg"
ICON = ROOT / "tools" / "app-icon.svg"


def render(svg: pathlib.Path, size: int, out: pathlib.Path) -> None:
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", str(out), str(svg)], check=True)


def chunks(data: bytes):
    pos = 8
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        yield kind, data[pos + 8:pos + 8 + length]
        pos += 12 + length


def unfilter(raw: bytes, width: int, height: int, bpp: int) -> list:
    stride = width * bpp
    rows, prev, pos = [], bytearray(stride), 0
    for _ in range(height):
        kind, line = raw[pos], bytearray(raw[pos + 1:pos + 1 + stride])
        pos += 1 + stride
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if kind == 1:
                line[i] = (line[i] + a) & 0xFF
            elif kind == 2:
                line[i] = (line[i] + b) & 0xFF
            elif kind == 3:
                line[i] = (line[i] + ((a + b) >> 1)) & 0xFF
            elif kind == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 0xFF
        rows.append(line)
        prev = line
    return rows


def flatten_to_rgb(path: pathlib.Path) -> None:
    data = path.read_bytes()
    header, idat = None, b""
    for kind, body in chunks(data):
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat += body
    width, height, depth, color = header[:4]
    if depth == 8 and color == 2:
        return  # Already opaque RGB.
    assert depth == 8 and color == 6, "expected 8-bit RGB or RGBA from rsvg-convert"
    rows = unfilter(zlib.decompress(idat), width, height, 4)
    out = bytearray()
    for row in rows:
        out.append(0)
        for x in range(width):
            r, g, b, alpha = row[x * 4:x * 4 + 4]
            # Composite over the icon's own dark background color.
            out += bytes(((v * alpha + bg * (255 - alpha)) // 255) for v, bg in zip((r, g, b), (0x21, 0x1B, 0x17)))

    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(out), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> None:
    icon = ASSETS / "AppIcon.appiconset" / "AppIcon-1024.png"
    render(ICON, 1024, icon)
    flatten_to_rgb(icon)
    mark = ASSETS / "KindredMark.imageset"
    for scale in (1, 2, 3):
        render(MARK, 96 * scale, mark / f"KindredMark@{scale}x.png")
    print("Rendered", icon.relative_to(ROOT), "and KindredMark@1-3x")


if __name__ == "__main__":
    main()
