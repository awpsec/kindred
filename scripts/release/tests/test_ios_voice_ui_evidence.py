import importlib.util, unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('runner', Path(__file__).resolve().parents[1] / 'test-ios-simulator.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class VoiceUIEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.exports = dict(summary=0, tests=0, attachments=0)
        self.summary = dict(totalTestCount=6, passedTests=6, failedTests=0)
        self.tree = {'testNodes': [{'nodeType': 'Test Suite', 'children': [
            dict(nodeType='Test Case', nodeIdentifier=key, result='Passed') for key in m.VOICE_UI_METHODS]}]}

    def validate(self):
        return m.validate_voice_ui_evidence(self.exports, self.summary, self.tree)

    def test_accepts_all_six_native_cases(self):
        self.assertEqual(self.validate(), 6)

    def test_rejects_missing_skipped_or_duplicate_case(self):
        cases = self.tree['testNodes'][0]['children']
        cases[-1]['result'] = 'Skipped'
        with self.assertRaises(AssertionError): self.validate()
        cases[-1]['result'] = 'Passed'
        cases[-1]['nodeIdentifier'] = cases[0]['nodeIdentifier']
        with self.assertRaises(AssertionError): self.validate()
        cases.pop()
        with self.assertRaises(AssertionError): self.validate()

    def test_rejects_failed_summary_and_missing_export(self):
        self.summary['failedTests'] = 1
        with self.assertRaises(AssertionError): self.validate()
        self.summary['failedTests'] = 0
        self.exports['tests'] = 1
        with self.assertRaises(AssertionError): self.validate()

    def test_identity_scope_requires_branding_lifecycle_and_voice_cases(self):
        methods = m.IDENTITY_UI_METHODS
        self.assertEqual(len(methods), 11)
        self.assertTrue(m.VOICE_UI_METHODS < methods)
        summary = dict(totalTestCount=len(methods), passedTests=len(methods), failedTests=0)
        cases = [dict(nodeType='Test Case', nodeIdentifier=key, result='Passed') for key in methods]
        tree = {'testNodes': cases}
        self.assertEqual(m.validate_native_methods_evidence(self.exports, summary, tree, methods), 11)
        # The older six-case voice receipt cannot pass as branding acceptance.
        with self.assertRaises(AssertionError):
            m.validate_native_methods_evidence(self.exports, self.summary, self.tree, methods)
        cases[-1]['result'] = 'Skipped'
        with self.assertRaises(AssertionError):
            m.validate_native_methods_evidence(self.exports, summary, tree, methods)


if __name__ == '__main__': unittest.main()
