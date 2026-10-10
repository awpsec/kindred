"""Run one unsigned simulator attempt; keep scoped composer evidence separate."""
import argparse, hashlib, json, math, os, re, signal, ssl, subprocess, tempfile, time, urllib.request
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
        ('keyboard-open', 'keyboard-reply-attachment', 'keyboard-closed') + tuple(
            'send-' + theme + '-' + draft + '-' + keyboard
            for theme in ('dark', 'light') for draft in ('empty', 'populated') for keyboard in ('closed', 'open')),
    'ComposerUIKitTests/testOrientationSafeAreaAndTextSizePreserveDraft()':
        ('landscape-150', 'portrait-150'),
    'ComposerUIKitTests/testNativeDictationComposerStatesKeepDraftAndKeyboard()': tuple(
        'dictation-' + theme + '-' + scale + '-' + keyboard + '-' + state
        for theme in ('dark', 'light') for scale in ('100', '150')
        for keyboard in ('closed', 'open') for state in ('empty', 'typing', 'dictating', 'stopped', 'cancelled')),
}

DICTATION_METHODS = {
    'NativeDictationTests/' + name + '()' for name in (
        'testCumulativePartialsFinalAndDuplicateFinal',
        'testPermissionDenialAndUnsupportedDoNotCapture',
        'testCancelledPermissionCannotStartOrEnterNewChat',
        'testStopFallbackAndBackgroundPreserveLastPreview',
        'testErrorLimitAndAudioFailureNeverReplay')

}


APPEARANCE_PHASES = {
    'AccountsAppearanceUIKitTests/' + method + '()': tuple(
        'accounts-' + theme + '-' + scale + '-' + state
        for theme in ('light', 'dark') for state in ('administrator', 'owner', 'user', 'unknown', 'signedOut', 'longTitleOwner'))
    for method, scale in (('testAccountsRolesLightDarkDefaultText', 'default'),
                          ('testAccountsRolesLightDarkAccessibilityText', 'ax'))
}


