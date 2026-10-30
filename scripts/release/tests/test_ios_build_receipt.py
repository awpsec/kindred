import importlib.util
import plistlib
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('build_receipt', Path(__file__).resolve().parents[1] / 'record-ios-build.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class BuildReceiptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.app = Path(self.temp.name) / 'Kindred.app'
        self.source = 'a' * 40
        for bundle, identifier in ((self.app, 'dev.kindred.companion'), (self.app / 'PlugIns/KindredVoiceActivity.appex', 'dev.kindred.companion.voice')):
            bundle.mkdir(parents=True)
            info = dict(CFBundleIdentifier=identifier, CFBundleShortVersionString='0.88.0', CFBundleVersion='1', CFBundleExecutable='Binary', DTPlatformName='iphonesimulator', DTSDKName='iphonesimulator27.1', KindredSourceRevision=self.source, NSSupportsLiveActivities=True, NSExtension={'NSExtensionPointIdentifier': 'com.apple.widgetkit-extension'})
            (bundle / 'Info.plist').write_bytes(plistlib.dumps(info))
            (bundle / 'Binary').write_bytes(b'\xcf\xfa\xed\xfe' + bytes(5000))
            (bundle / 'BotToolbarArtwork.json').write_text('{}')

    def test_records_two_native_products_without_device_claim(self):
        result = m.receipt(self.app, self.source, '0.88.0')
        self.assertEqual(len(result['products']), 2)
        self.assertTrue(result['compiled_app_and_voice_extension'])
        self.assertFalse(result['physical_device_proof'])
        self.assertFalse(result['live_audio_proof'])

    def test_stale_source_and_version_are_rejected(self):
        for source, version in [('b' * 40, '0.88.0'), (self.source, '0.87.10')]:
            with self.assertRaises(AssertionError):
                m.receipt(self.app, source, version)

    def test_missing_extension_binary_is_rejected(self):
        (self.app / 'PlugIns/KindredVoiceActivity.appex/Binary').unlink()
        with self.assertRaises(FileNotFoundError):
            m.receipt(self.app, self.source, '0.88.0')

    def test_nonbinary_extension_is_rejected(self):
        (self.app / 'PlugIns/KindredVoiceActivity.appex/Binary').write_text('not a compiled extension')
        with self.assertRaises(AssertionError):
            m.receipt(self.app, self.source, '0.88.0')
