"""Regression checks for receipt handling; no native execution or discovery claim."""
import json, runpy, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

HELPER = Path(__file__).with_name('test-native-network.py')

class ReceiptTests(unittest.TestCase):
    def run_helper(self, code, stdout):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(sys, 'argv', [str(HELPER), '--target', 'x86_64-unknown-linux-gnu', '--output', tmp]), patch('subprocess.run', return_value=subprocess.CompletedProcess([], code, stdout, 'compiler log\n')):
                try:
                    runpy.run_path(str(HELPER), run_name='__main__')
                    exit_code = 0
                except SystemExit as exc:
                    exit_code = exc.code
            return exit_code, json.loads((Path(tmp)/'network-validation.json').read_text())

    def test_typed_failure_survives_failed_command(self):
        failure = {'kind': 'command', 'elapsed_ms': 10014, 'output_removed': True,
                   'process': {'kind': 'timeout', 'elapsed_ms': 10010,
                               'cleanup': {'kill_attempted': True, 'kill_succeeded': True, 'reaped': True}}}
        code, receipt = self.run_helper(1, json.dumps({'actual_native_discovery_passed': False, 'discovery_failure': failure, 'temporary_directory_removed': True})+'\n')
        self.assertEqual(code, 1)
        self.assertFalse(receipt['passed'])
        self.assertEqual(receipt['discovery_failure'], failure)
        self.assertTrue(receipt['temporary_directory_removed'])

    def test_later_failure_cannot_become_success(self):
        code, receipt = self.run_helper(101, json.dumps({'actual_native_discovery_passed': True, 'explicit_compose_generation_passed': True})+'\n')
        self.assertEqual(code, 101)
        self.assertFalse(receipt['passed'])

    def test_missing_json_is_not_a_pass(self):
        code, receipt = self.run_helper(0, 'not a result\n')
        self.assertEqual(code, 1)
        self.assertFalse(receipt['passed'])

    def test_success_preserves_platform_gap(self):
        code, receipt = self.run_helper(0, json.dumps({'actual_native_discovery_passed': True, 'explicit_compose_generation_passed': True, 'actual_compose_merge_passed': False, 'compose_gap': 'Docker Compose unavailable', 'interface_count': 10})+'\n')
        self.assertEqual(code, 0)
        self.assertTrue(receipt['passed'])
        self.assertEqual(receipt['compose_gap'], 'Docker Compose unavailable')
        self.assertFalse(receipt['docker_desktop_forwarding_proven'])

if __name__ == '__main__':
    unittest.main()
