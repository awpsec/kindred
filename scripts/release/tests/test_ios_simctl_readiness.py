import importlib.util
import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('readiness_runner', Path(__file__).resolve().parents[1] / 'test-ios-simulator.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ReadinessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        output = patch.object(m, 'OUT', self.root)
        output.start()
        self.addCleanup(output.stop)
        self.device = {'udid': 'selected-only', 'state': 'Booted'}

    def receipt(self):
        return json.loads((self.root / 'simulator-transport-readiness.json').read_text())

    def test_selected_response_is_one_ten_second_diagnostic(self):
        with patch.object(m, '_simulator_command', return_value=subprocess.CompletedProcess([], 0, 'selected-only\n', '')) as call:
            self.assertTrue(m.wait_for_simulator_transport(self.device))
        self.assertEqual(call.call_count, 1)
        self.assertEqual(call.call_args.args[0], ['xcrun', 'simctl', 'getenv', 'selected-only', 'SIMULATOR_UDID'])
        self.assertEqual(call.call_args.kwargs['timeout'], 10)
        row = self.receipt()
        self.assertTrue(row['passed'])
        self.assertTrue(row['diagnostic_only'])
        self.assertTrue(row['required_setup_and_native_tests_pending'])
        self.assertFalse(row['response_is_native_effect_proof'])

    def test_wrong_device_still_fails(self):
        with patch.object(m, '_simulator_command', return_value=subprocess.CompletedProcess([], 0, 'other', '')):
            with self.assertRaises(AssertionError):
                m.wait_for_simulator_transport(self.device)
        self.assertFalse(self.receipt()['passed'])
        self.assertNotIn('continued_to_required_setup', self.receipt())

    def test_timeout_and_nonzero_retained_without_retry_or_readiness_claim(self):
        for failure in (subprocess.TimeoutExpired(['getenv'], 10, output='partial'),
                        subprocess.CalledProcessError(7, ['getenv'], output='partial', stderr='unavailable')):
            with self.subTest(error=type(failure).__name__):
                with patch.object(m, '_simulator_command', side_effect=failure) as call:
                    self.assertFalse(m.wait_for_simulator_transport(self.device))
                self.assertEqual(call.call_count, 1)
                row = self.receipt()
                self.assertFalse(row['passed'])
                self.assertTrue(row['continued_to_required_setup'])
                self.assertEqual(row['error_type'], type(failure).__name__)
                self.assertEqual(row['commands'][0]['stdout'], 'partial')

    def test_process_creation_errors_and_missing_receipts_still_fail(self):
        with patch.object(m, '_simulator_command', side_effect=OSError('missing executable')):
            with self.assertRaises(OSError):
                m.wait_for_simulator_transport(self.device)
        with patch.object(m, '_simulator_command', side_effect=subprocess.TimeoutExpired(['getenv'], 10)), \
             patch.object(m, 'record', side_effect=OSError('disk')):
            with self.assertRaises(OSError):
                m.wait_for_simulator_transport(self.device)

    def orchestrate(self, probe, preference='1'):
        """Run real orchestration with synthetic subprocesses, never an Apple simulator."""
        root = self.root / 'repo'
        (root / 'mobile/ios/KindredCompanionTests').mkdir(parents=True)
        (root / 'mobile/ios/KindredCompanionTests/ComposerUIKitTests.swift').write_text('fixture')
        out = root / 'ios-validation'
        source = '0' * 40
        fixture, native = MagicMock(), MagicMock()
        fixture.poll.return_value = None
        native.wait.return_value = 0
        calls = []

        def popen(command, **kwargs):
            calls.append(command)
            return fixture if command[0] == 'node' else native

        def output(command, **kwargs):
            if command[0] == 'git':
                return source + '\n'
            if command[:4] == ['xcrun', 'simctl', 'list', 'devices']:
                return json.dumps({'devices': {'com.apple.CoreSimulator.SimRuntime.iOS-27-1': [dict(self.device, name='iPhone Duo', isAvailable=True)]}})
            return '0\n'

        def execute(command, **kwargs):
            calls.append(command)
            if command[0] == 'openssl':
                Path(command[command.index('-keyout') + 1]).write_text('fixture-only')
            if command[:3] == ['xcrun', 'simctl', 'getenv']:
                if isinstance(probe, Exception):
                    raise probe
                return subprocess.CompletedProcess(command, 0, probe, '')
            if 'ReduceMotionEnabled' in command and 'read' in command:
                if isinstance(preference, Exception):
                    raise preference
                return subprocess.CompletedProcess(command, 0, preference, '')
            return subprocess.CompletedProcess(command, 0, '0', '')

        with patch.object(m, 'ROOT', root), patch.object(m, 'OUT', out), \
             patch.dict(m.os.environ, EXPECTED_SOURCE=source), \
             patch.object(m, '_simulator_command', side_effect=execute), \
             patch.object(m.subprocess, 'run', side_effect=execute), \
             patch.object(m.subprocess, 'check_output', side_effect=output), \
             patch.object(m.subprocess, 'Popen', side_effect=popen), \
             patch.object(m.ssl, 'create_default_context'), \
             patch.object(m.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps({'origin': 'https://localhost:8765', 'ui_sha256': {}}).encode())):
            # No synthetic xcresult: even exit zero must not become acceptance.
            with self.assertRaises(SystemExit):
                m.main('composer')
        receipt = json.loads((out / 'test-receipt.json').read_text())
        return calls, native, receipt, out

    def assert_native_attempt(self, calls, native, receipt, out):
        boot = next(i for i, c in enumerate(calls) if c[:3] == ['xcrun', 'simctl', 'bootstatus'])
        opened = next(i for i, c in enumerate(calls) if c[0] == 'open')
        probe = next(i for i, c in enumerate(calls) if c[:3] == ['xcrun', 'simctl', 'getenv'])
        write = next(i for i, c in enumerate(calls) if 'ReduceMotionEnabled' in c and 'write' in c)
        read = next(i for i, c in enumerate(calls) if 'ReduceMotionEnabled' in c and 'read' in c)
        tests = [c for c in calls if c[0] == 'xcodebuild']
        self.assertTrue(boot < opened < probe < write < read)
        self.assertEqual(calls[opened][-2:], ['-CurrentDeviceUDID', 'selected-only'])
        self.assertEqual(len(tests), 1)
        command = tests[0]
        self.assertEqual(command[command.index('-destination') + 1], 'platform=iOS Simulator,id=selected-only')
        expected = sorted('-only-testing:KindredCompanionTests/' + name.removesuffix('()') for name in set(m.COMPOSER_PHASES) | m.DICTATION_METHODS)
        self.assertEqual(sorted(c for c in command if c.startswith('-only-testing:')), expected)
        self.assertEqual(native.wait.call_args.kwargs['timeout'], 720)
        self.assertTrue(json.loads((out / 'reduce-motion-setup.json').read_text())['passed'])
        self.assertFalse(receipt['passed'])
        self.assertIn('result bundle missing', receipt['error'])
        self.assertNotIn('native_test_count', receipt)

    def test_probe_timeout_reaches_required_setup_and_unchanged_native_tests(self):
        self.assert_native_attempt(*self.orchestrate(subprocess.TimeoutExpired(['getenv'], 10)))

    def test_probe_nonzero_reaches_required_setup_and_unchanged_native_tests(self):
        self.assert_native_attempt(*self.orchestrate(subprocess.CalledProcessError(7, ['getenv'])))

    def test_wrong_device_cannot_reach_native_test_or_preference_setup(self):
        calls, native, receipt, _ = self.orchestrate('wrong-device')
        native.wait.assert_not_called()
        self.assertFalse(any('ReduceMotionEnabled' in c for c in calls))
        self.assertFalse(receipt['passed'])
        self.assertIn('wrong identity', receipt['error'])

    def test_failed_required_readback_cannot_reach_native_test(self):
        calls, native, receipt, out = self.orchestrate(subprocess.TimeoutExpired(['getenv'], 10), preference='0')
        native.wait.assert_not_called()
        self.assertFalse(any(c[0] == 'xcodebuild' for c in calls))
        self.assertFalse(json.loads((out / 'reduce-motion-setup.json').read_text())['passed'])
        self.assertFalse(receipt['passed'])
        self.assertIn('did not read back', receipt['error'])

    def test_required_readback_timeout_cannot_reach_native_test(self):
        calls, native, receipt, _ = self.orchestrate(subprocess.TimeoutExpired(['getenv'], 10), preference=subprocess.TimeoutExpired(['defaults'], 10))
        native.wait.assert_not_called()
        self.assertFalse(any(c[0] == 'xcodebuild' for c in calls))
        self.assertFalse(receipt['passed'])
        self.assertIn('TimeoutExpired', receipt['error'])


if __name__ == '__main__':
    unittest.main()
