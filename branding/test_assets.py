"""Packaging contracts for the exported identity; no native-device claims."""
from pathlib import Path
import json
import struct
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / 'desktop/icons'
ASSETS = ROOT / 'mobile/ios/KindredCompanion/Assets.xcassets'


def png_header(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    return struct.unpack('>IIBB', data[16:26])


class BrandPackagingTests(unittest.TestCase):
    def test_ios_icons_are_opaque_and_appearance_entries_resolve(self):
        catalog = ASSETS / 'AppIcon.appiconset'
        entries = json.loads((catalog / 'Contents.json').read_text())['images']
        self.assertEqual(len(entries), 3)
        self.assertEqual({e.get('appearances', [{}])[0].get('value', 'light') for e in entries},
                         {'light', 'dark', 'tinted'})
        for entry in entries:
            self.assertEqual(png_header((catalog / entry['filename']).read_bytes()), (1024, 1024, 8, 2))

    def test_loading_mark_has_original_color_light_and_dark_at_every_scale(self):
        catalog = ASSETS / 'KindredMark.imageset'
        contents = json.loads((catalog / 'Contents.json').read_text())
        self.assertEqual(contents['properties']['template-rendering-intent'], 'original')
        entries = contents['images']
        self.assertEqual(len(entries), 6)
        for mode in ('light', 'dark'):
            selected = [e for e in entries if e.get('appearances', [{}])[0].get('value', 'light') == mode]
            self.assertEqual({e['scale'] for e in selected}, {'1x', '2x', '3x'})
            for entry in selected:
                size = 96 * int(entry['scale'][0])
                self.assertEqual(png_header((catalog / entry['filename']).read_bytes())[:2], (size, size))

    def test_macos_icns_contains_light_art_and_valid_standard_retina_records(self):
        data = (ICONS / 'macos.icns').read_bytes()
        self.assertEqual(data[:4], b'icns')
        self.assertEqual(struct.unpack('>I', data[4:8])[0], len(data))
        records, offset = {}, 8
        while offset < len(data):
            kind, length = struct.unpack('>4sI', data[offset:offset + 8])
            self.assertGreater(length, 8)
            self.assertLessEqual(offset + length, len(data))
            records[kind] = data[offset + 8:offset + length]
            png_header(records[kind])
            offset += length
        self.assertEqual(offset, len(data))
        self.assertTrue({b'icp4', b'icp5', b'icp6', b'ic07', b'ic08', b'ic09', b'ic10',
                         b'ic11', b'ic12', b'ic13', b'ic14'} <= records.keys())
        light = (ASSETS / 'AppIcon.appiconset/AppIcon-1024.png').read_bytes()
        self.assertEqual(records[b'ic10'], light, 'macOS must use the light composition')
        self.assertEqual((ICONS / 'macos.png').read_bytes(), light)
        self.assertEqual((ICONS / 'macos.svg').read_bytes(),
                         (ROOT / 'mobile/ios/tools/app-icon.svg').read_bytes())

    def test_windows_ico_directory_points_to_complete_png_frames(self):
        data = (ICONS / 'icon.ico').read_bytes()
        reserved, kind, count = struct.unpack('<HHH', data[:6])
        self.assertEqual((reserved, kind, count), (0, 1, 7))
        sizes = []
        for index in range(count):
            w, h, _, _, planes, depth, length, offset = struct.unpack('<BBBBHHII', data[6 + index * 16:22 + index * 16])
            size = w or 256
            self.assertEqual(w, h)
            self.assertEqual((planes, depth), (1, 32))
            self.assertLessEqual(offset + length, len(data))
            self.assertEqual(png_header(data[offset:offset + length])[:2], (size, size))
            sizes.append(size)
        self.assertEqual(sizes, [16, 24, 32, 48, 64, 128, 256])

    def test_web_exports_are_valid_and_have_both_appearances(self):
        for name in ('brand-icon.svg', 'brand-wordmark.svg', 'favicon.svg'):
            content = (ROOT / 'ui' / name).read_text()
            ET.fromstring(content)
            self.assertIn('prefers-color-scheme:dark', content)
        self.assertEqual(png_header((ROOT / 'ui/brand-icon.png').read_bytes())[:2], (64, 64))
        self.assertEqual(png_header((ROOT / 'ui/apple-touch-icon.png').read_bytes()), (180, 180, 8, 2))


if __name__ == '__main__':
    unittest.main()