def validate_composer_evidence(exports, summary, tree, attachments, additional_methods=()):
    assert all(exports[k] == 0 for k in ('summary', 'tests', 'attachments')), 'Native result/attachment export failed'
    required_methods = set(COMPOSER_PHASES) | DICTATION_METHODS | set(additional_methods)
    assert summary['totalTestCount'] == len(required_methods) and summary['passedTests'] == len(required_methods) and summary['failedTests'] == 0, 'All exact composer and injected lifecycle tests must execute and pass'
    tree = json.loads(tree) if isinstance(tree, str) else tree
    cases = []
    def visit(nodes):
        for node in nodes:
            if node.get('nodeType') == 'Test Case': cases.append(node)
            visit(node.get('children', []))
    visit(tree['testNodes'])
    assert len(cases) == len(required_methods) and {n['nodeIdentifier'] for n in cases} == required_methods, 'Missing, duplicate or renamed composer method'
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
            if phase.startswith(('send-', 'dictation-')):
                assert metrics['keyboardVisible'] is ('-open' in phase), 'Wrong observed native keyboard state'
                assert metrics['nativeReduceMotion'] is True, 'Observed OS Reduce Motion was not enabled'
                if '-open' in phase:
                    assert metrics['keyboardNotifications']['shows'] > 0 and metrics['keyboardFrame']['height'] > 100, 'Missing actual matrix keyboard show evidence'
            if phase.startswith('dictation-'):
                assert metrics['primarySurface']['theme'] == phase.split('-')[1], 'Wrong dictation theme'
                assert abs(metrics['layout']['textScale'] - (1.5 if '-150-' in phase else 1)) <= .01, 'Wrong dictation text scale'
                state = phase.rsplit('-', 1)[1]
                measured = metrics['dictationState']
                assert measured['sendCount'] == 0 and measured['reducedMotion'] is True, 'Dictation sent a message or lacks actual reduced motion'
                assert measured['draftPresent'] is (state != 'empty'), 'Wrong measured dictation draft state'
                active = state == 'dictating'
                assert metrics['nativeSpeechOperationActive'] is active and measured['transientSpan'] is active and measured['dictating'] is active, 'Wrong measured native dictation operation/editor state'
                assert metrics['nativeSpeechPhase'] == ('recording' if active else 'idle'), 'Wrong native speech coordinator phase'
                if state in ('dictating', 'stopped', 'cancelled'):
                    event = measured['lastEvent']
                    assert event['phase'] == {'dictating':'partial','stopped':'stopped','cancelled':'cancelled'}[state], 'Missing actual typed bridge event for dictation state'
                    assert type(event['sequence']) is int and event['sequence'] > 0 and type(event['textLength']) is int and event['textLength'] > 0, 'Missing bounded bridge event metadata'
            if phase.startswith('send-'):
                paint = json.loads(exported(phase + '-painted-primarySurface', ('.json',)).read_text())
                surface = paint['primarySurface']
                assert surface == metrics['primarySurface'], 'Paint and geometry describe different primary controls'
                empty = '-empty-' in phase
                assert surface['selector'] == ('.dictation-button' if empty else '#send') and surface['controlKind'] == ('microphone' if empty else 'send'), 'Wrong actual primary control for supported iOS draft state'
                capability = surface['capability']
                assert capability['supported'] is True and capability['onDeviceAvailable'] is True and capability['engine'] == 'apple-on-device', 'Missing injected native supported capability; not real recognition proof'
                assert surface['theme'] == phase.split('-')[1] and surface['hidden'] is False and surface['appearance'] == 'none', 'Incorrect Send appearance state'
                assert surface['edgeHits'] == [True] * 4, 'Missing outer Send target hits'
                def number(value):
                    assert type(value) in (int, float) and math.isfinite(value), 'Invalid native paint number'
                    return value
                target, arrow, circle = surface['target'], surface['arrow'], surface['paint']
                for key in ('width', 'height'):
                    assert abs(number(target[key]) - 44) <= .5 and abs(number(arrow[key]) - 20) <= .5 and abs(number(circle[key]) - 36) <= .5, 'Wrong Send target/arrow/paint size'
                for key in ('left', 'top'):
                    assert abs(number(circle[key]) - 4) <= .5, 'Uncentered painted circle'
                for key in ('x', 'y'):
                    assert abs(number(arrow[key]) + 10 - number(target[key]) - 22) <= .5, 'Uncentered Send arrow'
                rgba = circle['rgba']; opacity = number(surface['opacity'])
                assert len(rgba) == 4 and rgba[3] == 255 and all(0 <= number(c) <= 255 for c in rgba) and 0 <= opacity <= 1, 'Invalid Send colour/opacity'
                probes = paint['nativeBitmapProbes']
                assert len(probes) == 4 and {tuple(p['direction']) for p in probes} == {(1,0),(-1,0),(0,1),(0,-1)}, 'Missing cardinal native bitmap probes'
                for probe in probes:
                    inside, outside, expected = probe['inside'], probe['outside'], probe['expected']
                    assert len(inside) >= 3 and len(outside) >= 3 and len(expected) == 3, 'Missing bitmap colour components'
                    computed = [opacity * number(rgba[i]) + (1-opacity) * number(outside[i]) for i in range(3)]
                    assert all(abs(number(expected[i]) - computed[i]) <= .01 for i in range(3)), 'Incorrect bitmap compositing evidence'
                    assert max(abs(computed[i] - number(outside[i])) for i in range(3)) > 12, 'Paint indistinguishable from surrounding bitmap'
                    assert max(abs(number(inside[i]) - computed[i]) for i in range(3)) <= 12, 'Native bitmap does not show Send paint'
                if phase.endswith('-open'):
                    assert metrics['keyboardNotifications']['shows'] > 0 and metrics['keyboardFrame']['height'] > 100, 'Missing Send matrix keyboard show evidence'
            if phase == 'landscape-150': assert native['windowWidth'] > native['windowHeight'], 'Missing native landscape geometry'
            if phase == 'portrait-150': assert native['windowHeight'] > native['windowWidth'], 'Missing native portrait geometry'
    return len(required_methods)


