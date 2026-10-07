"""Exercise the exact capture loop with deterministic process/observer timing.

No Mac execution is inferred. The fake observer implements the Swift helper's
typed absent-window result and real windows.json output boundary.
"""
import ast
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest

SOURCE = Path(__file__).with_name('test-macos-package.py')


class CaptureTests(unittest.TestCase):
    def invoke(self, samples, wait=1.0, exited=False, words=None):
        tree = ast.parse(SOURCE.read_text())
        node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'capture')
        clock = SimpleNamespace(value=0.0)
        clock.monotonic = lambda: clock.value
        clock.sleep = lambda duration: setattr(clock, 'value', clock.value + duration)
        calls = []
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            def command(args, name, required=True, **kwargs):
                calls.append(clock.value)
                sample = samples[min(len(calls)-1, len(samples)-1)]
                if sample == 'absent':
                    result = SimpleNamespace(returncode=2, stdout=json.dumps({'observation':'no_visible_test_app_window','pid':123}), stderr='')
                elif sample == 'bad_absent':
                    result = SimpleNamespace(returncode=2, stdout=json.dumps({'observation':'no_visible_test_app_window','pid':999}), stderr='')
                elif sample == 'malformed':
                    result = SimpleNamespace(returncode=2, stdout='not json', stderr='')
                elif sample == 'error':
                    result = SimpleNamespace(returncode=1, stdout='', stderr='Window capture failed')
                elif sample == 'old_fatal':
                    result = SimpleNamespace(returncode=-5, stdout='', stderr='Swift/ErrorType.swift:254: Fatal error: Error raised at top level: Error Domain=No visible test-app window Code=2')
                else:
                    rows = [{'title':'Kindred notification','text':['sent you a message'] if sample == 'visible' else ['still rendering']}]
                    folder = out/'preview'; folder.mkdir(exist_ok=True)
                    (folder/'windows.json').write_text(json.dumps(rows))
                    result = SimpleNamespace(returncode=0, stdout=json.dumps(rows), stderr='')
                if required:
                    assert result.returncode == 0, f'{name}: command failed ({result.returncode})'
                return result
            ns = {'time':clock,'json':json,'out':out,'command':command}
            exec(compile(ast.Module(body=[node], type_ignores=[]), str(SOURCE), 'exec'), ns)
            child = SimpleNamespace(pid=123, poll=lambda: 1 if exited else None)
            self.calls = calls
            self.clock = clock
            return ns['capture'](child,'preview',['sent you a message'] if words is None else words,render_wait=wait,window_title='Kindred notification')

    def test_window_appears_before_deadline(self):
        rows = self.invoke(['absent','visible'])
        self.assertEqual(rows[0]['text'], ['sent you a message'])
        self.assertEqual(self.calls, [0.0,0.5])

    def test_persistent_absence_fails_at_deadline(self):
        with self.assertRaisesRegex(AssertionError, 'No visible test-app window by render deadline'):
            self.invoke(['absent'])
        self.assertEqual(self.clock.value, 1.0)
        self.assertEqual(len(self.calls), 3)

    def test_no_wait_absence_fails_immediately(self):
        with self.assertRaisesRegex(AssertionError, 'No visible test-app window by render deadline'):
            self.invoke(['absent'],wait=0)
        self.assertEqual(self.calls, [0.0])

    def test_real_capture_error_is_not_retried(self):
        with self.assertRaisesRegex(AssertionError, 'command failed'):
            self.invoke(['error','visible'])
        self.assertEqual(self.calls, [0.0])

    def test_old_untyped_fatal_is_not_reclassified(self):
        with self.assertRaisesRegex(AssertionError, 'command failed'):
            self.invoke(['old_fatal','visible'])
        self.assertEqual(self.calls, [0.0])

    def test_wrong_pid_observation_is_not_retried(self):
        with self.assertRaisesRegex(AssertionError, 'Invalid absent-window observation'):
            self.invoke(['bad_absent','visible'])
        self.assertEqual(self.calls, [0.0])

    def test_malformed_observation_is_not_retried(self):
        with self.assertRaisesRegex(AssertionError, 'Invalid absent-window observation'):
            self.invoke(['malformed','visible'])
        self.assertEqual(self.calls, [0.0])

    def test_exit_before_observation_fails(self):
        with self.assertRaisesRegex(AssertionError, 'Native app exited'):
            self.invoke(['visible'],exited=True)
        self.assertEqual(self.calls, [])

    def test_late_text_still_requires_rendered_contents(self):
        rows = self.invoke(['text_pending','visible'])
        self.assertEqual(rows[0]['text'], ['sent you a message'])
        self.assertEqual(self.calls, [0.0,0.5])

    def test_persistent_missing_text_still_fails(self):
        with self.assertRaisesRegex(AssertionError, 'expected UI text missing'):
            self.invoke(['text_pending'])
        self.assertEqual(self.clock.value, 1.0)

    def test_empty_text_requirements_still_require_a_window(self):
        with self.assertRaisesRegex(AssertionError, 'No visible test-app window by render deadline'):
            self.invoke(['absent'],wait=0,words=[])


if __name__ == '__main__':
    unittest.main()
