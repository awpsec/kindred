import importlib.util,io,json,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
spec=importlib.util.spec_from_file_location('reduce_runner',Path(__file__).resolve().parents[1]/'test-ios-simulator.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ReduceMotionDiagnosticsTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
  out=patch.object(m,'OUT',self.root);out.start();self.addCleanup(out.stop)
  self.device={'udid':'selected-only','state':'Booted'}
 def receipt(self):
  self.assertTrue((self.root/'reduce-motion-setup.json').exists(),'Setup receipt including failed-command output must be retained')
  return json.loads((self.root/'reduce-motion-setup.json').read_text())
 def test_timeout_partial_output_and_original_exception_retained(self):
  failure=subprocess.TimeoutExpired(['write'],10,output=b'partial write output',stderr=b'partial write error')
  with patch.object(m.subprocess,'run',side_effect=[failure]+[OSError('probe unavailable')]*3):
   with self.assertRaises(subprocess.TimeoutExpired) as got:m.configure_simulator_reduce_motion(self.device)
  self.assertIs(got.exception,failure)
  row=self.receipt();self.assertFalse(row['passed']);self.assertEqual(row['phase'],'write')
  self.assertEqual(row['commands'][0]['stdout'],'partial write output');self.assertEqual(row['commands'][0]['stderr'],'partial write error')
  self.assertEqual(row['commands'][0]['status'],'timeout');self.assertEqual(row['commands'][0]['deadline_seconds'],10)

 def command(self,code=0,stdout='',stderr=''):
  return subprocess.CompletedProcess([],code,stdout,stderr)
 def inventory(self,udid='selected-only'):
  return self.command(stdout=json.dumps({'devices':{'runtime':[dict(udid='unrelated',state='Booted',dataPath='do-not-retain'),dict(udid=udid,state='Booted',isAvailable=True)]}}))
 def test_success_records_both_commands_without_failure_probes(self):
  with patch.object(m.subprocess,'run',side_effect=[self.command(stdout='written\n'),self.command(stdout='1\n')]) as run:
   m.configure_simulator_reduce_motion(self.device)
  row=self.receipt();self.assertTrue(row['passed']);self.assertFalse(row['preference_readback_is_native_runtime_proof'])
  self.assertEqual(len(run.call_args_list),2);self.assertEqual([c.kwargs['timeout'] for c in run.call_args_list],[10,10])
  self.assertTrue(all(c.kwargs['check'] for c in run.call_args_list));self.assertEqual(row['commands'][0]['stdout'],'written\n')
  self.assertNotIn('probes',row)
 def test_nonzero_preserves_exact_status_and_selected_probes(self):
  failure=subprocess.CalledProcessError(7,['write'],output='out',stderr='err')
  with patch.object(m.subprocess,'run',side_effect=[failure,self.inventory(),self.command(stdout='selected-only'),self.command(stdout='0')]) as run:
   with self.assertRaises(subprocess.CalledProcessError) as got:m.configure_simulator_reduce_motion(self.device)
  self.assertIs(got.exception,failure);row=self.receipt();self.assertEqual(row['commands'][0]['exit_code'],7)
  self.assertEqual(row['commands'][0]['status'],'nonzero');self.assertEqual(row['commands'][0]['stderr'],'err')
  self.assertEqual(row['probes']['state']['selected_device']['udid'],'selected-only');self.assertFalse(row['probes']['preference']['enabled'])
  self.assertNotIn('unrelated',json.dumps(row));self.assertNotIn('do-not-retain',json.dumps(row))
  self.assertTrue(all(c.kwargs['timeout']<=5 for c in run.call_args_list[1:]));self.assertEqual(row['probe_total_budget_seconds'],15)
 def test_probe_timeout_is_unavailable_not_false_or_original_replacement(self):
  failure=subprocess.TimeoutExpired(['write'],10)
  with patch.object(m.subprocess,'run',side_effect=[failure,subprocess.TimeoutExpired(['list'],5,output='private inventory partial'),self.command(stdout='other'),subprocess.TimeoutExpired(['read'],5,output='1',stderr='partial read')]):
   with self.assertRaises(subprocess.TimeoutExpired) as got:m.configure_simulator_reduce_motion(self.device)
  self.assertIs(got.exception,failure);row=self.receipt()
  self.assertEqual(row['probes']['state']['status'],'unavailable');self.assertEqual(row['probes']['health']['status'],'wrong_device')
  self.assertEqual(row['probes']['preference']['status'],'unavailable');self.assertNotIn('enabled',row['probes']['preference'])
  self.assertNotIn('private inventory partial',json.dumps(row));self.assertEqual(row['commands'][-1]['stdout'],'1')
 def test_read_timeout_stays_read_failure_and_keeps_partial_output(self):
  failure=subprocess.TimeoutExpired(['read'],10,output=b'partial read',stderr=b'read error')
  with patch.object(m.subprocess,'run',side_effect=[self.command(),failure]+[OSError('probe')]*3):
   with self.assertRaises(subprocess.TimeoutExpired) as got:m.configure_simulator_reduce_motion(self.device)
  self.assertIs(got.exception,failure);row=self.receipt();self.assertEqual(row['phase'],'read');self.assertEqual(row['commands'][1]['stdout'],'partial read')
 def test_false_setup_readback_cannot_be_repaired_by_diagnostic_true(self):
  with patch.object(m.subprocess,'run',side_effect=[self.command(),self.command(stdout='0'),self.inventory(),self.command(stdout='selected-only'),self.command(stdout='1')]):
   with self.assertRaises(AssertionError):m.configure_simulator_reduce_motion(self.device)
  row=self.receipt();self.assertFalse(row['passed']);self.assertEqual(row['preference_readback'],'0');self.assertTrue(row['probes']['preference']['enabled'])
 def test_wrong_inventory_device_is_unavailable_not_selected_ready(self):
  failure=subprocess.TimeoutExpired(['write'],10)
  with patch.object(m.subprocess,'run',side_effect=[failure,self.inventory('wrong'),self.command(stdout='wrong'),self.command(stdout='garbage')]):
   with self.assertRaises(subprocess.TimeoutExpired):m.configure_simulator_reduce_motion(self.device)
  row=self.receipt();self.assertEqual(row['probes']['state']['status'],'unavailable');self.assertEqual(row['probes']['health']['status'],'wrong_device')
  self.assertIsNone(row['probes']['preference']['enabled'])
 def test_diagnostic_exception_does_not_replace_original(self):
  failure=subprocess.TimeoutExpired(['write'],10)
  with patch.object(m.subprocess,'run',side_effect=failure),patch.object(m,'_reduce_motion_failure_probes',side_effect=OSError('probe writer')):
   with self.assertRaises(subprocess.TimeoutExpired) as got:m.configure_simulator_reduce_motion(self.device)
  self.assertIs(got.exception,failure);self.assertEqual(self.receipt()['diagnostic_error_type'],'OSError')
 def test_receipt_io_exception_does_not_replace_original(self):
  failure=subprocess.TimeoutExpired(['write'],10)
  with patch.object(m.subprocess,'run',side_effect=failure),patch.object(m,'_record_reduce_motion_status',side_effect=OSError('disk')):
   with self.assertRaises(subprocess.TimeoutExpired) as got:m.configure_simulator_reduce_motion(self.device)
  self.assertIs(got.exception,failure)
 def test_probe_total_deadline_skips_remaining_commands(self):
  status={'commands':[]}
  with patch.object(m.time,'monotonic',side_effect=[0,0,0,6,16,16]),patch.object(m.subprocess,'run',return_value=self.inventory()) as run:
   m._reduce_motion_failure_probes(self.device,status)
  self.assertEqual(run.call_count,1);self.assertEqual(status['probes']['health']['status'],'budget_exhausted');self.assertEqual(status['probes']['preference']['status'],'budget_exhausted')
 def test_terminal_ready_setup_reaches_unchanged_native_command_without_claiming_test_pass(self):
  root=self.root/'repo';(root/'mobile/ios/KindredCompanionTests').mkdir(parents=True)
  (root/'mobile/ios/KindredCompanionTests/ComposerUIKitTests.swift').write_text('test fixture')
  out=root/'ios-validation';source='0'*40
  fixture=MagicMock();fixture.poll.return_value=None
  native=MagicMock();native.wait.return_value=0
  captured=[]
  def popen(command,**kwargs):
   captured.append(command);return fixture if command[0]=='node' else native
  def output(command,**kwargs):
   if command[0]=='git':return source+'\n'
   if command[:4]==['xcrun','simctl','list','devices']:return json.dumps({'devices':{'com.apple.CoreSimulator.SimRuntime.iOS-26-5':[dict(self.device,name='iPhone test',isAvailable=True)]}})
   return '0\n'
  def run(command,**kwargs):
   if command[0]=='openssl':Path(command[command.index('-keyout')+1]).write_text('test-only')
   return self.command(stdout='1' if 'ReduceMotionEnabled' in command and 'read' in command else '0')
  with patch.object(m,'ROOT',root),patch.object(m,'OUT',out),patch.dict(m.os.environ,EXPECTED_SOURCE=source),patch.object(m.subprocess,'run',side_effect=run),patch.object(m.subprocess,'check_output',side_effect=output),patch.object(m.subprocess,'Popen',side_effect=popen),patch.object(m.ssl,'create_default_context'),patch.object(m.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps({'origin':'https://localhost:8765','ui_sha256':{}}).encode())):
   with self.assertRaises(SystemExit):m.main('composer')
  self.assertEqual(len(captured),2);self.assertEqual(captured[-1][0],'xcodebuild')
  self.assertIn('CODE_SIGNING_ALLOWED=NO',captured[-1]);self.assertIn('-only-testing:KindredCompanionTests/ComposerUIKitTests',captured[-1])
  self.assertEqual(native.wait.call_args.kwargs['timeout'],720)
  row=json.loads((out/'test-receipt.json').read_text());self.assertFalse(row['passed']);self.assertNotIn('native_test_count',row)
  self.assertFalse(row['real_Apple_recognition_selected']);self.assertEqual(row['required_native_phases'],53)

if __name__=='__main__':unittest.main()