def _simulator_command(argv, timeout, row):
    """Measure spawn/wait separately; clean only this command's new session."""
    started = time.monotonic()
    row.update(process_phase='spawn', cleanup={'kill_attempted': False, 'reaped': False})
    with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
        try:
            process = subprocess.Popen(argv, stdout=stdout, stderr=stderr, start_new_session=True)
        finally:
            row['spawn_seconds'] = round(time.monotonic() - started, 3)
        row.update(pid=process.pid, spawn_seconds=round(time.monotonic() - started, 3), process_phase='wait')
        waited = time.monotonic()
        original = None
        try:
            remaining = timeout - (waited - started)
            if remaining <= 0:
                raise subprocess.TimeoutExpired(argv, timeout)
            process.wait(timeout=remaining)
            row['cleanup']['reaped'] = True
        except subprocess.TimeoutExpired:
            original = subprocess.TimeoutExpired(argv, timeout)
            row['process_phase'] = 'cleanup'
            row['cleanup']['kill_attempted'] = True
            cleanup_started = time.monotonic()
            try:
                os.killpg(process.pid, signal.SIGKILL)
                row['cleanup']['kill_succeeded'] = True
            except ProcessLookupError:
                row['cleanup']['kill_succeeded'] = False
            except OSError as error:
                row['cleanup']['error_type'] = type(error).__name__
            try:
                process.wait(timeout=2)
                row['cleanup']['reaped'] = True
            except Exception as error:
                row['cleanup']['reap_error_type'] = type(error).__name__
            row['cleanup']['elapsed_seconds'] = round(time.monotonic() - cleanup_started, 3)
        finally:
            row['wait_seconds'] = round(time.monotonic() - waited, 3)
        # Regular files avoid waiting for inherited stdout/stderr pipe EOF.
        stdout.seek(0); stderr.seek(0)
        out = stdout.read().decode('utf-8', errors='replace')
        err = stderr.read().decode('utf-8', errors='replace')
        if original is not None:
            original.output, original.stderr = out, err
            raise original
        result = subprocess.CompletedProcess(argv, process.returncode, out, err)
        result.check_returncode()
        return result


def _reduce_motion_command(phase, argv, timeout, status, retain_output=True):
    """Capture only selected-simulator setup/probe output, never environment."""
    started = time.monotonic()
    row = {'phase': phase, 'command': argv, 'deadline_seconds': timeout}
    stdout = stderr = ''
    def text(value):
        return value.decode('utf-8', errors='replace') if isinstance(value, bytes) else (value or '')
    try:
        result = _simulator_command(argv, timeout=timeout, row=row)
        row.update(status='success', exit_code=result.returncode)
        stdout, stderr = text(result.stdout), text(result.stderr)
        return result
    except Exception as error:
        row.update(status='timeout' if isinstance(error, subprocess.TimeoutExpired) else ('nonzero' if isinstance(error, subprocess.CalledProcessError) else 'error'),
                   error_type=type(error).__name__, exit_code=getattr(error, 'returncode', None))
        stdout, stderr = text(getattr(error, 'output', None)), text(getattr(error, 'stderr', None))
        raise
    finally:
        row['elapsed_seconds'] = round(time.monotonic() - started, 3)
        # Inventory is filtered to the selected device by the caller; do not
        # retain the full list, its paths, or unrelated simulator metadata.
        if retain_output:
            row.update(stdout=stdout, stderr=stderr)
        else:
            row.update(stdout_bytes=len(stdout.encode()), stderr_bytes=len(stderr.encode()))
        status['commands'].append(row)


