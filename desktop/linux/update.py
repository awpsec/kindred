#!/usr/bin/env python3
"""Install a downloaded Kindred AppImage for this user; never operate on Docker.

python3 update.py ~/Downloads/Kindred-VERSION-Linux-x64.AppImage
python3 update.py --rollback
python3 update.py --reset-window-state
Requires Python 3. Bundled mode needs no FUSE. System mode also needs patchelf
and the existing system WebKit/GStreamer packages (no packages are installed).
"""
import argparse
import configparser
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import uuid

# Do not mix a running AppImage's libraries/plugins with host helper programs.
JSON_OUTPUT = False

RUNTIME_ENV = ('LD_LIBRARY_PATH', 'LD_PRELOAD', 'GTK_PATH', 'GTK_EXE_PREFIX',
               'GTK_DATA_PREFIX', 'GIO_MODULE_DIR', 'GSETTINGS_SCHEMA_DIR',
               'GDK_PIXBUF_MODULE_FILE', 'GDK_PIXBUF_MODULEDIR', 'GST_PLUGIN_PATH',
               'GST_PLUGIN_PATH_1_0', 'GST_PLUGIN_SYSTEM_PATH', 'GST_PLUGIN_SYSTEM_PATH_1_0',
               'GST_PLUGIN_SCANNER', 'GST_PLUGIN_SCANNER_1_0', 'GST_REGISTRY', 'GST_REGISTRY_1_0')


def clean_env():
    return {k: v for k, v in os.environ.items() if k not in RUNTIME_ENV}


def progress(stage, message, percent, **extra):
    if JSON_OUTPUT:
        print(json.dumps(dict(status=stage, message=message, progress=percent, **extra)), flush=True)
    else:
        print(f'[{percent:3}%] {message}', flush=True)


