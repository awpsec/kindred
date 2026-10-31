#!/usr/bin/env python3
"""Export the approved identity with Python 3 and librsvg (rsvg-convert).

Run from any directory. Platform wrappers call the same renderer, so regenerating
an icon cannot restore an older logo or switch the macOS icon to dark artwork.
"""
from pathlib import Path
import argparse
import copy
import json
import re
import struct
import subprocess
from geometry import scene, tile

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / 'branding'
SPEC = json.loads((BRAND / 'team-shadows.json').read_text())
CACHE = {}


def svg(body, width=1024, height=1024):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}"><title>Kindred</title>{body}</svg>\n')


def write(path, data):
    path = ROOT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    data = data.encode() if isinstance(data, str) else data
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)


def artwork(dark=False, size=1024, masked=True, spec=SPEC):
    return svg(tile(spec, dark, masked, eyes=size >= 48,
                    small=size == 32 or (dark and size in (48, 64)), tiny=size == 16))


def raster(source, size):
    key = (source, size)
    if key not in CACHE:
        CACHE[key] = subprocess.run(
            ['rsvg-convert', '-w', str(size), '-h', str(size)],
            input=source.encode(), capture_output=True, check=True).stdout
    return CACHE[key]


def adaptive(light, dark):
    # Keep the full SVG definitions: light/dark geometry has distinct IDs.
    style = '<style>.brand-dark{display:none}@media(prefers-color-scheme:dark){.brand-light{display:none}.brand-dark{display:inline}}</style>'
    return svg(style + '<g class="brand-light">' + light + '</g><g class="brand-dark">' + dark + '</g>')


def web():
    for dark in (False, True):
        mode = 'dark' if dark else 'light'
        write(f'branding/icon-{mode}.svg', artwork(dark))
        write(f'branding/icon-{mode}-square.svg', artwork(dark, masked=False))
        write(f'branding/mark-{mode}.svg', svg(scene(SPEC, dark), 100, 100))
    write('ui/brand-icon.svg', adaptive(tile(SPEC, False), tile(SPEC, True)))
    write('ui/brand-icon-light.svg', artwork(False))
    write('ui/brand-icon-dark.svg', artwork(True))
    write('ui/favicon.svg', adaptive(tile(SPEC, False, eyes=False, small=True),
                                     tile(SPEC, True, eyes=False, small=True)))
    write('ui/brand-icon.png', raster(artwork(False, 64), 64))
    write('ui/apple-touch-icon.png', raster(artwork(False, masked=False), 180))
    wordmark = (BRAND / 'wordmark.svg').read_text()
    wordmark = re.sub(r'fill="#[0-9A-Fa-f]{6}"', 'fill="currentColor"', wordmark)
    style = '<style>:root{color:#26282C}@media(prefers-color-scheme:dark){:root{color:#F1EDE6}}</style>'
    wordmark = wordmark.replace('><g', '>' + style + '<g', 1)
    write('ui/brand-wordmark.svg', wordmark)
    # Inline outlines inherit the app's manually chosen theme, independently
    # of the OS preference used by standalone SVG images and browser favicons.
    inline = (BRAND / 'wordmark.svg').read_text().strip()
    inline = re.sub(r'fill="#[0-9A-Fa-f]{6}"', 'fill="currentColor"', inline)
    inline = re.sub(r'width="[^"]+"', 'width="136"', inline, count=1)
    inline = re.sub(r'height="[^"]+"', 'height="34"', inline, count=1)
    inline = inline.replace('<svg ', '<svg data-kindred-wordmark="" ', 1)
    home = ROOT / 'ui/profile-home.html'
    markup, count = re.subn(r'<svg\b[^>]*data-kindred-wordmark\b.*?</svg>',
                            lambda _: inline, home.read_text(), count=1, flags=re.S)
    if count != 1:
        raise ValueError('Missing inline Kindred wordmark slot in profile-home.html')
    write('ui/profile-home.html', markup)


