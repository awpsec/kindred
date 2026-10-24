"""One selected, microphone-free iOS simulator attempt. No runtime/SDK download."""
import argparse
import hashlib
import json
import os
import plistlib
from pathlib import Path
import re
import shutil
import signal
import subprocess
import time
import tomllib

METHODS = (
    'testCumulativePartialsFinalAndDuplicateFinal',
    'testPermissionDenialAndUnsupportedDoNotCapture',
    'testCancelledPermissionCannotStartOrEnterNewChat',
    'testStopFallbackAndBackgroundPreserveLastPreview',
    'testErrorLimitAndAudioFailureNeverReplay',
    'testPauseStartsNewHypothesisWithoutReplacingEarlierSpeech',
    'testAccumulatedTranscriptLimitKeepsLastValidDraft',
)
DEVELOPER = '/Applications/Xcode_27.1.app/Contents/Developer'
RESOURCE_PATHS = (
    'mobile/ios/KindredCompanion/Web/MobileLayout.js',
    'mobile/ios/KindredCompanion/Web/MobileLayout.css',
    'mobile/ios/KindredCompanion/Speech/NativeDictation.swift',
    'mobile/ios/Packages/KindredCore/Sources/KindredCore/DictationTranscript.swift',
    'mobile/ios/KindredCompanionTests/NativeDictationTests.swift',
    'mobile/ios/Packages/KindredCore/Tests/KindredCoreTests/DictationTranscriptTests.swift',
    'mobile/ios/KindredCompanion/Views/RootView.swift',
    'mobile/ios/KindredCompanion/Web/WebSession.swift',
    'mobile/ios/KindredCompanion/Web/WebContainerView.swift',
    'mobile/ios/project.yml',
    'mobile/ios/Packages/KindredCore/Package.swift',
    'ui/mobile-messages.js',
)


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return {'bytes': path.stat().st_size, 'sha256': h.hexdigest()}


def pick_device(runtimes, devices):
    available = {r['identifier']: r for r in runtimes['runtimes']
                 if r.get('isAvailable') is True and '.iOS-' in r.get('identifier', '')}
    candidates = []
    for runtime, rows in devices['devices'].items():
        if runtime not in available:
            continue
        # Bound this selected proposal to the documented ordinary iOS27.0 runtime.
        # A Duo/27.1 inventory is retained, but cannot silently change test scope.
        if available[runtime].get('version') != '27.0':
            continue
        for d in rows:
            if d.get('isAvailable') is True and d.get('name', '').startswith('iPhone') and 'Duo' not in d['name']:
                candidates.append((d['name'], d['udid'], runtime, d))
    if not candidates:
        raise ValueError('capability:no-installed-ordinary-iPhone-iOS27.0-runtime')
    _, _, runtime, device = sorted(candidates)[0]
    return runtime, device


def require_core_tests(log, expected):
    passed = []
    for identity in re.findall(r"Test Case '([^']+)' passed", log):
        # Foundation XCTest formats identifiers differently on Darwin and Linux.
        if identity.startswith('-[') and identity.endswith(']'):
            name = identity[2:-1].split(' ')[-1]
        else:
            name = identity.rsplit('.', 1)[-1]
        passed.append(name.removesuffix('()'))
    if set(passed) != set(expected) or len(passed) != len(expected):
        raise ValueError('core-test-execution-set-mismatch')
    if not re.search(r'Executed ' + str(len(expected)) + r' tests?, with 0 failures', log):
        raise ValueError('core-test-summary-mismatch')


def require_native_tests(tree, summary):
    observed = {}
    def visit(node):
        if isinstance(node, dict):
            if node.get('nodeType') == 'Test Case':
                identity = node.get('nodeIdentifier', '')
                name = identity.split('/')[-1].removesuffix('()')
                if not identity.startswith('NativeDictationTests/') or name not in METHODS or name in observed:
                    raise ValueError('unexpected-or-duplicate-native-test')
                observed[name] = node.get('result')
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for value in node:
                visit(value)
    visit(tree)
    if set(observed) != set(METHODS) or set(observed.values()) != {'Passed'}:
        raise ValueError('native-selected-test-set-not-all-passed')
    counts = {'totalTestCount': 7, 'passedTests': 7, 'failedTests': 0, 'skippedTests': 0}
    if any(type(summary.get(k)) is not int or summary[k] != v for k, v in counts.items()):
        raise ValueError('native-test-summary-not-seven-passed-zero-failed-skipped')
    return observed


