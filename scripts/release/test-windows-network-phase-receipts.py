"""Disposable phase-sidecar and harness API doubles; no native execution."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import shutil
import tempfile
import unittest
from unittest.mock import patch

HELPER=Path(__file__).with_name('test-windows-network-phases.py')
spec=importlib.util.spec_from_file_location('phase_probe',HELPER);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
REPO=HELPER.resolve().parents[2]

class PhaseTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.side=self.root/'trace';self.nonce='a'*32
        self.side.write_text(m.PROTOCOL+'\t'+self.nonce+'\n');self.identity=m.sidecar_identity(self.side)
    def tearDown(self):self.temp.cleanup()
    def trace(self,n,engine=True):
        text=m.PROTOCOL+'\t'+self.nonce+'\n'
        for i,phase in enumerate(m.PHASES[:n]):
            text+=phase+'\t'+str(i*20)+'\n'
            if i==0 and engine:text+='engine\t5.1.26100.1\t64\n'
        self.side.write_text(text);return m.read_sidecar(self.side,self.identity,self.nonce)
    def process(self,kind='timeout',**cleanup):
        return {'kind':kind,'elapsed_ms':10020,'cleanup':dict(kill_attempted=kind=='timeout',kill_succeeded=kind=='timeout',reaped=True,**cleanup)}
    def test_exact_script_flags_budget_and_runner_extraction(self):
        script,hidden=m.source_parts(REPO);probe=m.instrument(script,self.root/"a'quote")
        self.assertIn("a''quote",probe);self.assertEqual(probe.count('Get-NetAdapter -IncludeHidden'),1);self.assertEqual(probe.count('Get-NetIPAddress'),1)
        self.assertIn('ConvertTo-Json -Depth 4 -Compress -InputObject $kindredRows',probe)
        generated=m.harness(REPO,probe,hidden)
        self.assertIn('setup_progress::run_detailed',generated);self.assertIn('Duration::from_secs(10)',generated);self.assertIn('0x08000000',generated)
        self.assertIn('"-NoProfile","-NonInteractive","-Command"',generated)
        self.assertEqual(m.LIMIT_SECONDS,10)
    def test_startup_no_marker_stays_unresolved(self):
        trace=self.trace(0);got=m.classify(self.process(),trace,{},True)
        self.assertEqual(got['kind'],'command_timeout');self.assertEqual(got['phase_attribution'],'startup_or_script_initialization_unknown')
    def test_each_timeout_marker_retains_timeout_not_completed_claim(self):
        for n in range(1,len(m.PHASES)+1):
            with self.subTest(n=n):
                got=m.classify(self.process(),self.trace(n),{},True)
                self.assertEqual(got['kind'],'command_timeout');self.assertEqual(got['last_completed_marker'],m.PHASES[n-1])
    def test_complete_success_is_diagnostic_only(self):
        got=m.classify(self.process('success'),self.trace(10),{'kind':'valid'},True)
        self.assertEqual(got['kind'],'diagnostic_completed');self.assertFalse(got['native_release_gate_passed'])
    def test_incomplete_or_invalid_output_never_counts_as_completion(self):
        self.assertEqual(m.classify(self.process('success'),self.trace(5),{'kind':'valid'},True)['kind'],'incomplete_trace')
        self.assertEqual(m.classify(self.process('success'),self.trace(10),{'kind':'invalid'},True)['kind'],'output_failure')
    def test_command_nonzero_is_not_phase_timeout(self):
        self.assertEqual(m.classify(self.process('nonzero'),self.trace(2),{},True)['kind'],'command_failure')
    def test_cleanup_failure_separate_from_timeout(self):
        for key in ['reaped','kill_succeeded']:
            process=self.process();process['cleanup'][key]=False
            self.assertEqual(m.classify(process,self.trace(2),{},True)['kind'],'cleanup_failure')
            self.assertEqual(process['kind'],'timeout')
        self.assertEqual(m.classify(self.process(),self.trace(2),{},False)['kind'],'cleanup_failure')
    def test_malformed_secret_nonce_order_and_partial_marker_are_not_exposed(self):
        for extra in ['PRIVATE SECRET','adapters_started\t2\n','script_entered\t0\nscript_entered\t1\n','script_entered\t','engine\tPRIVATE SECRET\t64\n']:
            self.side.write_text(m.PROTOCOL+'\t'+self.nonce+'\n'+extra)
            got=m.read_sidecar(self.side,self.identity,self.nonce)
            self.assertEqual(got,{'kind':'invalid'});self.assertNotIn('SECRET',json.dumps(got))
            self.assertEqual(m.classify(self.process(),got,{},True)['kind'],'sidecar_integrity_failure')
        self.assertEqual(m.read_sidecar(self.side,self.identity,'b'*32)['kind'],'invalid')
        self.side.write_bytes(b'\xff');self.assertEqual(m.read_sidecar(self.side,self.identity,self.nonce)['kind'],'invalid')
    def test_missing_replaced_oversize_and_unreadable_sidecar(self):
        self.side.unlink();self.assertEqual(m.read_sidecar(self.side,self.identity,self.nonce)['kind'],'missing')
        self.side.write_text('x'*4097);current=m.sidecar_identity(self.side)
        self.assertEqual(m.read_sidecar(self.side,current,self.nonce)['kind'],'too_large')
        self.assertEqual(m.read_sidecar(self.side,(-1,-1),self.nonce)['kind'],'replaced')
        with patch.object(m,'sidecar_identity',side_effect=PermissionError()):
            self.assertEqual(m.read_sidecar(self.side,current,self.nonce)['kind'],'unreadable_or_unsafe')
    def test_symlink_and_hardlink_are_not_valid_sidecars(self):
        target=self.root/'target';target.write_text('x');self.side.unlink();self.side.symlink_to(target)
        self.assertEqual(m.read_sidecar(self.side,self.identity,self.nonce)['kind'],'unreadable_or_unsafe')
        self.side.unlink();os.link(target,self.side)
        self.assertEqual(m.read_sidecar(self.side,self.identity,self.nonce)['kind'],'unreadable_or_unsafe')
    def test_linux_cli_refuses_before_any_subprocess(self):
        with patch.object(sys,'argv',[str(HELPER),'--source-commit',m.SOURCE,'--expected-helper-sha256','x','--output',str(self.root/'out')]),patch.object(m,'is_windows',return_value=False),patch.object(m.subprocess,'run') as run:
            with self.assertRaises(SystemExit):m.main()
            run.assert_not_called()
    def test_prelaunch_sidecar_error_is_typed_without_starting_probe(self):
        output=self.root/'bad-sidecar'
        with patch.object(sys,'argv',[str(HELPER),'--source-commit',m.SOURCE,'--expected-helper-sha256',m.digest(HELPER.read_bytes()),'--output',str(output)]),patch.object(m,'is_windows',return_value=True),patch.object(m.subprocess,'check_output',return_value=m.SOURCE+'\n'),patch.object(m,'sidecar_identity',side_effect=PermissionError()),patch.object(m.subprocess,'run') as run,contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(m.main(),1);run.assert_not_called()
        result=json.loads((output/'phase-receipt.json').read_text());self.assertEqual(result['classification']['kind'],'sidecar_or_harness_preparation_failure');self.assertTrue(result['temporary_directory_removed'])
    def test_actual_main_double_build_exit_success_and_outer_timeout(self):
        for mode in ['success','nonzero','outer_timeout','build_failure','harness_nonzero','cleanup_failure']:
            with self.subTest(mode=mode):
                output=self.root/mode;calls=[]
                def run(argv,**kwargs):
                    calls.append((argv,kwargs))
                    if argv[0]=='cargo':return subprocess.CompletedProcess(argv,1 if mode=='build_failure' else 0,b'',b'')
                    if mode=='outer_timeout':raise subprocess.TimeoutExpired(argv,30)
                    root=Path(argv[1]);side=root/'phases.tsv';header=side.read_text();text=header
                    for i,phase in enumerate(m.PHASES):
                        text+=phase+'\t'+str(i*20)+'\n'
                        if i==0:text+='engine\t5.1.26100.1\t64\n'
                    side.write_text(text)
                    detail={'process':self.process('nonzero' if mode=='nonzero' else 'success'),'output':{'kind':'valid'},'output_removed':True}
                    return subprocess.CompletedProcess(argv,1 if mode=='harness_nonzero' else 0,json.dumps(detail).encode(),b'PRIVATE STDERR')
                with patch.object(sys,'argv',[str(HELPER),'--source-commit',m.SOURCE,'--expected-helper-sha256',m.digest(HELPER.read_bytes()),'--output',str(output)]),patch.object(m,'is_windows',return_value=True),patch.object(m.subprocess,'run',side_effect=run),patch.object(m.subprocess,'check_output',return_value=m.SOURCE+'\n'),patch.object(m.shutil,'rmtree',side_effect=PermissionError()) if mode=='cleanup_failure' else contextlib.nullcontext(),contextlib.redirect_stdout(io.StringIO()):
                    code=m.main()
                result=json.loads((output/'phase-receipt.json').read_text());self.assertEqual(code,0 if mode=='success' else 1)
                self.assertFalse(result['native_release_gate_passed']);self.assertEqual(result['temporary_directory_removed'],mode!='cleanup_failure');self.assertNotIn('PRIVATE',json.dumps(result))
                self.assertEqual(calls[0][1]['env']['CARGO_BUILD_JOBS'],'1');self.assertEqual(calls[0][1]['timeout'],180)
                if mode=='cleanup_failure':
                    self.assertEqual(result['classification']['kind'],'cleanup_failure');self.assertEqual(result['primary_outcome']['kind'],'diagnostic_completed')
                    shutil.rmtree(Path(calls[1][0][1]))
                if mode=='outer_timeout':self.assertFalse(result['classification']['owned_descendant_cleanup_proven'])

if __name__=='__main__':unittest.main()
