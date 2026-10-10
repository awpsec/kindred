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
        self.summary = dict(totalTestCount=8, passedTests=8, failedTests=0)
        self.tree = {'testNodes': [{'nodeType':'Test Case', 'nodeIdentifier': key, 'result':'Passed'} for key in set(m.COMPOSER_PHASES) | m.DICTATION_METHODS]}
        self.manifest = []
        for key, phases in m.COMPOSER_PHASES.items():
            rows = []
            for phase in phases:
                metrics = {'native': {'safeArea':dict(top=20,bottom=20,left=0,right=0), 'windowWidth':900 if phase=='landscape-150' else 400, 'windowHeight':400 if phase=='landscape-150' else 900}, 'controls':[dict(width=44,height=44,hit=True)]*2, 'prompt':{'height':24}, 'keyboardNotifications':dict(shows=1,hides=1), 'keyboardFrame':{'height':300}}
                metrics.update(keyboardVisible='-open' in phase, nativeReduceMotion=True, layout=dict(textScale=1.5 if '-150-' in phase else 1), primarySurface=dict(theme=phase.split('-')[1] if phase.startswith('dictation-') else 'dark'))
                if phase.startswith('dictation-'):
                    state=phase.rsplit('-',1)[1]; active=state=='dictating'
                    metrics.update(nativeSpeechPhase='recording' if active else 'idle',nativeSpeechOperationActive=active,dictationState=dict(draftPresent=state!='empty',transientSpan=active,dictating=active,sendCount=0,reducedMotion=True,lastEvent=dict(phase={'dictating':'partial','stopped':'stopped','cancelled':'cancelled'}.get(state,'cancelled'),sequence=1,textLength=10)))
                if phase.startswith('send-'):
                    surface = dict(selector='.dictation-button' if '-empty-' in phase else '#send', controlKind='microphone' if '-empty-' in phase else 'send', capability=dict(supported=True,onDeviceAvailable=True,engine='apple-on-device'),theme=phase.split('-')[1], hidden=False, appearance='none', edgeHits=[True]*4, target=dict(x=0,y=0,width=44,height=44), arrow=dict(x=12,y=12,width=20,height=20), paint=dict(width=36,height=36,left=4,top=4,rgba=[200,200,200,255]), opacity=1)
                    metrics['primarySurface'] = surface
                    paint = dict(primarySurface=surface, nativeBitmapProbes=[dict(direction=d,inside=[200]*3,outside=[0]*3,expected=[200]*3) for d in [[1,0],[-1,0],[0,1],[0,-1]]])
                    name=phase+'-painted-primarySurface.json'; (self.root/name).write_text(json.dumps(paint)); rows.append(dict(suggestedHumanReadableName=name,exportedFileName=name))
                for name, suffix, payload in [(phase,'.png',b'\x89PNG\r\n\x1a\nfixture-only'),(phase+'-actual-UIKit-geometry','.json',json.dumps(metrics).encode())]:
                    filename = name+suffix; (self.root/filename).write_bytes(payload)
                    rows.append(dict(suggestedHumanReadableName=filename, exportedFileName=filename))
            self.manifest.append(dict(testIdentifier=key,attachments=rows))
        self.save()
        self.decoder = patch.object(m.subprocess,'check_output',return_value='pixelWidth: 400\npixelHeight: 900\n'); self.decoder.start(); self.addCleanup(self.decoder.stop)
    def save(self): (self.root/'manifest.json').write_text(json.dumps(self.manifest))
    def validate(self): return m.validate_composer_evidence(self.exports,self.summary,self.tree,self.root)
    def test_complete_synthetic_evidence(self): self.assertEqual(self.validate(),8)
    def test_missing_send_matrix_metadata(self):
        self.manifest[0]['attachments'] = [r for r in self.manifest[0]['attachments'] if not r['suggestedHumanReadableName'].startswith('send-')];self.save()
        with self.assertRaises(AssertionError):self.validate()
    def mutate_paint(self, field, value):
        p=self.root/'send-dark-empty-closed-painted-primarySurface.json';d=json.loads(p.read_text());d[field]=value;p.write_text(json.dumps(d))
    def test_nonfinite_probe(self):
        p=self.root/'send-dark-empty-closed-painted-primarySurface.json';d=json.loads(p.read_text());d['nativeBitmapProbes'][0]['inside'][0]=float('nan');p.write_text(json.dumps(d))
        with self.assertRaises(AssertionError):self.validate()
    def test_wrong_bitmap_colour(self):
        p=self.root/'send-dark-empty-closed-painted-primarySurface.json';d=json.loads(p.read_text());d['nativeBitmapProbes'][0]['inside'][0]=0;p.write_text(json.dumps(d))
        with self.assertRaises(AssertionError):self.validate()
    def test_missing_cardinal_probe(self):
        p=self.root/'send-dark-empty-closed-painted-primarySurface.json';d=json.loads(p.read_text());d['nativeBitmapProbes'].pop();p.write_text(json.dumps(d))
        with self.assertRaises(AssertionError):self.validate()
    def test_paint_geometry_mismatch(self):
        p=self.root/'send-dark-empty-closed-painted-primarySurface.json';d=json.loads(p.read_text());d['primarySurface']['target']['width']=36;p.write_text(json.dumps(d))
        with self.assertRaises(AssertionError):self.validate()
    def test_missing_dictation_method(self):
        self.tree['testNodes']=[n for n in self.tree['testNodes'] if not n['nodeIdentifier'].startswith('NativeDictationTests/')]
        with self.assertRaises(AssertionError):self.validate()
    def test_extra_real_recognition_method_is_not_lifecycle_pass(self):
        self.tree['testNodes'].append(dict(nodeType='Test Case',nodeIdentifier='NativeDictationTests/testActualOnDeviceRecordedAudioProducesPartialsAndFinal()',result='Skipped'))
        with self.assertRaises(AssertionError):self.validate()
    def test_missing_dictation_phase(self):
        g=self.manifest[2];g['attachments']=g['attachments'][2:];self.save()
        with self.assertRaises(AssertionError):self.validate()
    def test_wrong_native_keyboard_state(self):
        p=self.root/'dictation-dark-100-open-empty-actual-UIKit-geometry.json';d=json.loads(p.read_text());d['keyboardVisible']=False;p.write_text(json.dumps(d))
        with self.assertRaises(AssertionError):self.validate()
    def test_missing_os_reduce_motion(self):
        p=self.root/'dictation-dark-100-open-empty-actual-UIKit-geometry.json';d=json.loads(p.read_text());d['nativeReduceMotion']=False;p.write_text(json.dumps(d))
        with self.assertRaises(AssertionError):self.validate()
    def test_wrong_text_scale(self):
        p=self.root/'dictation-dark-150-open-empty-actual-UIKit-geometry.json';d=json.loads(p.read_text());d['layout']['textScale']=1;p.write_text(json.dumps(d))
        with self.assertRaises(AssertionError):self.validate()
    def test_reduce_motion_setup_requires_preference_readback(self):
        with patch.object(m,'OUT',self.root),patch.object(m.subprocess,'run') as run,patch.object(m.subprocess,'check_output',return_value='1'):
            m.configure_simulator_reduce_motion({'udid':'selected-only'})
            self.assertEqual(run.call_args.args[0],['xcrun','simctl','spawn','selected-only','defaults','write','com.apple.Accessibility','ReduceMotionEnabled','-bool','true'])
            self.assertEqual(run.call_args.kwargs['timeout'],10)
            self.assertTrue(run.call_args.kwargs['check'])
        with patch.object(m,'OUT',self.root),patch.object(m.subprocess,'run'),patch.object(m.subprocess,'check_output',return_value='0'):
            with self.assertRaises(AssertionError):m.configure_simulator_reduce_motion({'udid':'selected-only'})
    def test_wrong_measured_dictation_state(self):
        p=self.root/'dictation-dark-100-open-dictating-actual-UIKit-geometry.json';d=json.loads(p.read_text());d['nativeSpeechOperationActive']=False;p.write_text(json.dumps(d))
        with self.assertRaises(AssertionError):self.validate()
    def test_label_without_typed_bridge_event(self):
        p=self.root/'dictation-dark-100-open-stopped-actual-UIKit-geometry.json';d=json.loads(p.read_text());d['dictationState']['lastEvent']['phase']='partial';p.write_text(json.dumps(d))
        with self.assertRaises(AssertionError):self.validate()
    def test_dictation_send_not_zero(self):
        p=self.root/'dictation-dark-100-open-empty-actual-UIKit-geometry.json';d=json.loads(p.read_text());d['dictationState']['sendCount']=1;p.write_text(json.dumps(d))
        with self.assertRaises(AssertionError):self.validate()
    def test_mic_paint_mislabeled_as_send(self):
        for suffix in ['actual-UIKit-geometry','painted-primarySurface']:
            p=self.root/('send-dark-empty-closed-'+suffix+'.json');d=json.loads(p.read_text());d['primarySurface']['selector']='#send';d['primarySurface']['controlKind']='send';p.write_text(json.dumps(d))
        with self.assertRaises(AssertionError):self.validate()
    def test_unsupported_capability_cannot_pass_supported_native_matrix(self):
        for suffix in ['actual-UIKit-geometry','painted-primarySurface']:
            p=self.root/('send-dark-empty-closed-'+suffix+'.json');d=json.loads(p.read_text());d['primarySurface']['capability']['supported']=False;p.write_text(json.dumps(d))
        with self.assertRaises(AssertionError):self.validate()
    def test_old_mislabeled_send_attachment(self):
        g=self.manifest[0]
        for row in g['attachments']:
            row['suggestedHumanReadableName']=row['suggestedHumanReadableName'].replace('painted-primarySurface','painted-Send')
        self.save()
        with self.assertRaises(AssertionError):self.validate()
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