def atomic(path, content, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.update-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(content if isinstance(content, bytes) else content.encode())
            f.flush()
            os.fchmod(f.fileno(), mode)
            os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def link(path, target):
    temp = path.with_name('.link-' + uuid.uuid4().hex)
    try:
        temp.symlink_to(target)
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def run(args, cwd=None, timeout=180):
    # Extraction output can be large; keep it off the IPC pipe and out of memory.
    with tempfile.TemporaryFile() as log:
        result = subprocess.run(args, cwd=cwd, env=clean_env(), stdin=subprocess.DEVNULL,
                                stdout=log, stderr=log, timeout=timeout)
        if result.returncode:
            log.seek(0, os.SEEK_END)
            log.seek(max(0, log.tell() - 2000))
            raise RuntimeError(f'{Path(args[0]).name} failed: ' + log.read().decode(errors='replace').strip())


def elf(path, appimage=False):
    with path.open('rb') as f:
        header = f.read(64)
    if (len(header) != 64 or header[:6] != b'\x7fELF\x02\x01'
            or header[18:20] != b'\x3e\x00' or (appimage and header[8:11] != b'AI\x02')):
        raise ValueError('Choose a Linux x86_64 Type 2 Kindred AppImage, not a DEB, archive or another platform package.')


def contained(root, path):
    if not path.resolve().is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError('The AppImage has missing or unsafe Kindred files.')
    return path


def entries(data, config):
    return list((data / 'applications').glob('*.desktop')) + list((config / 'autostart').glob('*.desktop'))


def entry(path):
    parser = configparser.ConfigParser(interpolation=None, strict=False)
    parser.optionxform = str
    try:
        parser.read(path)
        return parser['Desktop Entry']
    except (OSError, KeyError, configparser.Error):
        return {}


def entry_command(path):
    e = entry(path)
    if e.get('Name', '').strip().lower() not in ('kindred', 'kindred (updated)'):
        return None
    value = re.sub(r'\\([sntr\\])', lambda m: {'s': ' ', 'n': '\n', 't': '\t', 'r': '\r', '\\': '\\'}[m[1]], e.get('Exec', ''))
    # Desktop Exec uses double quotes; unlike a shell it does not expand $ or `.
    # shlex retains their escape characters inside double quotes, so parse the
    # specified quoting directly instead of silently changing literal paths.
    parts, word, quoted, escaped = [], '', False, False
    for char in value:
        if escaped:
            word += char
            escaped = False
        elif char == '\\':
            escaped = True
        elif char == '"':
            quoted = not quoted
        elif char.isspace() and not quoted:
            if word:
                parts.append(word)
                word = ''
        else:
            word += char
    if escaped or quoted:
        return None
    if word:
        parts.append(word)
    if not parts:
        return None
    # env without assignments is redundant. Preserve actual environment choices.
    if parts[0] in ('env', '/usr/bin/env', '/bin/env'):
        parts[0] = '/usr/bin/env'
        if len(parts) > 1 and not parts[1].startswith('-') and not re.match(r'[A-Za-z_][A-Za-z0-9_]*=', parts[1]):
            parts = parts[1:]
    return [p.replace('%%', '%') for p in parts if p not in ('%U', '%u', '%F', '%f')]


def command_program(command):
    """Locate a direct launcher, including desktop-file env prefixes; never run it."""
    if not command:
        return None
    index = 0
    if command[0] == '/usr/bin/env':
        index = 1
        while index < len(command):
            part = command[index]
            if part == '--':
                index += 1
                break
            if part in ('-i', '--ignore-environment') or re.fullmatch(r'--unset=[A-Za-z_][A-Za-z0-9_]*', part):
                index += 1
            elif part in ('-u', '--unset') and index + 1 < len(command) and re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', command[index + 1]):
                index += 2
            elif re.match(r'[A-Za-z_][A-Za-z0-9_]*=', part):
                index += 1
            else:
                break
    if index >= len(command) or command[index].startswith('-'):
        return None
    program = Path(command[index])
    if not program.is_absolute():
        # Exec may be a command from PATH, as in the packaged .desktop entry.
        if len(program.parts) != 1:
            return None
        program = Path(shutil.which(str(program)) or str(program))
    return index, program


def known_launcher(path, root):
    return (path == root / 'bin/kindred'
            or (path.name == 'AppRun' and (path.parent / 'usr/bin/kindred-desktop').is_file())
            or (path.name.lower().startswith('kindred') and path.suffix.lower() == '.appimage')
            or path.name == 'kindred-desktop')


def shortcut_command(path, root):
    if path.is_symlink():
        return None
    command = entry_command(path)
    program = command_program(command)
    return (command, *program) if program and known_launcher(program[1], root) else None


def rewrite_entry(text, updates):
    # Desktop Actions can have their own Exec/Icon: change only the main entry.
    remaining = dict(updates)
    lines, main = [], False
    for line in text.splitlines():
        if line.strip().startswith('['):
            if main:
                lines.extend(key + '=' + value for key, value in remaining.items())
                remaining.clear()
            main = line.strip() == '[Desktop Entry]'
        match = re.match(r'\s*([A-Za-z0-9-]+)\s*=', line) if main else None
        if match and match[1] in updates:
            key = match[1]
            line = key + '=' + updates[key]
            remaining.pop(key, None)
        lines.append(line)
    if main:
        lines.extend(key + '=' + value for key, value in remaining.items())
    return '\n'.join(lines) + '\n'


def detect_mode(base, menu_files):
    record = base / 'current/install.json'
    if record.is_file():
        return json.loads(record.read_text())['runtime']
    roots = [Path(os.environ['APPDIR'])] if os.environ.get('APPDIR') else []
    for path in menu_files:
        found = shortcut_command(path, base.parent)
        if found and found[2].name == 'AppRun':
            roots.append(found[2].parent)
    if any((p / 'usr/lib/gstreamer-1.0').is_symlink() for p in roots):
        return 'system'
    # The previous Linux setup helper always used a system-library launcher.
    launcher = base.parent / 'bin/kindred'
    if launcher.is_file() and 'system' in launcher.read_text(errors='replace'):
        return 'system'
    return 'bundled'


def check_system(binary):
    if not shutil.which('patchelf'):
        raise RuntimeError('This installation uses system libraries. Install patchelf once, then retry. No launcher was changed.')
    run(['patchelf', '--remove-rpath', str(binary)], timeout=20)
    libs = subprocess.run(['ldd', str(binary)], env=clean_env(), capture_output=True, text=True, timeout=20)
    if libs.returncode or 'not found' in libs.stdout:
        raise RuntimeError('System WebKit/GTK libraries are missing. Use Linux setup help to repair dependencies, then retry. No launcher was changed.')
    for element in ('appsrc', 'appsink', 'audioconvert', 'audioresample', 'autoaudiosink', 'pulsesink'):
        try:
            run(['gst-inspect-1.0', element], timeout=10)
        except (OSError, RuntimeError):
            raise RuntimeError(f'System GStreamer is missing {element}. Install your distribution’s matching plugins-good/audio packages, then retry. No launcher was changed.') from None


def shell_launch(target, mode):
    appdir = target / 'squashfs-root'
    text = '#!/bin/sh\n# Kindred managed client. Standalone updates remain explicit.\n'
    text += 'unset ' + ' '.join(RUNTIME_ENV + ('APPDIR', 'APPIMAGE', 'ARGV0', 'OWD')) + '\n'
    text += 'export KINDRED_CLIENT_ONLY=1\n'
    text += 'export APPDIR=' + shlex.quote(str(appdir)) + '\n'
    text += 'export APPIMAGE=' + shlex.quote(str(target / 'Kindred.AppImage')) + '\n'
    text += 'exec ' + shlex.quote(str(target / 'kindred-desktop' if mode == 'system' else appdir / 'AppRun')) + ' "$@"\n'
    return text


def exec_arg(value):
    quoted = ''.join('\\' + c if c in '\\"`$' else c for c in str(value))
    return '"' + quoted.replace('\\', '\\\\').replace('%', '%%') + '"'


def install(image, root, config, mode='auto', expected=None):
    base = root / 'linux'
    for name in ('current', 'previous'):
        p = base / name
        if p.exists() and not p.is_symlink():
            raise RuntimeError(f'An unrecognized {name} install exists. It was preserved; inspect it before retrying.')
    menus = entries(root.parent, config)
    if mode == 'auto':
        mode = detect_mode(base, menus)
    if mode not in ('system', 'bundled'):
        raise ValueError('Unknown runtime mode.')
    image = image.resolve(strict=True)
    if not image.is_file() or not 64 <= image.stat().st_size <= 4 * 1024**3:
        raise ValueError('The selected AppImage is missing, empty or exceeds 4 GB.')
    elf(image, appimage=True)
    progress('copying', 'Copying the downloaded AppImage…', 0, runtime=mode)
    versions = base / 'versions'
    versions.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.stage-', dir=base) as folder:
        stage = Path(folder)
        copied = stage / 'Kindred.AppImage'
        digest = hashlib.sha256()
        size = image.stat().st_size
        done = 0
        with image.open('rb') as source, copied.open('wb') as dest:
            while block := source.read(4 * 1024**2):
                dest.write(block)
                digest.update(block)
                done += len(block)
                progress('copying', 'Copying the downloaded AppImage…', min(25, done * 25 // size), runtime=mode)
            dest.flush()
            os.fsync(dest.fileno())
        sha = digest.hexdigest()
        if expected and sha != expected.lower():
            raise ValueError('The AppImage does not match the supplied SHA-256. Your installed client was kept.')
        elf(copied, appimage=True)
        target = versions / (sha + '-' + mode)
        if not target.exists():
            copied.chmod(0o755)
            progress('extracting', 'Unpacking the client (no FUSE required)…', 30, runtime=mode)
            run([str(copied), '--appimage-extract'], cwd=stage)
            appdir = stage / 'squashfs-root'
            binary = contained(stage, appdir / 'usr/bin/kindred-desktop')
            elf(binary)
            contained(stage, appdir / 'AppRun')
            icon = contained(stage, appdir / 'usr/share/icons/hicolor/512x512/apps/kindred-desktop.png')
            if icon.read_bytes()[:8] != b'\x89PNG\r\n\x1a\n':
                raise ValueError('The AppImage has no valid Kindred icon.')
            progress('checking', 'Checking client files and audio libraries…', 65, runtime=mode)
            if mode == 'system':
                shutil.copy2(binary, stage / 'kindred-desktop')
                check_system(stage / 'kindred-desktop')
            else:
                for plugin in ('libgstautodetect.so', 'libgstpulseaudio.so'):
                    contained(stage, appdir / 'usr/lib/gstreamer-1.0' / plugin)
            shutil.copyfile(icon, stage / 'icon.png')
            atomic(stage / 'launch', shell_launch(target, mode), 0o755)
            atomic(stage / 'install.json', json.dumps(dict(sha256=sha, runtime=mode, filename=image.name)))
            os.rename(stage, target)
            stage.mkdir()  # TemporaryDirectory now removes only the empty staging path.
        elif not (target / 'install.json').is_file():
            raise RuntimeError('An incomplete install exists. It was preserved; no launcher was changed.')
    progress('installing', 'Updating your application shortcuts…', 85, runtime=mode)
    preserved = activate(root, config, target, menus)
    message = 'Client installed. Restart Kindred when ready. Your standalone server keeps running.'
    if preserved:
        message += ' Your existing shortcut was kept at ' + str(preserved) + '. Open Kindred (Updated) from Applications.'
    progress('ready', message, 100, runtime=mode, filename=image.name, rollback=(base / 'previous').exists())


def activate(root, config, target, menus):
    base = root / 'linux'
    launcher = root / 'bin/kindred'
    old = (base / 'current').resolve() if (base / 'current').is_symlink() else None
    backup = base / 'shortcut-backups'
    changes = {}
    for path in menus:
        found = shortcut_command(path, root)
        if found:
            command, index, program = found
            if old is None and path.parent.name != 'autostart':
                legacy = base / 'versions' / ('legacy-' + uuid.uuid4().hex)
                legacy.mkdir()
                if program == launcher and launcher.is_file():
                    atomic(legacy / 'launch', launcher.read_bytes(), 0o755)
                else:
                    atomic(legacy / 'launch', '#!/bin/sh\nexec ' + shlex.join(command) + ' "$@"\n', 0o755)
                atomic(legacy / 'install.json', json.dumps(dict(runtime=detect_mode(base, menus), filename='Previous client')))
                old_icon = entry(path).get('Icon', '')
                icon_path = Path(old_icon) if old_icon else Path('/nonexistent')
                if not icon_path.is_absolute() or not icon_path.is_file():
                    icon_path = target / 'icon.png'
                shutil.copyfile(icon_path, legacy / 'icon.png')
                old = legacy
            updated = [*command[:index], str(launcher), *command[index + 1:]]
            values = {'Exec': ' '.join(exec_arg(p) for p in updated)}
            if 'TryExec' in entry(path):
                values['TryExec'] = str(launcher).replace('\\', '\\\\')
            changes[path] = rewrite_entry(path.read_text(), values)
    desktop = root.parent / 'applications/Kindred.desktop'
    preserved = None
    if not desktop.exists() and not desktop.is_symlink():
        desktop = next((p for p in changes if p.parent == desktop.parent), desktop)
    if desktop not in changes:
        # A shortcut for another program must not block installing this client.
        # Keep it intact and use a clearly named separate Kindred menu entry.
        if desktop.exists() or desktop.is_symlink():
            preserved = desktop
            candidates = [p for p in changes if p.parent == desktop.parent and entry(p).get('Name') == 'Kindred (Updated)']
            desktop = candidates[0] if candidates else desktop.with_name('dev.kindred.personal.desktop')
            suffix = 1
            while desktop not in changes and (desktop.exists() or desktop.is_symlink()):
                desktop = desktop.with_name(f'dev.kindred.personal-{suffix}.desktop')
                suffix += 1
        if desktop not in changes:
            changes[desktop] = ('[Desktop Entry]\nType=Application\nName=' + ('Kindred (Updated)' if preserved else 'Kindred')
                                + '\nComment=Personal AI teammates\nExec=' + exec_arg(launcher)
                                + '\nTerminal=false\nCategories=Utility;\nStartupWMClass=kindred-desktop\n')
    for path in list(changes):
        # Keep the icon name stable across updates, including pinned KDE launchers.
        changes[path] = rewrite_entry(changes[path], {'Icon': str(base / 'current/icon.png').replace('\\', '\\\\')})
    changes[launcher] = '#!/bin/sh\nexec ' + shlex.quote(str(base / 'current/launch')) + ' "$@"\n'
    # Save original shortcuts once, and restore all touched files on a failed switch.
    originals = {p: (p.read_bytes(), p.stat().st_mode & 0o777) if p.exists() else None for p in changes}
    previous = os.readlink(base / 'previous') if (base / 'previous').is_symlink() else None
    had_current = (base / 'current').is_symlink()
    try:
        if not had_current:
            link(base / 'current', old or target)
        for path, content in changes.items():
            if originals[path]:
                saved = backup / hashlib.sha256(str(path).encode()).hexdigest()
                if not saved.exists():
                    atomic(saved, originals[path][0], originals[path][1])
            atomic(path, content, 0o755 if path == launcher else 0o644)
        if old and old != target:
            link(base / 'previous', old)
        link(base / 'current', target)  # One atomic selection change, after staging succeeds.
    except Exception:
        for path, original in originals.items():
            if original:
                atomic(path, *original)
            else:
                path.unlink(missing_ok=True)
        if not had_current:
            (base / 'current').unlink(missing_ok=True)
        if previous:
            link(base / 'previous', previous)
        else:
            (base / 'previous').unlink(missing_ok=True)
        raise

    return preserved

def rollback(root):
    base = root / 'linux'
    if not (base / 'previous/launch').is_file() or not (base / 'current/launch').is_file():
        raise RuntimeError('There is no previous client available to restore.')
    old, current = (base / 'previous').resolve(), (base / 'current').resolve()
    try:
        link(base / 'previous', current)
        link(base / 'current', old)
    except Exception:
        link(base / 'previous', old)
        raise
    progress('ready', 'Previous client restored. Restart Kindred when ready.', 100, rollback=True)


def reset_window_state(root):
    """Recover window placement only, preserving the original files for diagnosis."""
    source = root / 'window-state'
    paths = [source / (name + '.json') for name in ('main', 'profile-home')]
    if any(p.is_symlink() for p in paths) or source.is_symlink():
        raise RuntimeError('Window placement uses a custom symlink. It was kept unchanged.')
    saved = [p for p in paths if p.is_file()]
    if not saved:
        progress('ready', 'No saved window placement exists. No settings were changed.', 100)
        return
    backup = root / 'linux/window-state-backups' / uuid.uuid4().hex
    backup.mkdir(parents=True)
    moved = []
    try:
        for path in saved:
            os.rename(path, backup / path.name)
            moved.append(path)
    except Exception:
        for path in reversed(moved):
            os.rename(backup / path.name, path)
        raise
    progress('ready', 'Window placement reset. Open Kindred again. Original placement saved in '
             + str(backup) + '. Profiles and standalone data were not changed.', 100)


def main(argv=None):
    global JSON_OUTPUT
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('appimage', type=Path, nargs='?')
    parser.add_argument('--runtime', choices=('auto', 'bundled', 'system'), default='auto')
    parser.add_argument('--sha256', help='Optional expected release checksum')
    parser.add_argument('--rollback', action='store_true')
    parser.add_argument('--reset-window-state', action='store_true',
                        help='After fully quitting Kindred, back up and reset only its window sizes and positions')
    parser.add_argument('--json', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    JSON_OUTPUT = args.json
    if sum((args.rollback, args.reset_window_state, bool(args.appimage))) != 1:
        parser.error('Choose one downloaded AppImage, --rollback, or --reset-window-state.')
    if platform.system() != 'Linux' or platform.machine() != 'x86_64':
        raise RuntimeError('The current Kindred AppImage requires Linux x86_64.')
    if os.geteuid() == 0:
        raise RuntimeError('Run as your normal desktop user, without sudo.')
    data = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share')))
    config = Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home() / '.config')))
    if any(not p.is_absolute() or any(ord(c) < 32 for c in str(p)) for p in (data, config)):
        raise ValueError('XDG data/config directories must be absolute paths without control characters.')
    root = data / 'kindred'
    base = root / 'linux'
    base.mkdir(parents=True, exist_ok=True)
    with (base / 'update.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Another client update is already running. Wait for it to finish.') from None
        helper = base / 'update.py'
        if Path(__file__).resolve() != helper.resolve():
            atomic(helper, Path(__file__).read_bytes())
        if args.reset_window_state:
            reset_window_state(root)
        elif args.rollback:
            rollback(root)
        else:
            install(args.appimage, root, config, args.runtime, args.sha256)
    # Menu refresh is advisory; do not report a failed install after a committed switch.
    if shutil.which('update-desktop-database'):
        try:
            subprocess.run(['update-desktop-database', str(data / 'applications')], env=clean_env(),
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        except (OSError, subprocess.TimeoutExpired):
            pass


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        progress('error', str(e), 0)
        sys.exit(1)