class Attempt:
    def __init__(self, product, tool, output):
        self.product, self.tool, self.out = product, tool, output
        self.out.mkdir(exist_ok=False)
        self.deadline = time.monotonic() + 960  # 16min shared across every command.
        self.env = dict(os.environ)
        for key in ('KINDRED_TEST_SPEECH_AUDIO_FILE', 'TEST_RUNNER_KINDRED_TEST_SPEECH_AUDIO_FILE',
                    'KINDRED_TEST_SPEECH_EXPECTED_PHRASES', 'TEST_RUNNER_KINDRED_TEST_SPEECH_EXPECTED_PHRASES'):
            self.env.pop(key, None)
        self.env.update(DEVELOPER_DIR=DEVELOPER, HOMEBREW_NO_AUTO_UPDATE='1',
                        HOMEBREW_NO_INSTALL_CLEANUP='1', SWIFTPM_MAX_CONCURRENT_OPERATIONS='1')
        self.commands = []

    def record(self, name, data):
        (self.out / (name + '.json')).write_text(json.dumps(data, indent=2) + '\n')

    def run(self, name, argv, maximum=60, cwd=None):
        timeout = min(maximum, self.deadline - time.monotonic())
        if timeout <= 0:
            raise TimeoutError('shared-native-deadline-exhausted')
        start = time.monotonic()
        receipt = {'name': name, 'argv': [str(a) for a in argv], 'timeout_seconds': timeout,
                   'cwd': str(cwd or self.product), 'exit_code': None, 'timed_out': False}
        process = None
        try:
            with (self.out / (name + '.stdout')).open('xb') as stdout, (self.out / (name + '.stderr')).open('xb') as stderr:
                process = subprocess.Popen(argv, cwd=cwd or self.product, env=self.env,
                                           stdout=stdout, stderr=stderr, start_new_session=True)
                try:
                    receipt['exit_code'] = process.wait(timeout=timeout)
                except subprocess.TimeoutExpired:
                    receipt['timed_out'] = True
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        pass
                    # Reap owned descendants even if their group leader exited.
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    process.wait(timeout=5)
                    receipt['exit_code'] = process.returncode
                    raise
            if receipt['exit_code'] != 0:
                raise RuntimeError('command-failed:' + name)
            return (self.out / (name + '.stdout')).read_text()
        finally:
            receipt['elapsed_seconds'] = time.monotonic() - start
            self.commands.append(receipt)
            self.record('commands', self.commands)

    def sources(self):
        return {p: digest(self.product / p) for p in RESOURCE_PATHS}

    def main(self):
        source, pin, tool_commit = (os.environ[k] for k in ('EXPECTED_SOURCE', 'EXTERNAL_PIN_SHA256', 'EXPECTED_TOOL'))
        assert re.fullmatch('[0-9a-f]{40}', source) and re.fullmatch('[0-9a-f]{40}', tool_commit)
        assert re.fullmatch('[0-9a-f]{64}', pin)
        assert os.environ.get('GITHUB_RUN_ATTEMPT') == '1', 'No automatic or workflow rerun selected'
        assert self.run('product-head', ['git', 'rev-parse', 'HEAD']).strip() == source
        assert not self.run('product-clean', ['git', 'status', '--porcelain']).strip()
        assert self.run('tool-head', ['git', 'rev-parse', 'HEAD'], cwd=self.tool).strip() == tool_commit
        assert not self.run('tool-clean', ['git', 'status', '--porcelain'], cwd=self.tool).strip()
        version = tomllib.loads((self.product / 'desktop/Cargo.toml').read_text())['package']['version']
        assert version == '0.87.3', 'product-version-not-selected0873'
        before = self.sources()
        self.record('source-before', before)
        self.record('binding', {'product_source': source, 'tool_source': tool_commit,
            'external_pin_sha256': pin, 'external_pin_content_verified_here': False,
            'pin_binding_requires_selected_Builder_preinvoke_receipt': True,
            'script': digest(Path(__file__).resolve()),
            'image_os': os.environ.get('ImageOS'), 'image_version': os.environ.get('ImageVersion'),
            'unsigned_simulator_only': True, 'microphone_free_hooks_only': True})
        assert Path(DEVELOPER).is_dir(), 'capability:documented-Xcode27.1-directory-absent'
        self.run('host', ['sw_vers'])
        version = self.run('xcode', ['xcodebuild', '-version'])
        assert re.search(r'Xcode 27\.1\b', version) and '27A9275' in version, 'capability:Xcode-identity-drift'
        self.run('sdk-inventory', ['xcodebuild', '-showsdks'])
        sdk = self.run('sim-sdk-version', ['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-version']).strip()
        assert sdk == '27.1', 'capability:simulator-SDK-not-selected27.1'
        self.run('sim-sdk-path', ['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-path'])
        self.run('swift', ['swift', '--version'])
        runtimes = json.loads(self.run('runtimes', ['xcrun', 'simctl', 'list', 'runtimes', '--json']))
        devices = json.loads(self.run('devices', ['xcrun', 'simctl', 'list', 'devices', 'available', '--json']))
        self.run('device-types', ['xcrun', 'simctl', 'list', 'devicetypes', '--json'])
        runtime, device = pick_device(runtimes, devices)
        self.record('selected-destination', {'runtime': runtime, 'device': device,
             'Duo_proof': False, 'runtime27_1_proof': False, 'physical_phone_proof': False})
        xcodegen = shutil.which('xcodegen')
        if not xcodegen:
            # Existing workflow generator setup, explicitly included for review.
            self.run('xcodegen-install', ['brew', 'install', 'xcodegen'], maximum=180)
            xcodegen = shutil.which('xcodegen')
        assert xcodegen, 'capability:XcodeGen-unavailable'
        self.run('xcodegen-version', [xcodegen, '--version'])
        self.run('generate', [xcodegen, 'generate', '--spec', 'mobile/ios/project.yml'])
        for klass, count in (('DictationTranscriptTests', 11), ('DictationTests', 10)):
            path = self.product / 'mobile/ios/Packages/KindredCore/Tests/KindredCoreTests' / (klass + '.swift')
            expected = re.findall(r'func (test\w+)\s*\(', path.read_text())
            assert len(expected) == count, 'selected-core-test-source-drift'
            log = self.run(klass, ['swift', 'test', '--package-path', 'mobile/ios/Packages/KindredCore',
                            '--jobs', '1', '--filter', klass], maximum=180)
            require_core_tests(log, expected)
        native_source = (self.product / RESOURCE_PATHS[4]).read_text()
        assert all(re.search(r'func ' + method + r'\s*\(', native_source) for method in METHODS)
        udid = device['udid']
        if device.get('state') != 'Booted':
            self.run('boot', ['xcrun', 'simctl', 'boot', udid], maximum=60)
        self.run('bootstatus', ['xcrun', 'simctl', 'bootstatus', udid, '-b'], maximum=120)
        command = ['xcodebuild', 'test', '-project', 'mobile/ios/KindredCompanion.xcodeproj',
            '-scheme', 'KindredCompanion', '-configuration', 'Debug',
            '-destination', 'platform=iOS Simulator,id=' + udid, '-destination-timeout', '90',
            '-derivedDataPath', str(self.out / 'DerivedData'), '-resultBundlePath', str(self.out / 'NativeDictation.xcresult'),
            '-parallel-testing-enabled', 'NO', '-maximum-concurrent-test-simulator-destinations', '1',
            '-jobs', '1', 'CODE_SIGNING_ALLOWED=NO', 'KINDRED_SOURCE_REVISION=' + source]
        command += ['-only-testing:KindredCompanionTests/NativeDictationTests/' + name for name in METHODS]
        self.run('native-tests', command, maximum=480)
        tree = json.loads(self.run('xcresult-tests', ['xcrun', 'xcresulttool', 'get', 'test-results', 'tests',
                                       '--path', str(self.out / 'NativeDictation.xcresult')]))
        summary = json.loads(self.run('xcresult-summary', ['xcrun', 'xcresulttool', 'get', 'test-results', 'summary',
                                       '--path', str(self.out / 'NativeDictation.xcresult')]))
        observed = require_native_tests(tree, summary)
        app = self.out / 'DerivedData/Build/Products/Debug-iphonesimulator/Kindred.app'
        assert app.is_dir() and (app / 'Kindred').is_file(), 'compiled-simulator-app-absent'
        info = plistlib.loads((app / 'Info.plist').read_bytes())
        assert info.get('KindredSourceRevision') == source, 'embedded-app-source-revision-mismatch'
        self.record('app-identity', {k: info.get(k) for k in ('CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion', 'KindredSourceRevision')})
        resources = {}
        for name in ('MobileLayout.js', 'MobileLayout.css'):
            found = list(app.rglob(name))
            assert len(found) == 1, 'embedded-resource-set-mismatch'
            src = 'mobile/ios/KindredCompanion/Web/' + name
            assert digest(found[0]) == before[src], 'embedded-resource-not-final-product-source'
            resources[name] = digest(found[0])
        assert self.sources() == before, 'selected-source-changed'
        self.run('tracked-source-after', ['git', 'diff', '--exit-code', 'HEAD'])
        assert self.run('product-head-after', ['git', 'rev-parse', 'HEAD']).strip() == source
        self.record('source-after', self.sources())
        # Archive only the unsigned simulator app; avoid duplicating full DerivedData.
        self.run('bundle', ['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(app), str(self.out / 'Kindred-simulator.app.zip')])
        self.record('result', {'passed': True, 'scope': 'MICROPHONE_FREE_CORE_AND_APP_HOSTED_UNITS_SIMULATOR_BUNDLE',
            'source': source, 'tool': tool_commit, 'methods': observed, 'core_tests': 21,
            'resources': resources, 'executable': digest(app / 'Kindred'),
            'simulator_bundle': digest(self.out / 'Kindred-simulator.app.zip'),
            'Duo_runtime_or_SwiftUI_interactive_proof': False,
            'actual_Apple_recognition_proof': False, 'physical_phone_or_installed_binary_proof': False})


def main():
    parser = argparse.ArgumentParser()
    for name in ('product', 'tool', 'output'):
        parser.add_argument('--' + name, required=True, type=Path)
    a = parser.parse_args()
    attempt = Attempt(a.product.resolve(), a.tool.resolve(), a.output.resolve())
    try:
        attempt.main()
    except Exception as error:
        attempt.record('result', {'passed': False, 'error_type': type(error).__name__, 'error': str(error),
                                 'no_automatic_retry': True, 'native_or_delivery_success_inferred': False})
        raise


if __name__ == '__main__':
    main()
