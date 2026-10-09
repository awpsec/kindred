import importlib.util, json, subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('boot_runner', Path(__file__).resolve().parents[1] / 'test-ios-simulator.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class BootDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = patch.object(m, 'OUT', self.root); self.output.start(); self.addCleanup(self.output.stop)
        self.device = {'udid': 'selected', 'state': 'Shutdown'}

    def result(self):
        return json.loads((self.root / 'simulator-boot.json').read_text())

    def test_ready_boot_retains_log_and_separate_bounded_deadlines(self):
        with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)) as run:
            m.boot_simulator(self.device)
        self.assertTrue(self.result()['passed'])
        self.assertTrue((self.root / 'simulator-boot.log').exists())
        self.assertEqual(len(run.call_args_list), 2)
        self.assertEqual([c.kwargs['timeout'] for c in run.call_args_list], [90,180])
        self.assertTrue(all(c.kwargs['check'] for c in run.call_args_list))
        self.assertEqual(self.result()['deadline_seconds'], 180)

    def test_timeout_preserves_original_error_and_fresh_selected_state(self):
        failure = subprocess.TimeoutExpired(['bootstatus'], 180)
        inventory = {'devices': {'runtime': [{'udid':'other', 'state':'Booted'},
                    {'udid':'selected', 'state':'Booted', 'isAvailable':True}]}}
        replies = [subprocess.CompletedProcess([], 0), failure,
                   subprocess.CompletedProcess([], 0, json.dumps(inventory)),
                   subprocess.CompletedProcess([], 0, 'selected\n')]
        with patch.object(m.subprocess, 'run', side_effect=replies) as run:
            with self.assertRaises(subprocess.TimeoutExpired) as caught:
                m.boot_simulator(self.device)
        self.assertIs(caught.exception, failure)
        row = self.result()
        self.assertFalse(row['passed']); self.assertTrue(row['timed_out'])
        self.assertEqual(row['fresh_device']['udid'], 'selected')
        self.assertEqual(row['fresh_device']['state'], 'Booted')
        self.assertTrue(row['health_probe']['selected_device_responded'])
        self.assertEqual([c.kwargs['timeout'] for c in run.call_args_list], [90,180,10,10])

    def test_failed_probes_cannot_replace_boot_failure(self):
        failure = subprocess.CalledProcessError(7, ['boot'])
        with patch.object(m.subprocess, 'run', side_effect=[failure, subprocess.TimeoutExpired(['list'],10), OSError('probe')]):
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                m.boot_simulator(self.device)
        self.assertIs(caught.exception, failure)
        row = self.result()
        self.assertEqual(row['phase'], 'boot'); self.assertFalse(row['passed'])
        self.assertEqual(row['state_probe_error_type'], 'TimeoutExpired')
        self.assertEqual(row['health_probe_error_type'], 'OSError')

    def test_prebooted_device_still_requires_terminal_bootstatus(self):
        self.device['state'] = 'Booted'
        with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([],0)) as run:
            m.boot_simulator(self.device)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[0], ['xcrun','simctl','bootstatus','selected','-b'])
        self.assertEqual(run.call_args.kwargs['timeout'], 180)
        self.assertTrue(run.call_args.kwargs['check'])

if __name__ == '__main__': unittest.main()
