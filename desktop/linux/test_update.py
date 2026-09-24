"""Transactional client updates, isolated from real profiles, packages and Docker."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('update', Path(__file__).with_name('update.py'))
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)


class ClientUpdates(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="kindred user's $data% ")
        self.home = Path(self.temp.name)
        self.data, self.config = self.home / 'data', self.home / 'config'
        self.root = self.data / 'kindred'
        self.base = self.root / 'linux'
        self.base.mkdir(parents=True)
        self.env = patch.dict(os.environ, {'XDG_DATA_HOME': str(self.data), 'XDG_CONFIG_HOME': str(self.config), 'APPDIR': ''})
        self.env.start()
        self.image = self.home / "Kindred's $(touch nope) 0.50.AppImage"
        header = bytearray(Path('/bin/true').read_bytes())
        header[8:11] = b'AI\x02'
        self.image.write_bytes(header)
        self.messages = []
        self.status = patch.object(u, 'progress', side_effect=lambda *args, **kw: self.messages.append((args, kw)))
        self.status.start()
        self.extract = patch.object(u, 'run', side_effect=self.fake_extract)
        self.extract.start()
        # Canary files for settings, auth, grants and standalone setup/data.
        for name in ['profiles.json', 'settings.json', 'microphones.json', 'standalone/version/compose.yaml']:
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b'canary-unchanged')
        self.canaries = {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()}

    def tearDown(self):
        for p, data in self.canaries.items():
            self.assertEqual(p.read_bytes(), data)
        self.extract.stop()
        self.status.stop()
        self.env.stop()
        self.temp.cleanup()

    def fake_extract(self, args, cwd=None, **kw):
        self.assertEqual(args[1:], ['--appimage-extract'])
        appdir = cwd / 'squashfs-root'
        binary = appdir / 'usr/bin/kindred-desktop'
        binary.parent.mkdir(parents=True)
        shutil.copyfile('/bin/true', binary)
        binary.chmod(0o755)
        plugins = appdir / 'usr/lib/gstreamer-1.0'
        plugins.mkdir(parents=True)
        for name in ('libgstautodetect.so', 'libgstpulseaudio.so'):
            (plugins / name).write_bytes(b'fixture')
        launch = appdir / 'AppRun'
        launch.write_text('#!/bin/sh\nprintf "%s\\n" "$KINDRED_CLIENT_ONLY" "$@" > ' + u.shlex.quote(str(self.home / 'launched')) + '\n')
        launch.chmod(0o755)
        icon = appdir / 'usr/share/icons/hicolor/512x512/apps/kindred-desktop.png'
        icon.parent.mkdir(parents=True)
        icon.write_bytes(b'\x89PNG\r\n\x1a\n')

    def install(self, **kw):
        u.install(self.image, self.root, self.config, **kw)

    def test_install_repeat_update_rollback_and_literal_paths(self):
        before = self.image.read_bytes()
        self.install()
        first = (self.base / 'current').resolve()
        self.assertEqual(self.image.read_bytes(), before)
        self.assertFalse((self.base / 'previous').exists())
        self.install()
        self.assertEqual(first, (self.base / 'current').resolve())
        subprocess.run([self.root / 'bin/kindred', 'argument with spaces'], check=True)
        self.assertEqual((self.home / 'launched').read_text(), '1\nargument with spaces\n')
        menu = self.data / 'applications/Kindred.desktop'
        self.assertEqual(u.entry_command(menu), [str(self.root / 'bin/kindred')])
        if shutil.which('desktop-file-validate'):
            subprocess.run(['desktop-file-validate', menu], check=True)
        self.image.write_bytes(before + b'new package')
        self.install()
        second = (self.base / 'current').resolve()
        self.assertNotEqual(first, second)
        self.assertEqual((self.base / 'previous').resolve(), first)
        u.rollback(self.root)
        self.assertEqual((self.base / 'current').resolve(), first)
        self.assertTrue((second / 'launch').is_file())

    def test_invalid_image_checksum_and_extraction_keep_active_client(self):
        self.install()
        selected = (self.base / 'current').resolve()
        launcher = (self.root / 'bin/kindred').read_bytes()
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            self.install(expected='0' * 64)
        self.image.write_bytes(b'wrong package' * 100)
        with self.assertRaisesRegex(ValueError, 'Type 2'):
            self.install()
        self.image.write_bytes((selected / 'Kindred.AppImage').read_bytes() + b'next')
        with patch.object(u, 'run', side_effect=RuntimeError('extraction failed')):
            with self.assertRaisesRegex(RuntimeError, 'extraction failed'):
                self.install()
        self.assertEqual((self.base / 'current').resolve(), selected)
        self.assertEqual((self.root / 'bin/kindred').read_bytes(), launcher)
        self.assertFalse(list(self.base.glob('.stage-*')))

    def test_extracted_system_appdir_migrates_pinned_and_autostart_shortcuts(self):
        appdir = self.home / 'Applications/Kindred.AppDir'
        (appdir / 'usr/bin').mkdir(parents=True)
        (appdir / 'usr/bin/kindred-desktop').write_text('legacy')
        (appdir / 'usr/lib').mkdir()
        (appdir / 'usr/lib/gstreamer-1.0').symlink_to('/usr/lib/gstreamer-1.0')
        old = appdir / 'AppRun'
        old.write_text('#!/bin/sh\nprintf legacy > ' + u.shlex.quote(str(self.home / 'legacy')) + '\n')
        old.chmod(0o755)
        for directory, name in [(self.data / 'applications', 'custom-kindred.desktop'), (self.config / 'autostart', 'kindred.desktop')]:
            directory.mkdir(parents=True)
            (directory / name).write_text('[Desktop Entry]\nName=Kindred\nType=Application\nExec=' + u.exec_arg(old) + ' --profiles %U\nHidden=false\n')
        with patch.object(u, 'check_system') as check:
            self.install()
            self.assertEqual(check.call_count, 1)
        self.assertEqual(json.loads((self.base / 'current/install.json').read_text())['runtime'], 'system')
        self.assertEqual(u.entry_command(self.config / 'autostart/kindred.desktop'), [str(self.root / 'bin/kindred'), '--profiles'])
        self.assertIn('Hidden=false', (self.config / 'autostart/kindred.desktop').read_text())
        self.assertEqual(old.read_text().count('legacy'), 2)
        self.assertTrue((self.base / 'previous/icon.png').is_file())
        u.rollback(self.root)
        subprocess.run([self.root / 'bin/kindred'], check=True)
        self.assertEqual((self.home / 'legacy').read_text(), 'legacy')
        self.assertEqual(u.detect_mode(self.base, []), 'system')

    def test_env_launchers_preserve_environment_actions_and_autostart(self):
        appdir = self.home / 'Applications/Kindred.AppDir'
        (appdir / 'usr/bin').mkdir(parents=True)
        (appdir / 'usr/bin/kindred-desktop').write_text('legacy')
        old = appdir / 'AppRun'
        old.write_text('#!/bin/sh\nprintf "%s" "$KINDRED_TEST_VALUE" > ' + u.shlex.quote(str(self.home / 'environment')) + '\n')
        old.chmod(0o755)
        shortcut = self.data / 'applications/Kindred.desktop'
        shortcut.parent.mkdir(parents=True)
        original = ('[Desktop Entry]\nName=Kindred\nExec=env GDK_BACKEND=x11 '
                    + u.exec_arg('KINDRED_TEST_VALUE=spaces $literal; `untouched`') + ' '
                    + u.exec_arg(old) + ' --profiles %U\nTryExec=' + str(old) + '\nIcon=old\n'
                    + '[Desktop Action Help]\nName=Help\nExec=/usr/bin/true\nIcon=help\n')
        shortcut.write_text(original)
        auto = self.config / 'autostart/kindred.desktop'
        auto.parent.mkdir(parents=True)
        auto.write_text(original.replace('Icon=old', 'Hidden=true\nIcon=old'))
        self.install()
        command = u.entry_command(shortcut)
        self.assertEqual(command, ['/usr/bin/env', 'GDK_BACKEND=x11', 'KINDRED_TEST_VALUE=spaces $literal; `untouched`', str(self.root / 'bin/kindred'), '--profiles'])
        self.assertEqual(u.entry(shortcut)['TryExec'], str(self.root / 'bin/kindred'))
        self.assertIn('[Desktop Action Help]\nName=Help\nExec=/usr/bin/true\nIcon=help', shortcut.read_text())
        self.assertEqual(u.entry(auto)['Hidden'], 'true')
        self.assertIn(original.encode(), [p.read_bytes() for p in (self.base / 'shortcut-backups').iterdir()])
        u.rollback(self.root)
        subprocess.run([self.root / 'bin/kindred'], check=True)
        self.assertEqual((self.home / 'environment').read_text(), 'spaces $literal; `untouched`')
        self.assertEqual(old.read_text().count('printf'), 1)

    def test_packaged_path_command_and_lowercase_entry_are_migrated(self):
        menu = self.data / 'applications/kindred.desktop'
        menu.parent.mkdir(parents=True)
        menu.write_text('[Desktop Entry]\nName=Kindred\nExec=kindred-desktop --profiles %U\nTryExec=kindred-desktop\n')
        self.install()
        self.assertEqual(u.entry_command(menu), [str(self.root / 'bin/kindred'), '--profiles'])
        self.assertEqual(u.entry(menu)['TryExec'], str(self.root / 'bin/kindred'))
        self.assertFalse((menu.parent / 'Kindred.desktop').exists())
        self.assertEqual(len(list(menu.parent.glob('*.desktop'))), 1)

    def test_unknown_shell_wrapper_stays_untouched_and_update_finishes(self):
        menu = self.data / 'applications/Kindred.desktop'
        menu.parent.mkdir(parents=True)
        original = '[Desktop Entry]\nName=Kindred\nExec=/bin/sh -c "unknown-launch-script"\n'
        menu.write_text(original)
        self.install()
        self.assertEqual(menu.read_text(), original)
        self.assertTrue((self.base / 'current/launch').is_file())
        self.assertEqual(u.entry(self.data / 'applications/dev.kindred.personal.desktop')['Name'], 'Kindred (Updated)')

    def test_system_dependency_failure_and_partial_shortcut_write_roll_back(self):
        self.install()
        self.image.write_bytes(self.image.read_bytes() + b'new')
        before = (self.base / 'current').resolve()
        with patch.object(u, 'check_system', side_effect=RuntimeError('missing audio plugin')):
            with self.assertRaisesRegex(RuntimeError, 'missing audio'):
                self.install(mode='system')
        self.assertEqual((self.base / 'current').resolve(), before)
        shortcut = self.data / 'applications/Kindred.desktop'
        original = shortcut.read_bytes()
        real = u.atomic
        failed = False
        def fail(path, *args):
            nonlocal failed
            if path == self.root / 'bin/kindred' and not failed:
                failed = True
                raise OSError('disk full')
            return real(path, *args)
        with patch.object(u, 'atomic', side_effect=fail):
            with self.assertRaisesRegex(OSError, 'disk full'):
                self.install()
        self.assertEqual(shortcut.read_bytes(), original)
        self.assertEqual((self.base / 'current').resolve(), before)

    def test_foreign_shortcut_is_preserved_without_blocking_install(self):
        foreign = self.data / 'applications/Kindred.desktop'
        foreign.parent.mkdir(parents=True)
        foreign.write_text('[Desktop Entry]\nName=Kindred\nExec=/usr/bin/unrelated\n')
        original = foreign.read_bytes()
        self.install()
        self.assertEqual(foreign.read_bytes(), original)
        managed = self.data / 'applications/dev.kindred.personal.desktop'
        self.assertEqual(u.entry(managed)['Name'], 'Kindred (Updated)')
        self.assertEqual(u.entry_command(managed), [str(self.root / 'bin/kindred')])
        self.assertTrue((self.base / 'current/launch').is_file())
        self.assertIn(str(foreign), self.messages[-1][0][1])
        self.install()
        self.assertEqual(len(list(managed.parent.glob('dev.kindred.personal*.desktop'))), 1)

    def test_symlink_escape_is_rejected(self):
        with patch.object(u, 'contained', side_effect=ValueError('unsafe')):
            self.image.write_bytes(self.image.read_bytes() + b'next')
            with self.assertRaisesRegex(ValueError, 'unsafe'):
                self.install()
        self.assertFalse((self.base / 'current').exists())
        p = self.base / 'escape'
        p.symlink_to('/bin/true')
        with self.assertRaisesRegex(ValueError, 'unsafe'):
            u.contained(self.base, p)

    def test_cli_retains_offline_helper_and_can_roll_back(self):
        with patch.object(u.os, 'geteuid', return_value=1000):
            u.main([str(self.image)])
            helper = self.base / 'update.py'
            self.assertEqual(helper.read_bytes(), Path(u.__file__).read_bytes())
            first = (self.base / 'current').resolve()
            self.image.write_bytes(self.image.read_bytes() + b'next release')
            u.main([str(self.image)])
            u.main(['--rollback'])
            self.assertEqual((self.base / 'current').resolve(), first)

    def test_process_lock_and_root_guard(self):
        with patch.object(u.os, 'geteuid', return_value=0):
            with self.assertRaisesRegex(RuntimeError, 'without sudo'):
                u.main([str(self.image)])
        with (self.base / 'update.lock').open('a') as lock:
            u.fcntl.flock(lock, u.fcntl.LOCK_EX | u.fcntl.LOCK_NB)
            with patch.object(u.os, 'geteuid', return_value=1000):
                with self.assertRaisesRegex(RuntimeError, 'already running'):
                    u.main([str(self.image)])

    def test_window_recovery_preserves_accounts_server_and_original_geometry(self):
        state = self.root / 'window-state'
        state.mkdir()
        contents = b'{"width":5,"height":400}'
        (state / 'profile-home.json').write_bytes(contents)
        (state / 'untouched.json').write_bytes(b'other')
        with patch.object(u.os, 'geteuid', return_value=1000):
            u.main(['--reset-window-state'])
        self.assertFalse((state / 'profile-home.json').exists())
        self.assertEqual((state / 'untouched.json').read_bytes(), b'other')
        backups = list((self.base / 'window-state-backups').glob('*/profile-home.json'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), contents)
        u.reset_window_state(self.root)
        (state / 'profile-home.json').symlink_to(backups[0])
        with self.assertRaisesRegex(RuntimeError, 'symlink'):
            u.reset_window_state(self.root)
        self.assertEqual(backups[0].read_bytes(), contents)


if __name__ == '__main__':
    unittest.main()
