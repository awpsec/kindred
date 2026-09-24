import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('reuse', Path(__file__).with_name('reuse-unaffected-native.py'))
reuse = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reuse)

class NativeReuse(unittest.TestCase):
    def check(self, files, before=b'', after=b''):
        with patch.object(reuse.subprocess, 'run'), patch.object(reuse.subprocess, 'check_output', side_effect=[files, before, after]):
            return reuse.source_check('a' * 40, 'b' * 40)

    def test_mac_only_module_can_change(self):
        def module(body):
            return b'common\n#[cfg(target_os = "macos")]\npub mod native {' + body + b'\n}\n\n#[cfg(test)]\nmod tests {tests}'
        self.assertEqual(self.check(b'desktop/src/notch.rs\n', module(b'old'), module(b'new')), ['desktop/src/notch.rs'])

    def test_common_code_change_is_rejected(self):
        original = b'common\n#[cfg(target_os = "macos")]\npub mod native {}\n#[cfg(test)]\nmod tests {}'
        with self.assertRaisesRegex(ValueError, 'Non-macOS'):
            self.check(b'desktop/src/notch.rs\n', original, original.replace(b'common', b'changed'))

    def test_resources_and_other_native_code_require_rebuild(self):
        for name in ['ui/notch.js', 'desktop/standalone.zip', 'desktop/Cargo.toml', 'desktop/src/main.rs']:
            with self.assertRaisesRegex(ValueError, 'prevents package reuse'):
                self.check(name.encode())

    def test_validation_tools_can_change(self):
        self.assertEqual(len(self.check(b'scripts/release/verify-release.py\ntools/frontend/fixtures/desktop.cjs\n')), 2)

if __name__ == '__main__':
    unittest.main()
