import copy,json,unittest,io,subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock
import test_ios_composer_evidence as composer_fixture
m=composer_fixture.m
class AppearanceEvidenceTests(unittest.TestCase):
 def setUp(self):
  self.fixture=composer_fixture.ComposerEvidenceTests();self.fixture.setUp();self.addCleanup(self.fixture.doCleanups)
  self.root=self.fixture.root;self.manifest=self.fixture.manifest
  self.summary=dict(totalTestCount=10,passedTests=10,failedTests=0)
  self.tree=copy.deepcopy(self.fixture.tree)
  for method,phases in m.APPEARANCE_PHASES.items():
   self.tree['testNodes'].append(dict(nodeType='Test Case',nodeIdentifier=method,result='Passed'));rows=[]
   for phase in phases:
    _,theme,scale,state=phase.split('-');role='Administrator' if state=='administrator' else ('Owner, administrator' if state in ('owner','longTitleOwner') else 'none')
    label='Capture workspace'+(' '+role if role!='none' else '')
    d=dict(schemaVersion=1,phase=phase,scenario=state,theme=theme,textSize=scale,requestedCategory='UICTContentSizeCategoryL' if scale=='default' else 'UICTContentSizeCategoryAccessibilityXXXL',observedCategory='UICTContentSizeCategoryL' if scale=='default' else 'UICTContentSizeCategoryAccessibilityXXXL',observedInterfaceStyle=1 if theme=='light' else 2,nativeBodyPointSize=17 if scale=='default' else 53,nativeBodyFontName='.SFUI-Regular',orientation=1,windowBounds=dict(x=0,y=0,width=400,height=900),safeArea=dict(top=20,bottom=20,left=0,right=0),signedIn=state!='signedOut',role='administrator' if state=='administrator' else ('owner' if state in ('owner','longTitleOwner') else 'none'),expectedRoleLabel=role,rowLabel=label,rowFrame=dict(x=10,y=40,width=380,height=80),stableSamples=2,apiPaths=['GET /identity/profiles'] if state!='signedOut' else [],accessibility=[dict(label=label),dict(label='Notifications on'),dict(label='Current account')],nativeReduceMotion=True,nativeDarkerColors=False,proofScope='native rendering',windowIsKey=True,windowHidden=False,hostAttached=True,renderSucceeded=True)
    for suffix,data in [('-screenshot.png',b'\x89PNG\r\n\x1a\nfixture'),('-geometry.json',json.dumps(d).encode())]:
     n=phase+suffix;(self.root/n).write_bytes(data);rows.append(dict(suggestedHumanReadableName=n,exportedFileName=n))
   self.manifest.append(dict(testIdentifier=method,attachments=rows))
  self.fixture.save()
 def validate(self):return m.validate_release_ui_evidence(self.fixture.exports,self.summary,self.tree,self.root)
 def mutate(self,field,value,phase='accounts-light-default-administrator'):
  p=self.root/(phase+'-geometry.json');d=json.loads(p.read_text());d[field]=value;p.write_text(json.dumps(d))
 def test_complete_77pairs_10methods(self):self.assertEqual(self.validate(),10)
 def test_missing_method(self):
  self.tree['testNodes'].pop()
  with self.assertRaises(AssertionError):self.validate()
 def test_partial_scope_cannot_pass(self):
  with self.assertRaises(AssertionError):m.validate_release_ui_evidence(self.fixture.exports,self.fixture.summary,self.fixture.tree,self.root)
 def test_failed_method(self):
  self.tree['testNodes'][-1]['result']='Failed'
  with self.assertRaises(AssertionError):self.validate()
 def test_missing_phase(self):
  self.manifest[-1]['attachments'].pop();self.fixture.save()
  with self.assertRaises(AssertionError):self.validate()
 def test_wrong_method_binding(self):
  self.manifest[-1]['testIdentifier']=self.manifest[-2]['testIdentifier'];self.fixture.save()
  with self.assertRaises(AssertionError):self.validate()
 def test_wrong_phase(self):
  self.mutate('phase','other')
  with self.assertRaises(AssertionError):self.validate()
 def test_native_trait_mismatch(self):
  self.mutate('observedCategory','UICTContentSizeCategoryL','accounts-light-ax-owner')
  with self.assertRaises(AssertionError):self.validate()
 def test_theme_mismatch(self):
  self.mutate('observedInterfaceStyle',2)
  with self.assertRaises(AssertionError):self.validate()
 def test_native_reduce_motion_false(self):
  self.mutate('nativeReduceMotion',False)
  with self.assertRaises(AssertionError):self.validate()
 def test_render_failed(self):
  self.mutate('renderSucceeded',False)
  with self.assertRaises(AssertionError):self.validate()
 def test_clipped_native_row(self):
  self.mutate('rowFrame',dict(x=390,y=40,width=380,height=80))
  with self.assertRaises(AssertionError):self.validate()
 def test_row_height_changed(self):
  self.mutate('rowFrame',dict(x=10,y=40,width=380,height=85))
  with self.assertRaises(AssertionError):self.validate()
 def test_native_numeric_nan(self):
  self.mutate('nativeBodyPointSize',float('nan'))
  with self.assertRaises(AssertionError):self.validate()
 def test_identity_write(self):
  self.mutate('apiPaths',['POST /identity/profiles'])
  with self.assertRaises(AssertionError):self.validate()
 def test_signedout_stale_badge(self):
  self.mutate('accessibility',[dict(label='Administrator'),dict(label='Notifications on'),dict(label='Current account')],'accounts-light-default-signedOut')
  with self.assertRaises(AssertionError):self.validate()
 def test_missing_bellcheck(self):
  self.mutate('accessibility',[])
  with self.assertRaises(AssertionError):self.validate()
 def test_invalid_image(self):
  (self.root/'accounts-light-default-administrator-screenshot.png').write_bytes(b'notimage')
  with self.assertRaises(AssertionError):self.validate()
 def test_custom_mobile_font_rejected(self):
  self.mutate('nativeBodyFontName','Inter-Regular')
  with self.assertRaises(AssertionError):self.validate()
 def test_wrong_observed_role(self):
  self.mutate('role','owner')
  with self.assertRaises(AssertionError):self.validate()
 def test_release_ui_main_selects10methods_and_fails_without_xcresult(self):
  self.device={'udid':'selected-only','state':'Booted'}; root=self.root/'repo';(root/'mobile/ios/KindredCompanionTests').mkdir(parents=True)
  (root/'mobile/ios/KindredCompanionTests/ComposerUIKitTests.swift').write_text('test fixture')
  (root/'mobile/ios/KindredCompanionTests/AccountsAppearanceUIKitTests.swift').write_text('test fixture')
  out=root/'ios-validation';source='0'*40
  fixture=MagicMock();fixture.poll.return_value=None
  native=MagicMock();native.wait.return_value=0
  captured=[];setup_processes=[]
  def popen(command,**kwargs):
   if command[:2]==['xcrun','simctl']:
    process=MagicMock();process.pid=12345;process.returncode=0;process.wait.return_value=0
    kwargs['stdout'].write(b'1\n' if 'read' in command else b'');kwargs['stdout'].flush()
    setup_processes.append((command,process));return process
   captured.append(command);return fixture if command[0]=='node' else native
  def output(command,**kwargs):
   if command[0]=='git':return source+'\n'
   if command[:4]==['xcrun','simctl','list','devices']:return json.dumps({'devices':{'com.apple.CoreSimulator.SimRuntime.iOS-26-5':[dict(self.device,name='iPhone test',isAvailable=True)]}})
   if 'ReduceMotionEnabled' in command:return '1\n'
   return '0\n'
  def run(command,**kwargs):
   if command[0]=='openssl':Path(command[command.index('-keyout')+1]).write_text('test-only')
   return subprocess.CompletedProcess([],0,'1' if 'ReduceMotionEnabled' in command and 'read' in command else '0','')
  with patch.object(m,'ROOT',root),patch.object(m,'OUT',out),patch.dict(m.os.environ,EXPECTED_SOURCE=source),patch.object(m.subprocess,'run',side_effect=run),patch.object(m.subprocess,'check_output',side_effect=output),patch.object(m.subprocess,'Popen',side_effect=popen),patch.object(m.ssl,'create_default_context'),patch.object(m.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps({'origin':'https://localhost:8765','ui_sha256':{}}).encode())):
   with self.assertRaises(SystemExit):m.main('release-ui')
  if hasattr(m,'_simulator_command'):
   self.assertEqual(len(setup_processes),2)
   self.assertEqual([command[4] for command,process in setup_processes],['defaults','defaults'])
   self.assertEqual([command[5] for command,process in setup_processes],['write','read'])
   self.assertTrue(all(0 < process.wait.call_args.kwargs['timeout'] <= 10 for command,process in setup_processes))
  self.assertEqual(len(captured),2);self.assertEqual(captured[-1][0],'xcodebuild')
  self.assertIn('CODE_SIGNING_ALLOWED=NO',captured[-1]);self.assertIn('-only-testing:KindredCompanionTests/ComposerUIKitTests',captured[-1])
  self.assertEqual(native.wait.call_args.kwargs['timeout'],720)
  row=json.loads((out/'test-receipt.json').read_text());self.assertFalse(row['passed']);self.assertNotIn('native_test_count',row)
  self.assertFalse(row['real_Apple_recognition_selected']);self.assertEqual(row['required_native_phases'],77);self.assertEqual(len(row['required_methods']),10);self.assertEqual(row['required_appearance_pairs'],24)
  self.assertIn('-only-testing:KindredCompanionTests/AccountsAppearanceUIKitTests',captured[-1])

if __name__=='__main__':unittest.main()
