import copy,hashlib,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import test_ios_composer_evidence as fixture
m=fixture.m
class KeyboardOwnershipTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.out=self.root/'attachments';self.out.mkdir();(self.root/'ui').mkdir()
  for name in ('app.js','style.css','dictation.js','index.html'):(self.root/'ui'/name).write_text(name)
  self.ui={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (self.root/'ui').iterdir()}
  self.exports=dict(summary=0,tests=0,attachments=0);self.summary=dict(totalTestCount=4,passedTests=4,failedTests=0,skippedTests=0);self.tree={'testNodes':[]};self.manifest=[]
  self.native=dict(webInFixtureWindow=True,fixtureWindowKey=True,fixtureWindowHidden=False,keyboardVisible=True,scrollOffset=dict(x=0,y=369),scrollContentSize=dict(width=402,height=355),keyboardIntersectionHeight=0)
  for key in ('webFrameInFixtureWindow','scrollBounds','keyboardFrameInFixtureWindow','keyboardFrame'):self.native[key]=dict(x=0,y=0,width=402,height=355)
  for key in ('scrollContentInset','scrollAdjustedContentInset'):self.native[key]=dict(top=0,bottom=369,left=0,right=0)
  self.page=dict(uiMatches=True,uiManifest=self.ui,draftMatches=True,sendCount=0,viewport=dict(width=0,height=0),client=dict(width=402,height=355),visual=dict(width=0,height=0,offsetTop=0,offsetLeft=0,scale=1),shell=dict(x=0,y=0,width=402,height=355),windowScroll=dict(x=0,y=0,top=0),resizing=False,focusTrace=[],firstPromptFocus=None,controls=[dict(x=0,y=0,width=44,height=44,hit=False)])
  def sample(t):return dict(elapsed=t,pageRequestedAt=t,pageReturnedAt=t+.01,nativeTakenAt=t+.02,pageTimeoutSeconds=2,javascript={'page':copy.deepcopy(self.page)},native=copy.deepcopy(self.native))
  for method,(phase,host,focus) in m.KEYBOARD_OWNERSHIP_CASES.items():
   self.tree['testNodes'].append(dict(nodeType='Test Case',nodeIdentifier=method,result='Passed'))
   before=sample(9);before['native']['keyboardVisible']=False
   d=dict(schemaVersion=1,diagnosticOnly=True,phase=phase,method='actual XCTest '+method,methodIdentifier=method,intent=dict(hostContract=host,focusMode=focus),proofScope='four-condition diagnostic only; not original Composer release acceptance',screenshot=dict(captured=True,source='fixture UIWindow.drawHierarchy; system keyboard window may be excluded',width=402,height=724),focusStartedAt=10,observationEnd=18,focusResult={'page':{'focused':True}},keyboardVisible=True,keyboardShows=1,keyboardHides=0,keyboardEvents=[dict(event='keyboardDidShow',time=11,frame=dict(x=0,y=355,width=402,height=369))],beforeFocus=before,samples=[sample(10.1),sample(10.4)],after=sample(18.1),focusToEndSeconds=8.2)
   rows=[]
   for suffix,data in (('-geometry.json',json.dumps(d).encode()),('-screenshot.png',b'\x89PNG\r\n\x1a\nfixture')):
    n=phase+suffix;(self.out/n).write_bytes(data);rows.append(dict(suggestedHumanReadableName=n,exportedFileName=n))
   self.manifest.append(dict(testIdentifier=method,attachments=rows))
  self.save();self.addCleanup(patch.stopall);patch.object(m,'ROOT',self.root).start();patch.object(m.subprocess,'check_output',return_value='pixelWidth: 402\npixelHeight: 724').start()
 def save(self):(self.out/'manifest.json').write_text(json.dumps(self.manifest))
 def validate(self):return m.validate_keyboard_ownership_evidence(self.exports,self.summary,self.tree,self.out)
 def mutate(self,fn):
  p=self.out/(next(iter(m.KEYBOARD_OWNERSHIP_CASES.values()))[0]+'-geometry.json');d=json.loads(p.read_text());fn(d);p.write_text(json.dumps(d))
 def refused(self,fn):
  self.mutate(fn)
  with self.assertRaises((AssertionError,KeyError)):self.validate()
 def test_zero_viewport_false_hit_are_diagnostic_outcomes(self):self.assertEqual(self.validate(),4)
 def test_wrong_observation_deadline(self):self.refused(lambda d:d.update(observationEnd=20))
 def test_missing_actual_keyboard_frame(self):self.refused(lambda d:d['keyboardEvents'][0].pop('frame'))
 def test_wrong_case(self):self.refused(lambda d:d['intent'].update(focusMode='wrong'))
 def test_wrong_observed_method(self):self.refused(lambda d:d.update(method='different XCTest case'))
 def test_wrong_identifier(self):self.refused(lambda d:d.update(methodIdentifier='renamed'))
 def test_no_release_acceptance(self):self.refused(lambda d:d.update(diagnosticOnly=False))
 def test_missing_focus_anchor(self):self.refused(lambda d:d.pop('focusStartedAt'))
 def test_late_keyboard(self):self.refused(lambda d:d['keyboardEvents'][0].update(time=23))
 def test_missing_keyboard(self):self.refused(lambda d:d.update(keyboardEvents=[]))
 def test_missing_before(self):self.refused(lambda d:d.pop('beforeFocus'))
 def test_stale_ui(self):self.refused(lambda d:d['beforeFocus']['javascript']['page']['uiManifest'].update({'app.js':'old'}))
 def test_draft_lost(self):self.refused(lambda d:d['after']['javascript']['page'].update(draftMatches=False))
 def test_accidental_send(self):self.refused(lambda d:d['after']['javascript']['page'].update(sendCount=1))
 def test_detached_host(self):self.refused(lambda d:d['after']['native'].update(webInFixtureWindow=False))
 def test_missing_js(self):self.refused(lambda d:d['after']['javascript'].pop('page'))
 def test_too_few_samples(self):self.refused(lambda d:d.update(samples=d['samples'][:1]))
 def test_reversed_time(self):self.refused(lambda d:d['samples'][1].update(pageRequestedAt=9))
 def test_oversized_probe(self):self.refused(lambda d:d['samples'][1].update(pageTimeoutSeconds=3))
 def test_late_sample_request(self):self.refused(lambda d:d['samples'][1].update(pageRequestedAt=19,pageReturnedAt=19.1,nativeTakenAt=19.2))
 def test_nonfinite_native(self):self.refused(lambda d:d['after']['native'].update(keyboardIntersectionHeight=float('nan')))
 def test_capture_failed(self):self.refused(lambda d:d['screenshot'].update(captured=False))
 def test_skipped_method(self):
  self.tree['testNodes'][0]['result']='Skipped'
  with self.assertRaises(AssertionError):self.validate()
 def test_missing_method(self):
  self.tree['testNodes'].pop()
  with self.assertRaises(AssertionError):self.validate()
 def test_missing_attachment(self):
  self.manifest[0]['attachments'].pop();self.save()
  with self.assertRaises(AssertionError):self.validate()
 def test_export_failure(self):
  self.exports['attachments']=1
  with self.assertRaises(AssertionError):self.validate()
if __name__=='__main__':unittest.main()
