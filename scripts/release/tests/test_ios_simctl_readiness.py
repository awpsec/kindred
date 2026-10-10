import importlib.util,json,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('readiness_runner',Path(__file__).resolve().parents[1]/'test-ios-simulator.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ReadinessTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
  p=patch.object(m,'OUT',self.root);p.start();self.addCleanup(p.stop);self.device={'udid':'selected-only'}
 def receipt(self):return json.loads((self.root/'simulator-transport-readiness.json').read_text())
 def test_selected_response_required_once_with_60second_budget(self):
  with patch.object(m,'_simulator_command',return_value=subprocess.CompletedProcess([],0,'selected-only\n','')) as call:
   m.wait_for_simulator_transport(self.device)
  self.assertEqual(call.call_count,1);self.assertEqual(call.call_args.args[0],['xcrun','simctl','getenv','selected-only','SIMULATOR_UDID'])
  self.assertEqual(call.call_args.kwargs['timeout'],60);self.assertTrue(self.receipt()['passed']);self.assertFalse(self.receipt()['response_is_native_effect_proof'])
 def test_wrong_device_fails(self):
  with patch.object(m,'_simulator_command',return_value=subprocess.CompletedProcess([],0,'other','')):
   with self.assertRaises(AssertionError):m.wait_for_simulator_transport(self.device)
  self.assertFalse(self.receipt()['passed'])
 def test_timeout_retained_no_retry(self):
  failure=subprocess.TimeoutExpired(['getenv'],60,output='partial')
  with patch.object(m,'_simulator_command',side_effect=failure) as call:
   with self.assertRaises(subprocess.TimeoutExpired) as got:m.wait_for_simulator_transport(self.device)
  self.assertIs(got.exception,failure);self.assertEqual(call.call_count,1);self.assertFalse(self.receipt()['passed'])
  self.assertEqual(self.receipt()['commands'][0]['stdout'],'partial')
 def test_receipt_error_does_not_replace_timeout(self):
  failure=subprocess.TimeoutExpired(['getenv'],60)
  with patch.object(m,'_simulator_command',side_effect=failure),patch.object(m,'record',side_effect=OSError('disk')):
   with self.assertRaises(subprocess.TimeoutExpired) as got:m.wait_for_simulator_transport(self.device)
  self.assertIs(got.exception,failure)
if __name__=='__main__':unittest.main()