def desktop():
    write('desktop/icons/icon.svg', artwork(False))
    images = {size: raster(artwork(False, size), size) for size in (16, 24, 32, 48, 64, 128, 256, 512)}
    write('desktop/icons/icon.png', images[512])
    sizes = (16, 24, 32, 48, 64, 128, 256)
    header = struct.pack('<HHH', 0, 1, len(sizes))
    offset = 6 + 16 * len(sizes)
    entries = []
    for size in sizes:
        data = images[size]
        entries.append(struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(data), offset))
        offset += len(data)
    write('desktop/icons/icon.ico', header + b''.join(entries) + b''.join(images[size] for size in sizes))


def macos():
    # The owner's explicit choice: the light composition in every macOS theme.
    # Keep the existing opaque, full-square ICNS packaging contract; the system
    # controls the platform presentation. Never derive this from the dark tile.
    source = artwork(False, masked=False)
    write('desktop/icons/macos.svg', source)
    images = {size: raster(artwork(False, size, masked=False), size)
              for size in (16, 32, 64, 128, 256, 512, 1024)}
    write('desktop/icons/macos.png', images[1024])
    kinds = {'icp4':16, 'icp5':32, 'icp6':64, 'ic07':128, 'ic08':256,
             'ic09':512, 'ic10':1024, 'ic11':32, 'ic12':64, 'ic13':256, 'ic14':512}
    records = [kind.encode() + struct.pack('>I', len(images[size]) + 8) + images[size]
               for kind, size in kinds.items()]
    write('desktop/icons/macos.icns', b'icns' + struct.pack('>I', 8 + sum(map(len, records))) + b''.join(records))


def ios():
    assets = 'mobile/ios/KindredCompanion/Assets.xcassets'
    tools = 'mobile/ios/tools'
    tinted = copy.deepcopy(SPEC)
    for mode in ('light', 'dark'):
        tinted[mode].update(bg='#343434', end='#272727', pool='#555555')
        for bot, gray in zip(tinted['bots'], ('#CBCBCB', '#EEEEEE', '#BDBDBD')):
            bot[mode].update(head=gray, shadow='#151515')
    for suffix, dark, spec in (('', False, SPEC), ('-dark', True, SPEC), ('-tinted', True, tinted)):
        source = artwork(dark, masked=False, spec=spec)
        write(f'{tools}/app-icon{suffix}.svg', source)
        data = raster(source, 1024)
        # All artwork covers its square. librsvg emits opaque RGB without an
        # alpha channel; reject accidental transparent App Store source art.
        if data[24:26] != bytes((8, 2)):
            raise ValueError('iOS icon must be 8-bit RGB with no alpha channel')
        write(f'{assets}/AppIcon.appiconset/AppIcon{suffix}-1024.png', data)
    entries = []
    for dark in (False, True):
        suffix = '-dark' if dark else ''
        write(f'{tools}/kindred-mark{suffix}.svg', artwork(dark))
        for scale in (1, 2, 3):
            name = f'KindredMark{suffix}@{scale}x.png'
            write(f'{assets}/KindredMark.imageset/{name}', raster(artwork(dark), 96 * scale))
            entry = {'filename':name, 'idiom':'universal', 'scale':f'{scale}x'}
            if dark:
                entry['appearances'] = [{'appearance':'luminosity', 'value':'dark'}]
            entries.append(entry)
    catalog = {'images':entries, 'info':{'author':'xcode', 'version':1},
               'properties':{'template-rendering-intent':'original'}}
    write(f'{assets}/KindredMark.imageset/Contents.json', json.dumps(catalog, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', choices=['all', 'web', 'desktop', 'macos', 'ios'], default='all')
    args = parser.parse_args()
    for name, action in (('web', web), ('desktop', desktop), ('macos', macos), ('ios', ios)):
        if args.target in ('all', name):
            action()
            print('Generated', name, 'team-shadows assets')