def _reduce_motion_failure_probes(device, status):
    deadline = time.monotonic() + 15
    prefix = ['xcrun', 'simctl']
    probes = (
        ('state', prefix + ['list', 'devices', '--json']),
        ('health', prefix + ['getenv', device['udid'], 'SIMULATOR_UDID']),
        ('preference', prefix + ['spawn', device['udid'], 'defaults', 'read', 'com.apple.Accessibility', 'ReduceMotionEnabled']),
    )
    status['probe_total_budget_seconds'] = 15
    status['probes'] = {}
    for name, argv in probes:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            status['probes'][name] = {'status': 'budget_exhausted'}
            continue
        try:
            result = _reduce_motion_command('probe-' + name, argv, min(5, remaining), status, retain_output=name != 'state')
            if name == 'state':
                rows = [d for group in json.loads(result.stdout)['devices'].values() for d in group if d.get('udid') == device['udid']]
                assert len(rows) == 1, 'Selected simulator not uniquely represented'
                status['probes'][name] = {'status': 'success', 'selected_device': {k: rows[0].get(k) for k in ('udid', 'state', 'isAvailable')}}
            elif name == 'health':
                matches = result.stdout.strip() == device['udid']
                status['probes'][name] = {'status': 'success' if matches else 'wrong_device', 'selected_device_responded': matches}
            else:
                value = result.stdout.strip()
                status['probes'][name] = {'status': 'success' if value in ('0', '1') else 'unavailable',
                                         'enabled': value == '1' if value in ('0', '1') else None}
        except Exception as probe_error:
            status['probes'][name] = {'status': 'unavailable', 'error_type': type(probe_error).__name__}


def _record_reduce_motion_status(status, started):
    status['elapsed_seconds'] = round(time.monotonic() - started, 3)
    (OUT / 'reduce-motion-setup.log').write_text(''.join(
        row['phase'] + '\nstdout:\n' + row.get('stdout', '[selected inventory filtered]') +
        '\nstderr:\n' + row.get('stderr', '[selected inventory filtered]') + '\n'
        for row in status['commands']))
    record('reduce-motion-setup.json', status)


