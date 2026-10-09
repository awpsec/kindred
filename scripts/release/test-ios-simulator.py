"""Run one unsigned simulator attempt; keep scoped composer evidence separate."""
import argparse, hashlib, json, os, signal, ssl, subprocess, tempfile, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'ios-validation'


def run(argv, **kwargs):
    return subprocess.run(argv, check=True, timeout=90, **kwargs)


def record(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')


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


def validate_composer_evidence(exports, summary, tree, attachments):
    assert exports['summary'] == 0 and exports['tests'] == 0 and exports['attachments'] == 0, 'Native result/attachment export failed'
    assert summary['totalTestCount'] > 0 and summary['passedTests'] == summary['totalTestCount'] and summary['failedTests'] == 0, 'Composer tests did not execute and pass'
    assert 'ComposerUIKitTests' in tree, 'Selected native class not represented in xcresult'
    assert any(f.suffix.lower() in ('.png', '.jpg', '.jpeg') and f.stat().st_size > 0 for f in attachments.rglob('*') if f.is_file()), 'Native screenshots were not exported'
    return summary['totalTestCount']


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
                if device['state'] != 'Booted': run(['xcrun', 'simctl', 'boot', device['udid']])
                run(['xcrun', 'simctl', 'bootstatus', device['udid'], '-b'])
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
