import importlib.util, subprocess, sys, time, unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
spec=importlib.util.spec_from_file_location('simctl_runner',Path(__file__).resolve().parents[1]/'test-ios-simulator.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class SimctlCommandTests(unittest.TestCase):
 def call(self,script,timeout=2):
  row={}; result=m._simulator_command([sys.executable,'-c',script],timeout,row)
  return result,row
 def test_success_retains_output_and_spawn_wait_measurements(self):
  result,row=self.call("import sys; print('1'); print('note',file=sys.stderr)")
  self.assertEqual(result.stdout,'1\n');self.assertEqual(result.stderr,'note\n')
  self.assertGreaterEqual(row['spawn_seconds'],0);self.assertGreaterEqual(row['wait_seconds'],0)
  self.assertFalse(row['cleanup']['kill_attempted']);self.assertTrue(row['cleanup']['reaped'])
 def test_nonzero_keeps_output_and_failure(self):
  row={}
  with self.assertRaises(subprocess.CalledProcessError) as got:
   m._simulator_command([sys.executable,'-c',"import sys;print('partial');sys.exit(7)"],2,row)
  self.assertEqual(got.exception.returncode,7);self.assertEqual(got.exception.output,'partial\n')
  self.assertTrue(row['cleanup']['reaped'])
 def test_timeout_kills_only_owned_command_group_and_retains_partial(self):
  row={};started=time.monotonic()
  with self.assertRaises(subprocess.TimeoutExpired) as got:
   m._simulator_command([sys.executable,'-c',"import os,time;print('partial',flush=True);p=os.fork();time.sleep(20)"],0.3,row)
  self.assertLess(time.monotonic()-started,3);self.assertEqual(got.exception.timeout,0.3)
  self.assertIn('partial',got.exception.output);self.assertTrue(row['cleanup']['kill_attempted']);self.assertTrue(row['cleanup']['reaped'])
 def test_spawn_failure_is_not_timeout(self):
  row={}
  with self.assertRaises(FileNotFoundError):m._simulator_command(['/missing-kindred-command'],1,row)
  self.assertEqual(row['process_phase'],'spawn');self.assertFalse(row['cleanup']['kill_attempted'])
 def test_spawn_time_consumes_execution_budget(self):
  row={};process=MagicMock();process.pid=12345;process.returncode=0
  with patch.object(m.subprocess,'Popen',return_value=process),patch.object(m.time,'monotonic',side_effect=[0,0.4,0.4,0.4,0.5,0.5]):
   m._simulator_command(['test-command'],1,row)
  self.assertAlmostEqual(process.wait.call_args.kwargs['timeout'],0.6)
 def test_cleanup_failure_keeps_timeout_and_reports_unreaped(self):
  row={};process=MagicMock();process.pid=12345;process.wait.side_effect=subprocess.TimeoutExpired(['test'],1)
  with patch.object(m.subprocess,'Popen',return_value=process),patch.object(m.os,'killpg',side_effect=PermissionError('denied')):
   with self.assertRaises(subprocess.TimeoutExpired):m._simulator_command(['test'],1,row)
  self.assertFalse(row['cleanup']['reaped']);self.assertEqual(row['cleanup']['error_type'],'PermissionError')
  self.assertEqual(row['cleanup']['reap_error_type'],'TimeoutExpired')
if __name__=='__main__':unittest.main()