def validate_release_ui_evidence(exports, summary, tree, attachments):
    count = validate_composer_evidence(exports, summary, tree, attachments, APPEARANCE_PHASES)
    manifest = json.loads((attachments / 'manifest.json').read_text())
    heights = {}
    sizes = {}
    launch_ids = set()
    def numeric(value):
        assert type(value) in (int, float) and math.isfinite(value), 'Invalid native appearance number'
        return value
    for method, phases in APPEARANCE_PHASES.items():
        groups = [g for g in manifest if g.get('testIdentifier') == method]
        assert len(groups) == 1, 'Missing or duplicate appearance method attachments'
        rows = groups[0]['attachments']
        for phase in phases:
            def attachment(label, suffixes):
                found = [r for r in rows if re.match(r'^' + re.escape(label) + r'(?:[._]|$)', r['suggestedHumanReadableName'])
                         and Path(r['exportedFileName']).suffix.lower() in suffixes]
                assert len(found) == 1, 'Missing or ambiguous appearance attachment: ' + label
                path = (attachments / found[0]['exportedFileName']).resolve()
                assert path.is_relative_to(attachments.resolve()) and path.is_file() and path.stat().st_size > 0, 'Invalid appearance attachment path'
                return path
            image = attachment(phase + '-screenshot', ('.png', '.jpg', '.jpeg'))
            raw = image.read_bytes()
            assert raw.startswith(b'\x89PNG\r\n\x1a\n') or raw.startswith(b'\xff\xd8\xff'), 'Invalid native appearance image'
            decoded = subprocess.check_output(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', str(image)], text=True, timeout=10)
            dimensions = [int(line.split(':', 1)[1]) for line in decoded.splitlines() if line.strip().startswith(('pixelWidth:', 'pixelHeight:'))]
            assert len(dimensions) == 2 and min(dimensions) > 0, 'Native appearance image did not decode'
            metrics = json.loads(attachment(phase + '-geometry', ('.json',)).read_text())
            _, theme, scale, state = phase.split('-')
            assert metrics['schemaVersion'] == 2 and metrics['phase'] == phase and metrics['scenario'] == state, 'Wrong appearance phase binding'
            assert metrics['theme'] == theme and metrics['textSize'] == scale, 'Wrong native appearance requested traits'
            import uuid
            launch = metrics['expectedLaunchID']
            assert isinstance(launch, str) and str(uuid.UUID(launch)).lower() == launch.lower(), 'Invalid native appearance launch identity'
            assert launch not in launch_ids, 'Reused native appearance launch identity'
            launch_ids.add(launch)
            host = metrics['measuredHost']
            assert isinstance(host, dict) and host['launchID'] == launch and metrics['launchID'] == launch, 'Stale native appearance host launch'
            host_keys = ('phase', 'scenario', 'theme', 'textSize', 'requestedCategory', 'observedCategory', 'observedInterfaceStyle', 'nativeBodyPointSize', 'nativeBodyFontName', 'safeArea', 'windowBounds', 'nativeReduceMotion', 'nativeDarkerColors', 'hostAttached', 'windowIsKey', 'windowHidden', 'orientation', 'role', 'signedIn', 'apiPaths')
            assert all(host[k] == metrics[k] for k in host_keys), 'Native host measurement projection mismatch'
            assert metrics['accessibilityMeasurement'] == 'XCUIElementQuery; no in-process UIView traversal', 'Wrong native accessibility provenance'
            assert metrics['hostMeasurement'] == 'DEBUG app-host telemetry; separately measured native traits/font/safeArea', 'Wrong native host provenance'
            assert metrics['coordinateSpace'] == 'XCUI row/window frames in screen coordinates; native window safeArea is edge distances', 'Wrong native appearance coordinate space'
            assert metrics['screenshotSource'] == 'XCUIApplication.screenshot of this launch; not drawHierarchy', 'Wrong native screenshot provenance'
            assert all(type(metrics[k]) is int and metrics[k] == 1 for k in ('rowQueryCount', 'telemetryQueryCount', 'notificationsQueryCount', 'currentAccountQueryCount')), 'Missing or duplicate native appearance query'
            assert all(numeric(metrics['screenshotSize'][k]) > 0 for k in ('width', 'height')), 'Missing native screenshot dimensions'
            category = 'UICTContentSizeCategoryL' if scale == 'default' else 'UICTContentSizeCategoryAccessibilityXXXL'
            assert metrics['requestedCategory'] == category and metrics['observedCategory'] == category, 'Native text trait mismatch'
            assert metrics['observedInterfaceStyle'] == (1 if theme == 'light' else 2), 'Native theme trait mismatch'
            assert all(metrics[k] is True for k in ('windowIsKey', 'hostAttached', 'appRunningForeground', 'screenshotCaptured', 'nativeReduceMotion')), 'Native appearance host/effect/render missing'
            assert metrics['windowHidden'] is False and numeric(metrics['stableSamples']) >= 2, 'Native appearance row did not settle'
            assert numeric(metrics['nativeBodyPointSize']) > 0 and isinstance(metrics['nativeBodyFontName'], str) and metrics['nativeBodyFontName'], 'Native system font measurement missing'
            assert numeric(metrics['orientation']) in (1, 2, 3, 4), 'Native orientation missing'
            assert type(metrics['nativeDarkerColors']) is bool and isinstance(metrics['proofScope'], str) and metrics['proofScope'], 'Native appearance observation scope missing'
            assert not any(family in metrics['nativeBodyFontName'].lower() for family in ('inter', 'manrope', 'dm sans')), 'Mobile body font is not the requested system font'
            signed_in = state != 'signedOut'
            assert metrics['signedIn'] is signed_in, 'Native sign-in state mismatch'
            expected = 'Administrator' if state == 'administrator' else ('Owner, administrator' if state in ('owner', 'longTitleOwner') else 'none')
            assert metrics['expectedRoleLabel'] == expected, 'Wrong expected native role label'
            if state != 'signedOut':
                expected_role = 'administrator' if state == 'administrator' else ('owner' if state in ('owner', 'longTitleOwner') else 'none')
                assert metrics['role'] == expected_role, 'Native observed role mismatch'
            label = metrics['rowLabel']
            records = metrics['accessibility']
            assert isinstance(label, str) and label and isinstance(records, list), 'Native accessible row missing'
            assert any(r.get('label') == label and r.get('frame') == metrics['rowFrame'] for r in records), 'Native queried row not represented in accessibility evidence'
            for key, expected_query_label in (('notificationsQuery', 'Notifications on'), ('currentAccountQuery', 'Current account')):
                query = metrics[key]
                assert isinstance(query, list) and len(query) == 1 and query[0]['label'] == expected_query_label, 'Missing actual native icon query'
                assert any(r.get('label') == query[0]['label'] and r.get('frame') == query[0]['frame'] for r in records), 'Native icon query not represented in accessibility evidence'
                assert all(numeric(query[0]['frame'][k]) > 0 for k in ('width', 'height')), 'Invalid native queried icon bounds'
            if expected != 'none':
                assert expected in label, 'Native role badge label missing'
            else:
                assert all('administrator' not in r['label'].lower() for r in records), 'Unexpected native administrator label'
            assert any('Notifications on' in r['label'] for r in records) and any('Current account' in r['label'] for r in records), 'Native bell/check accessibility evidence missing'
            paths = metrics['apiPaths']
            assert isinstance(paths, list) and all(x == 'GET /identity/profiles' for x in paths), 'Unexpected native appearance API write/path'
            assert bool(paths) is signed_in, 'Native identity request state mismatch'
            window, row, safe = metrics['xcuiWindowFrame'], metrics['rowFrame'], metrics['safeArea']
            assert all(abs(numeric(window[k]) - numeric(host['windowBounds'][k])) <= 1 for k in ('x', 'y', 'width', 'height')), 'Native and XCUI window coordinate mismatch'
            for box in (window, row):
                assert all(numeric(box[k]) >= 0 for k in ('x', 'y')) and all(numeric(box[k]) > 0 for k in ('width', 'height')), 'Invalid native appearance bounds'
            assert all(numeric(safe[k]) >= 0 for k in ('top', 'bottom', 'left', 'right')), 'Invalid native appearance safe area'
            assert row['x'] >= window['x'] and row['x'] + row['width'] <= window['x'] + window['width'] + 1, 'Native row clipped horizontally'
            assert row['y'] >= window['y'] + safe['top'] and row['y'] + row['height'] <= window['y'] + window['height'] - safe['bottom'] + 1, 'Native row clipped vertically'
            if state != 'longTitleOwner': heights.setdefault((theme, scale), []).append(row['height'])
            sizes.setdefault(scale, []).append(metrics['nativeBodyPointSize'])
    assert all(max(v) - min(v) <= 1 for v in heights.values()), 'Role badge changes native row height'
    assert min(sizes['ax']) > max(sizes['default']), 'Native accessibility text size did not increase'
    return count


def wait_for_simulator_transport(device):
    """One bounded selected-device response after boot; no sleep or retry."""
    status = {'selected_device': device['udid'], 'passed': False, 'commands': [],
              'deadline_seconds': 60, 'response_is_native_effect_proof': False}
    try:
        result = _reduce_motion_command('readiness',
            ['xcrun', 'simctl', 'getenv', device['udid'], 'SIMULATOR_UDID'], 60, status)
        assert result.stdout.strip() == device['udid'], 'Selected simulator transport returned wrong identity'
        status['passed'] = True
    except Exception as error:
        status['error_type'] = type(error).__name__
        try:
            record('simulator-transport-readiness.json', status)
        except Exception:
            pass
        raise
    else:
        record('simulator-transport-readiness.json', status)


def configure_simulator_reduce_motion(device):
    """Keep the same setup budget/gate; diagnose failure without replacing it."""
    started = time.monotonic()
    prefix = ['xcrun', 'simctl', 'spawn', device['udid'], 'defaults']
    status = {'selected_device': device['udid'], 'phase': 'write', 'passed': False, 'commands': [],
              'requested_enabled': True, 'native_UIAccessibility_observation_required': True,
              'preference_readback_is_native_runtime_proof': False}
    try:
        _reduce_motion_command('write', prefix + ['write', 'com.apple.Accessibility', 'ReduceMotionEnabled', '-bool', 'true'], 10, status)
        status['phase'] = 'read'
        result = _reduce_motion_command('read', prefix + ['read', 'com.apple.Accessibility', 'ReduceMotionEnabled'], 10, status)
        observed = result.stdout.strip()
        status['preference_readback'] = observed
        assert observed == '1', 'Selected simulator Reduce Motion preference did not read back'
        status['passed'] = True
    except Exception as original_error:
        status['error_type'] = type(original_error).__name__
        try:
            _reduce_motion_failure_probes(device, status)
        except Exception as diagnostic_error:
            status['diagnostic_error_type'] = type(diagnostic_error).__name__
        try:
            _record_reduce_motion_status(status, started)
        except Exception:
            # Receipt I/O failure must not hide the original setup failure.
            pass
        raise
    else:
        _record_reduce_motion_status(status, started)



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
    if scope in ('composer', 'release-ui'):
        assert (ROOT / 'mobile/ios/KindredCompanionTests/ComposerUIKitTests.swift').is_file(), 'Reviewed composer tests missing'
        command += ['-only-testing:KindredCompanionTests/ComposerUIKitTests'] + [
            '-only-testing:KindredCompanionTests/' + name.removesuffix('()')
            for name in sorted(DICTATION_METHODS)]
    if scope == 'release-ui':
        assert (ROOT / 'mobile/ios/KindredCompanionUITests/AccountsAppearanceUIKitTests.swift').is_file(), 'Reviewed native appearance tests missing'
        command += ['-only-testing:KindredCompanionUITests/AccountsAppearanceUIKitTests']
    receipt = {'source_commit': source, 'scope': scope, 'runtime': runtime, 'device': device, 'destination': destination, 'command': command, 'full_scheme_includes_AppModelSignInTests': scope == 'full', 'attempt': int(os.environ.get('GITHUB_RUN_ATTEMPT', '1')), 'automatic_retry': False, 'passed': False}
    if scope in ('composer', 'release-ui'):
        receipt.update(required_methods=sorted(set(COMPOSER_PHASES) | DICTATION_METHODS), required_native_phases=53, real_Apple_recognition_selected=False, real_audio_test_excluded=True, injectable_lifecycle_is_recognition_proof=False)
    if scope == 'release-ui':
        receipt.update(required_methods=sorted(set(COMPOSER_PHASES) | DICTATION_METHODS | set(APPEARANCE_PHASES)), required_native_phases=77, required_appearance_pairs=24, visual_bitmap_acceptance_requires_independent_review=True)
    record('test-receipt.json', receipt)
    fixture = None
    old_keyboard = None
    keyboard_changed = False
    started = time.monotonic()
    try:
        with tempfile.TemporaryDirectory(prefix='kindred-ios-fixture-') as private:
            if scope in ('composer', 'release-ui'):
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
                wait_for_simulator_transport(device)
                configure_simulator_reduce_motion(device)
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
                if scope in ('composer', 'release-ui'):
                    summary = json.loads((OUT / 'xcresult-summary.log').read_text())
                    tree = (OUT / 'xcresult-tests.log').read_text()
                    validator = validate_release_ui_evidence if scope == 'release-ui' else validate_composer_evidence
                    receipt['native_test_count'] = validator(exports, summary, tree, OUT / 'attachments')
            elif scope in ('composer', 'release-ui'):
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
    parser.add_argument('--scope', choices=['full', 'composer', 'release-ui'], required=True)
    main(parser.parse_args().scope)
