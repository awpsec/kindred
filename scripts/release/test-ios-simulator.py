"""Run one unsigned simulator attempt; keep scoped composer evidence separate."""
import argparse, hashlib, json, os, re, signal, ssl, subprocess, tempfile, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'ios-validation'


def run(argv, **kwargs):
    return subprocess.run(argv, check=True, timeout=90, **kwargs)


def record(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')


def boot_simulator(device):
    """Allow bounded cold migration, and require terminal boot readiness."""
    started = time.monotonic()
    status = {'device_udid': device['udid'], 'deadline_seconds': 180,
              'boot_command_deadline_seconds': 90,
              'phase': 'boot', 'passed': False}
    try:
        with (OUT / 'simulator-boot.log').open('w') as log:
            if device['state'] != 'Booted':
                run(['xcrun', 'simctl', 'boot', device['udid']], stdout=log, stderr=subprocess.STDOUT)
            status['phase'] = 'bootstatus'
            subprocess.run(['xcrun', 'simctl', 'bootstatus', device['udid'], '-b'],
                           check=True, timeout=180, stdout=log, stderr=subprocess.STDOUT)
        status['passed'] = True
    except Exception as error:
        status['error_type'] = type(error).__name__
        status['timed_out'] = isinstance(error, subprocess.TimeoutExpired)
        # Read only this disposable runner's selected device. Neither probe
        # changes simulator state or makes a failed boot acceptable.
        try:
            inventory = subprocess.run(['xcrun', 'simctl', 'list', 'devices', '--json'],
                                       capture_output=True, text=True, timeout=10, check=True)
            devices = json.loads(inventory.stdout)['devices']
            current = next(d for group in devices.values() for d in group if d['udid'] == device['udid'])
            status['fresh_device'] = {key: current.get(key) for key in ['udid', 'state', 'isAvailable']}
        except Exception as probe_error:
            status['state_probe_error_type'] = type(probe_error).__name__
        try:
            health = subprocess.run(['xcrun', 'simctl', 'getenv', device['udid'], 'SIMULATOR_UDID'],
                                    capture_output=True, text=True, timeout=10)
            status['health_probe'] = {'exit_code': health.returncode,
                                     'selected_device_responded': health.returncode == 0 and health.stdout.strip() == device['udid']}
        except Exception as probe_error:
            status['health_probe_error_type'] = type(probe_error).__name__
        raise
    finally:
        status['elapsed_seconds'] = round(time.monotonic() - started, 2)
        record('simulator-boot.json', status)


def export_results(bundle):
    # Keep raw CLI schema/results, diagnostics, and attachments even on test failure.
    status = {}
    commands = {
        'summary': ['get', 'test-results', 'summary', '--path', str(bundle)],
        'tests': ['get', 'test-results', 'tests', '--path', str(bundle)],
        'attachments': ['export', 'attachments', '--path', str(bundle), '--output-path', str(OUT / 'attachments')],
        'diagnostics': ['export', 'diagnostics', '--path', str(bundle), '--output-path', str(OUT / 'diagnostics')],
    }
    for name, args in commands.items():
        with (OUT / ('xcresult-' + name + '.log')).open('w') as log:
            result = subprocess.run(['xcrun', 'xcresulttool', *args], stdout=log, stderr=subprocess.STDOUT, timeout=60)
        status[name] = result.returncode
    record('xcresult-exports.json', status)
    return status


COMPOSER_PHASES = {
    'ComposerUIKitTests/testKeyboardOpenClosePreservesDraftAndToolbarAboveKeyboard()':
        ('keyboard-open', 'keyboard-reply-attachment', 'keyboard-closed'),
    'ComposerUIKitTests/testOrientationSafeAreaAndTextSizePreserveDraft()':
        ('landscape-150', 'portrait-150'),
}


def validate_composer_evidence(exports, summary, tree, attachments):
    assert all(exports[k] == 0 for k in ('summary', 'tests', 'attachments')), 'Native result/attachment export failed'
    assert summary['totalTestCount'] == 2 and summary['passedTests'] == 2 and summary['failedTests'] == 0, 'Both exact composer tests must execute and pass'
    tree = json.loads(tree) if isinstance(tree, str) else tree
    cases = []
    def visit(nodes):
        for node in nodes:
            if node.get('nodeType') == 'Test Case': cases.append(node)
            visit(node.get('children', []))
    visit(tree['testNodes'])
    assert len(cases) == 2 and {n['nodeIdentifier'] for n in cases} == set(COMPOSER_PHASES), 'Missing, duplicate or renamed composer method'
    assert all(n['result'] == 'Passed' for n in cases), 'Skipped or failed composer method'
    manifest = json.loads((attachments / 'manifest.json').read_text())
    assert isinstance(manifest, list), 'Unknown attachment manifest schema'
    for identifier, phases in COMPOSER_PHASES.items():
        groups = [g for g in manifest if g.get('testIdentifier') == identifier]
        assert len(groups) == 1, 'Missing or ambiguous method attachment binding: ' + identifier
        rows = groups[0]['attachments']
        def exported(label, suffixes):
            # Bind the XCTest attachment name to exporter metadata, never a loose directory scan.
            matches = [r for r in rows if re.match(r'^' + re.escape(label) + r'(?:[._]|$)', r['suggestedHumanReadableName'])
                       and Path(r['exportedFileName']).suffix.lower() in suffixes]
            assert len(matches) == 1, 'Missing or ambiguous attachment: ' + label
            path = (attachments / matches[0]['exportedFileName']).resolve()
            assert path.is_relative_to(attachments.resolve()) and path.is_file() and path.stat().st_size > 0, 'Invalid exported attachment path'
            return path
        for phase in phases:
            image = exported(phase, ('.png', '.jpg', '.jpeg'))
            raw = image.read_bytes()
            assert raw.startswith(b'\x89PNG\r\n\x1a\n') or raw.startswith(b'\xff\xd8\xff'), 'Screenshot is not image data'
            decoded = subprocess.check_output(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', str(image)], text=True, timeout=10)
            dimensions = [int(line.split(':', 1)[1]) for line in decoded.splitlines() if line.strip().startswith(('pixelWidth:', 'pixelHeight:'))]
            assert len(dimensions) == 2 and min(dimensions) > 0, 'Screenshot could not be decoded'
            metrics = json.loads(exported(phase + '-actual-UIKit-geometry', ('.json',)).read_text())
            native = metrics['native']
            assert all(isinstance(native['safeArea'][k], (int, float)) and native['safeArea'][k] >= 0 for k in ('top', 'bottom', 'left', 'right')), 'Missing native safe-area geometry'
            assert native['windowWidth'] > 0 and native['windowHeight'] > 0, 'Missing native window geometry'
            assert len(metrics['controls']) >= 2 and all(c['width'] >= 44 and c['height'] >= 44 and c['hit'] is True for c in metrics['controls']), 'Missing native control hit geometry'
            assert metrics['prompt']['height'] >= 24, 'Missing composer prompt geometry'
            if phase.startswith('keyboard-'):
                assert metrics['keyboardNotifications']['shows'] > 0 and metrics['keyboardFrame']['height'] > 100, 'Missing actual keyboard show evidence'
                if phase == 'keyboard-closed': assert metrics['keyboardNotifications']['hides'] > 0, 'Missing actual keyboard hide evidence'
            if phase == 'landscape-150': assert native['windowWidth'] > native['windowHeight'], 'Missing native landscape geometry'
            if phase == 'portrait-150': assert native['windowHeight'] > native['windowWidth'], 'Missing native portrait geometry'
    return 2


def main(scope):
    OUT.mkdir(exist_ok=True)
    source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    assert source == os.environ['EXPECTED_SOURCE'], 'Source checkout changed'
    devices = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', 'available', '--json'], text=True))
    record('simulator-inventory.json', devices)
    candidates = [(runtime, d) for runtime, rows in devices['devices'].items() if '.iOS-' in runtime for d in rows if d.get('isAvailable') and d['name'].startswith('iPhone')]
    assert candidates, 'No available iPhone simulator; no runtime download'
    runtime, device = max(candidates, key=lambda row: tuple(int(x) for x in row[0].rsplit('iOS-', 1)[-1].split('-')))
    destination = 'platform=iOS Simulator,id=' + device['udid']
    bundle = OUT / 'KindredCompanion.xcresult'
    command = ['xcodebuild', 'test', '-project', 'KindredCompanion.xcodeproj', '-scheme', 'KindredCompanion', '-destination', destination, '-destination-timeout', '90', '-parallel-testing-enabled', 'NO', '-maximum-concurrent-test-simulator-destinations', '1', '-resultBundlePath', str(bundle), 'CODE_SIGNING_ALLOWED=NO']
    if scope == 'composer':
        assert (ROOT / 'mobile/ios/KindredCompanionTests/ComposerUIKitTests.swift').is_file(), 'Reviewed composer tests missing'
        command += ['-only-testing:KindredCompanionTests/ComposerUIKitTests']
    receipt = {'source_commit': source, 'scope': scope, 'runtime': runtime, 'device': device, 'destination': destination, 'command': command, 'full_scheme_includes_AppModelSignInTests': scope == 'full', 'attempt': int(os.environ.get('GITHUB_RUN_ATTEMPT', '1')), 'automatic_retry': False, 'passed': False}
    record('test-receipt.json', receipt)
    fixture = None
    old_keyboard = None
    keyboard_changed = False
    started = time.monotonic()
    try:
        with tempfile.TemporaryDirectory(prefix='kindred-ios-fixture-') as private:
            if scope == 'composer':
                private = Path(private)
                config = private / 'openssl.cnf'
                config.write_text('[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:TRUE\n')
                key, cert = private / 'key.pem', private / 'cert.pem'
                with (OUT / 'fixture-certificate-generation.log').open('w') as log:
                    run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1', '-config', str(config), '-keyout', str(key), '-out', str(cert)], stdout=log, stderr=subprocess.STDOUT)
                key.chmod(0o600)
                with (OUT / 'fixture-server.log').open('w') as log:
                    fixture = subprocess.Popen(['node', str(ROOT / 'scripts/release/ios-composer-fixture.cjs'), str(cert), str(key)], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                context = ssl.create_default_context(cafile=str(cert))
                deadline = time.monotonic() + 20
                while True:
                    assert fixture.poll() is None, 'Fixture exited before readiness'
                    try:
                        with urllib.request.urlopen('https://localhost:8765/fixture/ready', context=context, timeout=2) as response:
                            ready = json.load(response)
                        break
                    except (OSError, TimeoutError):
                        if time.monotonic() >= deadline: raise RuntimeError('Fixture readiness deadline')
                        time.sleep(.25)
                assert ready['origin'] == 'https://localhost:8765'
                for name, digest in ready['ui_sha256'].items():
                    assert hashlib.sha256((ROOT / 'ui' / name).read_bytes()).hexdigest() == digest
                record('fixture-readiness.json', ready)
                old = subprocess.run(['defaults', 'read', 'com.apple.iphonesimulator', 'ConnectHardwareKeyboard'], capture_output=True, text=True, timeout=10)
                old_keyboard = old.stdout.strip() if old.returncode == 0 else None
                run(['defaults', 'write', 'com.apple.iphonesimulator', 'ConnectHardwareKeyboard', '-bool', 'false'])
                keyboard_changed = True
                actual = subprocess.check_output(['defaults', 'read', 'com.apple.iphonesimulator', 'ConnectHardwareKeyboard'], text=True).strip()
                assert actual == '0', 'Simulator keyboard preference did not apply'
                record('keyboard-setup.json', {'hardware_keyboard_connected': False, 'previous_preference': old_keyboard, 'native_keyboard_visibility_requires_test_evidence': True})
                boot_simulator(device)
                run(['open', '-a', 'Simulator', '--args', '-CurrentDeviceUDID', device['udid']])
            with (OUT / 'xcodebuild.log').open('w') as log:
                process = subprocess.Popen(command, cwd=ROOT / 'mobile/ios', stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                try:
                    receipt['exit_code'] = process.wait(timeout=850 if scope == 'full' else 720)
                except subprocess.TimeoutExpired:
                    receipt['timed_out'] = True
                    os.killpg(process.pid, signal.SIGTERM)
                    try: process.wait(timeout=10)
                    except subprocess.TimeoutExpired: os.killpg(process.pid, signal.SIGKILL); process.wait(timeout=10)
                receipt['passed'] = receipt.get('exit_code') == 0
            if bundle.is_dir():
                exports = export_results(bundle)
                if scope == 'composer':
                    summary = json.loads((OUT / 'xcresult-summary.log').read_text())
                    tree = (OUT / 'xcresult-tests.log').read_text()
                    receipt['native_test_count'] = validate_composer_evidence(exports, summary, tree, OUT / 'attachments')
            elif scope == 'composer':
                raise RuntimeError('Composer result bundle missing')
    except Exception as error:
        receipt['passed'] = False
        receipt['error'] = type(error).__name__ + ': ' + str(error)
    finally:
        try:
            if fixture is not None and fixture.poll() is None:
                fixture.terminate()
                try: fixture.wait(timeout=5)
                except subprocess.TimeoutExpired: fixture.kill(); fixture.wait(timeout=5)
        except Exception as error:
            receipt['fixture_cleanup_error'] = type(error).__name__ + ': ' + str(error)
            receipt['passed'] = False
        try:
            if keyboard_changed:
                restore = ['defaults', 'delete', 'com.apple.iphonesimulator', 'ConnectHardwareKeyboard'] if old_keyboard is None else ['defaults', 'write', 'com.apple.iphonesimulator', 'ConnectHardwareKeyboard', '-bool', 'true' if old_keyboard == '1' else 'false']
                restored = subprocess.run(restore, capture_output=True, text=True, timeout=10)
                receipt['keyboard_preference_restore_exit'] = restored.returncode
                if restored.returncode: receipt['passed'] = False
        except Exception as error:
            receipt['keyboard_restore_error'] = type(error).__name__ + ': ' + str(error)
            receipt['passed'] = False
        receipt['elapsed_seconds'] = round(time.monotonic() - started, 2)
        record('test-receipt.json', receipt)
    if not receipt['passed']: raise SystemExit('Simulator validation failed; retain evidence before any cause-based retry')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--scope', choices=['full', 'composer'], required=True)
    main(parser.parse_args().scope)
