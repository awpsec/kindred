import importlib.util
from pathlib import Path
import unittest
import subprocess
import tempfile
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
        for name in ['ui/notch.js', 'desktop/standalone.zip', 'desktop/Cargo.toml', 'desktop/src/main.rs', 'desktop/icons/icon.png', 'desktop/tauri.conf.json']:
            with self.assertRaisesRegex(ValueError, 'prevents package reuse'):
                self.check(name.encode())

    def test_mac_runtime_icon_reference_is_narrowly_checked(self):
        before = b'{"bundle":{"icon":["icons/macos.icns","icons/macos.png"]}}'
        after = b'{"bundle":{"icon":["icons/macos.icns","icons/macos-runtime.png"]}}'
        self.assertEqual(self.check(b'desktop/tauri.macos.conf.json\n', before, after), ['desktop/tauri.macos.conf.json'])
        with self.assertRaisesRegex(ValueError, 'Unverified macOS'):
            self.check(b'desktop/tauri.macos.conf.json\n', before, after.replace(b'"bundle":', b'"identifier":"changed","bundle":'))

    def test_validation_tools_can_change(self):
        self.assertEqual(len(self.check(b'scripts/release/verify-release.py\ntools/frontend/fixtures/desktop.cjs\n')), 2)


class WindowsNativeReuse(unittest.TestCase):
    @staticmethod
    def network(script='old'):
        return ('fn shared() {}\n#[cfg(unix)]\nfn unix_inventory() {}\n'
                '#[cfg(windows)]\npub fn discover_with_diagnostics(\n'
                '    _root: &std::path::Path,\n'
                ') -> Result<Vec<Interface>, DiscoveryFailure> {\n'
                '    let start = std::time::Instant::now();\n'
                '    let script = "' + script + '";\n'
                '    unchanged_command_and_deadline(script)\n}\n'
                '#[cfg(any(windows, test))]\nfn parse_network_output() {}\n')

    def changes(self, mutations, mode=None):
        # Exercise real Git tree inventory, including additions and file modes.
        with tempfile.TemporaryDirectory(prefix='kindred-native-reuse-') as directory:
            root = Path(directory)
            def git(*args, **kwargs):
                return subprocess.check_output(['git', '-C', str(root), *args], stderr=subprocess.DEVNULL, **kwargs).decode().strip()
            git('init', '-q')
            git('config', 'user.name', 'Native reuse fixture')
            git('config', 'user.email', 'fixture@example.invalid')
            network = root / 'desktop/src/network_interfaces.rs'
            network.parent.mkdir(parents=True)
            network.write_text(self.network())
            git('add', '.')
            git('commit', '-qm', 'original')
            original = git('rev-parse', 'HEAD')
            for name, content in mutations.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)
            git('add', '.')
            if mode:
                blob = git('rev-parse', ':desktop/src/network_interfaces.rs')
                git('update-index', '--cacheinfo', mode, blob, 'desktop/src/network_interfaces.rs')
            git('commit', '-qm', 'candidate')
            candidate = git('rev-parse', 'HEAD')
            with patch.object(reuse, 'ROOT', root):
                return reuse.source_check(original, candidate, 'windows')

    def test_actual_git_windows_script_and_exact_helpers_can_change(self):
        changes = {'desktop/src/network_interfaces.rs': self.network('new')}
        changes.update({name: '# fixture-only helper\n' for name in reuse.WINDOWS_HELPERS})
        self.assertEqual(set(self.changes(changes)), set(changes))

    def test_unix_shared_parser_and_deadline_changes_are_rejected(self):
        good = self.network('new')
        for old, new in [('fn shared()', 'fn changed_shared()'),
                         ('fn unix_inventory()', 'fn changed_unix_inventory()'),
                         ('fn parse_network_output()', 'fn changed_parser()'),
                         ('unchanged_command_and_deadline', 'unbounded_command')]:
            with self.subTest(change=old), self.assertRaisesRegex(ValueError, 'Non-Windows-script'):
                self.changes({'desktop/src/network_interfaces.rs': good.replace(old, new)})

    def test_cfg_widening_and_code_outside_string_are_rejected(self):
        for content in [self.network('new').replace('#[cfg(windows)]', '#[cfg(any(windows, unix))]'),
                        self.network('new"; injected_shared_code(); let extra = "bad'),
                        self.network(r'bad\q')]:
            with self.subTest(content=content), self.assertRaises(ValueError):
                self.changes({'desktop/src/network_interfaces.rs': content})

    def test_resources_version_dependencies_and_unlisted_helpers_require_rebuild(self):
        for name in ['ui/app.js', 'desktop/standalone.zip', 'desktop/Cargo.toml',
                     'desktop/Cargo.lock', 'desktop/tauri.conf.json',
                     'desktop/icons/icon.png', 'desktop/src/main.rs',
                     'scripts/release/unlisted-build-helper.py', 'VERSION']:
            with self.subTest(path=name), self.assertRaisesRegex(ValueError, 'prevents Windows-only'):
                self.changes({'desktop/src/network_interfaces.rs': self.network('new'), name: 'changed'})

    def test_git_symlink_and_mode_change_are_rejected(self):
        for mode in ['120000', '100755']:
            with self.subTest(mode=mode), self.assertRaisesRegex(ValueError, 'mode/type'):
                self.changes({'desktop/src/network_interfaces.rs': self.network('new')}, mode=mode)

    def test_reuse_preserves_native_source_assets_and_rebuilds_windows(self):
        for target in ['aarch64-apple-darwin', 'x86_64-unknown-linux-gnu', 'x86_64-pc-windows-msvc']:
            original = {'version': '0.88.6', 'target': target, 'assets': [{'sha256': 'unchanged'}], 'source_commit': 'a' * 40}
            row = {**original, 'source_commit': 'b' * 40, 'native_source_commit': 'a' * 40,
                   'packaging': {'input_manifest': original, 'changed_platform': 'windows', 'changed_files': []}}
            with patch.object(reuse, 'source_check', return_value=[]):
                if target.endswith('windows-msvc'):
                    with self.assertRaisesRegex(ValueError, 'must be rebuilt'):
                        reuse.verify(row, 'b' * 40)
                    continue
                reuse.verify(row, 'b' * 40)
                row['assets'] = [{'sha256': 'different'}]
                with self.assertRaisesRegex(ValueError, 'bytes/version/target'):
                    reuse.verify(row, 'b' * 40)
                row['assets'] = original['assets']
                row['native_source_commit'] = 'c' * 40
                with self.assertRaisesRegex(ValueError, 'provenance'):
                    reuse.verify(row, 'b' * 40)

if __name__ == '__main__':
    unittest.main()
