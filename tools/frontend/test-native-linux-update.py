"""Run as an unprivileged user under isolated Xvfb/DBus; no real accounts needed.

KINDRED_NATIVE_EXE points to a current native build; KINDRED_TEST_APPIMAGE points
at an existing released AppImage. This installs only into a temporary HOME.
"""
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import gi

gi.require_version('Atspi', '2.0')
gi.require_version('Gdk', '3.0')
from gi.repository import Atspi, Gdk

assert os.geteuid() != 0, 'Run this test as an unprivileged test user.'
image = str(Path(os.environ['KINDRED_TEST_APPIMAGE']).resolve(strict=True))
exe = str(Path(os.environ['KINDRED_NATIVE_EXE']).resolve(strict=True))
out = Path(os.environ.get('KINDRED_TEST_ARTIFACTS', tempfile.mkdtemp(prefix='kindred-native-update-proof-')))
out.mkdir(parents=True, exist_ok=True)
root = Path(tempfile.mkdtemp(prefix='kindred-native-update-'))
env = dict(os.environ, HOME=str(root), XDG_DATA_HOME=str(root / 'data'), XDG_CONFIG_HOME=str(root / 'config'),
           XDG_CACHE_HOME=str(root / 'cache'), KINDRED_CLIENT_ONLY='1', NO_AT_BRIDGE='0')
# The native Accounts page may read Docker availability, but an update must never
# invoke a build, up/down, restart, volume or service mutation.
bin_dir = root / 'bin'
bin_dir.mkdir()
docker = bin_dir / 'docker'
docker.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "' + str(root / 'docker-calls') + '"\nexit 1\n')
docker.chmod(0o755)
env['PATH'] = str(bin_dir) + ':' + env['PATH']
log = (out / 'native.log').open('w')
client = subprocess.Popen([exe, '--profiles'], env=env, stdout=log, stderr=log)
pids = {client.pid}


def nodes():
    pending = [Atspi.get_desktop(0)]
    for _ in range(3000):
        if not pending:
            return
        node = pending.pop()
        try:
            yield node
            for i in range(node.get_child_count()):
                child = node.get_child_at_index(i)
                if child:
                    pending.append(child)
        except Exception:
            continue


def button(name, seconds=30):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        for n in nodes():
            try:
                if n.get_name() == name and n.get_state_set().contains(Atspi.StateType.SENSITIVE):
                    if not n.get_state_set().contains(Atspi.StateType.SHOWING):
                        n.get_component_iface().scroll_to(Atspi.ScrollType.ANYWHERE)
                        time.sleep(.15)
                    return n
            except Exception:
                pass
        time.sleep(.15)
    (out / 'accessible-names.json').write_text(json.dumps([n.get_name() for n in nodes()]))
    raise AssertionError('Button unavailable: ' + name)


def click(name):
    node = button(name)
    action = node.get_action_iface()
    assert action and action.do_action(0), name


def wait_for(check, message, seconds=40):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if check():
            return
        time.sleep(.2)
    raise AssertionError(message)


def screenshot(name):
    w = Gdk.get_default_root_window()
    Gdk.pixbuf_get_from_window(w, 0, 0, w.get_width(), w.get_height()).savev(str(out / name), 'png', [], [])


try:
    click('Install downloaded app update…')
    click('Choose AppImage…')
    time.sleep(1)
    subprocess.run(['xdotool', 'key', '--clearmodifiers', 'ctrl+l'], check=True)
    # Set the native entry atomically so GTK filename completion cannot race
    # individual synthetic keystrokes and duplicate a suffix.
    time.sleep(.3)
    entry = next(n for n in nodes() if n.get_state_set().contains(Atspi.StateType.EDITABLE)
                 and n.get_state_set().contains(Atspi.StateType.FOCUSED))
    assert entry.get_editable_text_iface().set_text_contents(image)
    assert Atspi.Text.get_text(entry, 0, -1) == image
    click('Choose AppImage')
    click('Install client')
    current = root / 'data/kindred/linux/current'
    wait_for(lambda: (current / 'install.json').is_file(), 'Native install did not select a client')
    assert (root / 'data/kindred/linux/update.py').is_file(), 'Offline recovery helper is missing'
    button('Restart Kindred')
    screenshot('native-installed.png')
    click('Restart Kindred')
    wait_for(lambda: client.poll() is not None, 'The original client did not exit after restart')
    wait_for(lambda: any(n.get_name() == 'Kindred · Accounts' for n in nodes()), 'The installed client did not open Accounts')
    time.sleep(1)
    for n in nodes():
        try:
            if n.get_name() == 'Kindred · Accounts':
                pids.add(n.get_process_id())
        except Exception:
            pass
    screenshot('native-restarted.png')
    calls = (root / 'docker-calls').read_text().splitlines() if (root / 'docker-calls').exists() else []
    assert all(c in ['--version', 'compose version', 'info --format {{.ServerVersion}}'] for c in calls), calls
    result = dict(passed=True, nativePicker=True, install=True, restart=True, serverMutations=False,
                  isolatedHome=str(root), runtime=json.loads((current / 'install.json').read_text())['runtime'])
    (out / 'checks.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
except Exception:
    screenshot('native-failure.png')
    raise
finally:
    for n in nodes():
        try:
            if n.get_name().startswith('Kindred'):
                pids.add(n.get_process_id())
        except Exception:
            pass
    for pid in pids:
        if pid > 1:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    if client.poll() is None:
        client.wait(timeout=10)
    log.close()
