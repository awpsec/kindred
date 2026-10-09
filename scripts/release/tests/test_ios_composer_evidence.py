import copy, importlib.util, json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('runner', Path(__file__).resolve().parents[1] / 'test-ios-simulator.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class ComposerEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.exports = dict(summary=0, tests=0, attachments=0)
        self.summary = dict(totalTestCount=2, passedTests=2, failedTests=0)
        self.tree = {'testNodes': [{'nodeType':'Test Case', 'nodeIdentifier': key, 'result':'Passed'} for key in m.COMPOSER_PHASES]}
        self.manifest = []
        for key, phases in m.COMPOSER_PHASES.items():
            rows = []
            for phase in phases:
                metrics = {'native': {'safeArea':dict(top=20,bottom=20,left=0,right=0), 'windowWidth':900 if phase=='landscape-150' else 400, 'windowHeight':400 if phase=='landscape-150' else 900}, 'controls':[dict(width=44,height=44,hit=True)]*2, 'prompt':{'height':24}, 'keyboardNotifications':dict(shows=1,hides=1), 'keyboardFrame':{'height':300}}
                for name, suffix, payload in [(phase,'.png',b'\x89PNG\r\n\x1a\nfixture-only'),(phase+'-actual-UIKit-geometry','.json',json.dumps(metrics).encode())]:
                    filename = name+suffix; (self.root/filename).write_bytes(payload)
                    rows.append(dict(suggestedHumanReadableName=filename, exportedFileName=filename))
            self.manifest.append(dict(testIdentifier=key,attachments=rows))
        self.save()
        self.decoder = patch.object(m.subprocess,'check_output',return_value='pixelWidth: 400\npixelHeight: 900\n'); self.decoder.start(); self.addCleanup(self.decoder.stop)
    def save(self): (self.root/'manifest.json').write_text(json.dumps(self.manifest))
    def validate(self): return m.validate_composer_evidence(self.exports,self.summary,self.tree,self.root)
    def test_complete_synthetic_evidence(self): self.assertEqual(self.validate(),2)
    def test_missing_orientation(self):
        self.tree['testNodes'].pop(); self.summary.update(totalTestCount=1,passedTests=1)
        with self.assertRaises(AssertionError): self.validate()
    def test_renamed_method(self):
        self.tree['testNodes'][1]['nodeIdentifier']+='Renamed'
        with self.assertRaises(AssertionError): self.validate()
    def test_skipped_method(self):
        self.tree['testNodes'][1]['result']='Skipped'
        with self.assertRaises(AssertionError): self.validate()
    def test_duplicate_method(self):
        self.tree['testNodes'][1]=copy.deepcopy(self.tree['testNodes'][0])
        with self.assertRaises(AssertionError): self.validate()
    def test_missing_each_required_attachment(self):
        for g in self.manifest:
            for row in g['attachments']:
                file=self.root/row['exportedFileName']; data=file.read_bytes();file.unlink()
                with self.assertRaises(AssertionError,msg=str(file)):self.validate()
                file.write_bytes(data)
    def test_wrong_method_binding(self):
        self.manifest[1]['testIdentifier']='UnrelatedTests/testSomething()';self.save()
        with self.assertRaises(AssertionError):self.validate()
    def test_sentinel_image(self):
        (self.root/'keyboard-open.png').write_bytes(b'not-an-image')
        with self.assertRaises(AssertionError):self.validate()
    def test_decoder_rejects_image(self):
        with patch.object(m.subprocess,'check_output',return_value='pixelWidth: <nil>'):
            with self.assertRaises((AssertionError,ValueError)):self.validate()
    def test_missing_keyboard_notification(self):
        p=self.root/'keyboard-closed-actual-UIKit-geometry.json'; d=json.loads(p.read_text());d['keyboardNotifications']['hides']=0;p.write_text(json.dumps(d))
        with self.assertRaises(AssertionError):self.validate()
    def test_false_landscape(self):
        p=self.root/'landscape-150-actual-UIKit-geometry.json';d=json.loads(p.read_text());d['native']['windowWidth']=100;p.write_text(json.dumps(d))
        with self.assertRaises(AssertionError):self.validate()
    def test_traversal(self):
        self.manifest[0]['attachments'][0]['exportedFileName']='../outside.png';self.save()
        with self.assertRaises(AssertionError):self.validate()
    def test_export_failure(self):
        self.exports['attachments']=1
        with self.assertRaises(AssertionError):self.validate()
    def test_zero_tests(self):
        self.summary.update(totalTestCount=0,passedTests=0)
        with self.assertRaises(AssertionError):self.validate()

if __name__=='__main__': unittest.main()
