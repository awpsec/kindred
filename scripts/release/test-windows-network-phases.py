"""Test-only Windows phase probe. Never satisfies or alters a release gate.

No warm-up, owner profile, Docker, network mutation, or raw inventory receipt.
Builds the exact production runner in an owned temporary harness. Run only
under a separately selected native diagnostic boundary.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import tomllib
import uuid

SOURCE = '18e9629d47948454dc903a158065f35a31e574fc'
HASHES = {
    'network_interfaces.rs': '77e6c57c5f765bd65a70ea5f72f22c218df9039d2402d00d20cc652e2d20d3b1',
    'setup_progress.rs': '1f1f907bf1e0daf6a081b953367f2120fb9e9472a661aac719db77987411f1a4',
    'profiles.rs': 'f9ae5bdf350a8df711af78536062573cd8a36d9e6264eb034dcbabe30b01460b',
    'network_plan.rs': '30442588fe55ea95ae81b062ebedc19288b8a648573de565471b08fa8a6b95a6',
    'standalone_network.rs': 'c792e39b6e9ad4cbf0c88d4c64c5c5938bbe4ded7dcfdd313047a03bad092032',
}
PHASES = ['script_entered', 'encoding_ready', 'adapters_started', 'adapters_finished',
          'addresses_started', 'addresses_finished', 'grouping_started',
          'grouping_finished', 'serialization_started', 'serialization_finished']
LIMIT_SECONDS = 10
PROTOCOL = 'kindred-network-phases-v1'

def digest(data): return hashlib.sha256(data).hexdigest()

def is_windows(): return os.name == 'nt'

def source_parts(repo):
    src = repo / 'desktop/src'
    if digest((repo/'desktop/Cargo.lock').read_bytes()) != '64026d9995a3f9ac97424abd776cce521e3e3768899273956cf1dacdd1e59088':
        raise ValueError('Production dependency lock mismatch')
    for name, expected in HASHES.items():
        if digest((src/name).read_bytes()) != expected:
            raise ValueError('Production source hash mismatch')
    text = (src/'network_interfaces.rs').read_text()
    windows = text.split('#[cfg(windows)]\npub fn discover_with_diagnostics(', 1)[1]
    literal = re.search(r'let script = ("[^\n]+");', windows).group(1)
    script = json.loads(literal)
    assert 'command.args(["-NoProfile", "-NonInteractive", "-Command", script]);' in windows
    assert 'std::time::Duration::from_secs(10)' in text
    hidden = (src/'profiles.rs').read_text()
    hidden = hidden[hidden.index('pub(crate) fn hidden('):hidden.index('\nfn restart(', hidden.index('pub(crate) fn hidden('))]
    assert 'command.creation_flags(0x08000000)' in hidden
    return script, hidden

def instrument(script, sidecar):
    # These exact anchors fail closed if the production script changes. The
    # factorization is diagnostic only, never passed off as the unchanged gate.
    prelude, tail = script.split('$adapters=@(Get-NetAdapter -IncludeHidden); ', 1)
    prefix = 'ConvertTo-Json -Depth 4 -Compress -InputObject '
    assert tail.startswith(prefix)
    expression = tail[len(prefix):]
    assert expression.count('Get-NetIPAddress') == 1
    expression = expression.replace('Get-NetIPAddress', '$kindredIPs')
    path = str(sidecar).replace("'", "''")
    marker = ("$ErrorActionPreference='Stop'; $kindredClock=[Diagnostics.Stopwatch]::StartNew(); "
              "function kindredPhase([string]$phase) { [IO.File]::AppendAllText('" + path +
              "', $phase+[char]9+$kindredClock.ElapsedMilliseconds.ToString([Globalization.CultureInfo]::InvariantCulture)+[char]10); }; ")
    return (marker + "kindredPhase 'script_entered'; " +
            "[IO.File]::AppendAllText('" + path + "', 'engine'+[char]9+$PSVersionTable.PSVersion.ToString()+[char]9+([IntPtr]::Size*8)+[char]10); " +
            prelude + "kindredPhase 'encoding_ready'; kindredPhase 'adapters_started'; " +
            "$adapters=@(Get-NetAdapter -IncludeHidden); kindredPhase 'adapters_finished'; " +
            "kindredPhase 'addresses_started'; $kindredIPs=@(Get-NetIPAddress); kindredPhase 'addresses_finished'; " +
            "kindredPhase 'grouping_started'; $kindredRows=" + expression + "; kindredPhase 'grouping_finished'; " +
            "kindredPhase 'serialization_started'; ConvertTo-Json -Depth 4 -Compress -InputObject $kindredRows; kindredPhase 'serialization_finished';")

def sidecar_identity(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError('Unsafe sidecar')
    return (info.st_dev, info.st_ino)

def read_sidecar(path, identity, nonce):
    # No exception strings or untrusted line contents escape into receipts.
    try:
        if sidecar_identity(path) != identity:
            return {'kind': 'replaced'}
        with path.open('rb') as f:
            opened=f.fileno(); info=os.fstat(opened)
            if (info.st_dev,info.st_ino)!=identity or info.st_nlink!=1: return {'kind':'replaced'}
            raw=f.read(4097)
        if len(raw)>4096: return {'kind':'too_large'}
        if sidecar_identity(path)!=identity: return {'kind':'replaced'}
    except FileNotFoundError: return {'kind': 'missing'}
    except (OSError, ValueError): return {'kind': 'unreadable_or_unsafe'}
    try:
        lines = raw.decode('ascii').splitlines()
        if not lines or lines.pop(0) != PROTOCOL+'\t'+nonce: raise ValueError()
        phases = []; engine = None; previous = -1
        for line in lines:
            row = line.split('\t')
            if row[0] == 'engine':
                if engine or len(phases) != 1 or len(row) != 3: raise ValueError()
                if not re.fullmatch(r'\d{1,6}(\.\d{1,6}){1,3}', row[1]) or row[2] not in ['32', '64']: raise ValueError()
                engine = {'version': row[1], 'bits': int(row[2])}; continue
            if len(row) != 2 or len(phases) >= len(PHASES) or row[0] != PHASES[len(phases)]: raise ValueError()
            if not re.fullmatch(r'\d{1,9}', row[1]): raise ValueError()
            elapsed = int(row[1])
            if elapsed < previous: raise ValueError()
            previous = elapsed; phases.append({'phase': row[0], 'elapsed_ms': elapsed})
        if len(phases)>1 and engine is None: raise ValueError()
        return {'kind': 'valid', 'phases': phases, 'engine': engine}
    except (ValueError, UnicodeError): return {'kind': 'invalid'}

def classify(process, trace, output, removed):
    cleanup = process.get('cleanup', {})
    if not removed or not cleanup.get('reaped') or (cleanup.get('kill_attempted') and not cleanup.get('kill_succeeded')):
        return {'kind': 'cleanup_failure', 'phase_attribution': 'unknown'}
    if trace['kind'] != 'valid':
        return {'kind': 'sidecar_integrity_failure', 'phase_attribution': 'unknown'}
    phases = trace['phases']
    last = phases[-1]['phase'] if phases else None
    if process['kind'] == 'timeout':
        return {'kind': 'command_timeout', 'last_completed_marker': last,
                'phase_attribution': last or 'startup_or_script_initialization_unknown'}
    if process['kind'] != 'success':
        return {'kind': 'command_failure', 'last_completed_marker': last}
    if last != PHASES[-1] or trace['engine'] is None:
        return {'kind': 'incomplete_trace', 'phase_attribution': 'unknown'}
    if output.get('kind') != 'valid':
        return {'kind': 'output_failure', 'phase_attribution': 'unknown'}
    return {'kind': 'diagnostic_completed', 'native_release_gate_passed': False}

def harness(repo, script, hidden):
    runner = json.dumps(str(repo/'desktop/src/setup_progress.rs'),ensure_ascii=False)
    return '#[path='+runner+'] mod setup_progress;\nmod local_server {pub const ORIGIN:&str="http://127.0.0.1:9444";}\nmod profiles {use std::process::Command;'+hidden+'}\n'+r'''
fn main() {
 let root=std::path::PathBuf::from(std::env::args().nth(1).unwrap());
 let output=root.join("output.txt");
 let mut command=std::process::Command::new("powershell.exe");
 command.args(["-NoProfile","-NonInteractive","-Command",SCRIPT]);
 profiles::hidden(&mut command);
 let result=setup_progress::run_detailed(&mut command,&output,std::time::Duration::from_secs(10),|_|{});
 let process=match result {
  Ok(receipt)=>serde_json::json!({"kind":"success","elapsed_ms":receipt.elapsed_ms,"cleanup":{"kill_attempted":false,"kill_succeeded":false,"reaped":true}}),
  Err(failure)=>serde_json::to_value(failure).unwrap()
 };
 let mut metadata=serde_json::json!({"kind":"not_read"});
 if process["kind"]=="success" {
  metadata=match std::fs::metadata(&output) {
   Ok(m) if m.len()<=262144=>match std::fs::read(&output) {
    Ok(bytes)=>match serde_json::from_slice::<Vec<serde_json::Value>>(&bytes) {
     Ok(rows)=>serde_json::json!({"kind":"valid","bytes":bytes.len(),"rows":rows.len()}),
     Err(_)=>serde_json::json!({"kind":"invalid"})
    },
    Err(_)=>serde_json::json!({"kind":"unreadable"})
   },
   Ok(_)=>serde_json::json!({"kind":"too_large"}),
   Err(_)=>serde_json::json!({"kind":"missing"})
  };
 }
 let removed=match std::fs::remove_file(&output) {Ok(())=>true,Err(e)=>e.kind()==std::io::ErrorKind::NotFound};
 println!("{}",serde_json::json!({"process":process,"output":metadata,"output_removed":removed}));
}
'''.replace('SCRIPT', json.dumps(script,ensure_ascii=False))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--source-commit', required=True, choices=[SOURCE])
    parser.add_argument('--expected-helper-sha256', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not is_windows(): raise SystemExit('Native execution is Windows-only; local doubles are separate')
    if digest(Path(__file__).read_bytes()) != args.expected_helper_sha256: raise SystemExit('Probe helper hash mismatch')
    repo = args.source.resolve()
    source_commit = subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
    if source_commit != SOURCE: raise SystemExit('Frozen application source mismatch')
    script, hidden = source_parts(repo)
    out = args.output.resolve(); out.mkdir(parents=True, exist_ok=True)
    if (out/'phase-receipt.json').exists(): raise SystemExit('Refuse to overwrite an earlier diagnostic')
    probe_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=Path(__file__).resolve().parents[2],text=True).strip()
    receipt = {'source_commit': SOURCE, 'probe_commit':probe_commit, 'helper_sha256': args.expected_helper_sha256,
               'production_sha256': HASHES, 'production_script_sha256': digest(script.encode()),
               'budget_seconds': LIMIT_SECONDS, 'native_release_gate_passed': False,
               'production_gate_changed': False, 'native_diagnostic_completed': False,
               'powershell_invocations_requested': 1, 'warmup_requested': False, 'prior_original_probe_in_same_job': True, 'application_rebuilt': False,
               'compiler_scope': 'Owned diagnostic harness only; frozen app executable is not compiled'}
    root = Path(tempfile.mkdtemp(prefix='kindred-network-phase-'))
    try:
        (root/'src').mkdir(); sidecar = root/'phases.tsv'; nonce=uuid.uuid4().hex
        sidecar.write_text(PROTOCOL+'\t'+nonce+'\n',encoding='ascii')
        identity = sidecar_identity(sidecar)
        instrumented = instrument(script, sidecar)
        receipt['instrumented_script_sha256'] = digest(instrumented.encode())
        versions={p['name']:p['version'] for p in tomllib.loads((repo/'desktop/Cargo.lock').read_text())['package']}
        deps='\n'.join(f'{n} = {{ version = "={versions[n]}"'+(', features = ["derive"]' if n=='serde' else '')+' }' for n in ['serde','serde_json'])
        (root/'Cargo.toml').write_text('[package]\nname="kindred-network-phase-probe"\nversion="0.0.0"\nedition="2024"\n[dependencies]\n'+deps+'\n')
        (root/'src/main.rs').write_text(harness(repo,instrumented,hidden))
        env={**os.environ,'CARGO_TARGET_DIR':str(repo/'desktop/target'),'CARGO_BUILD_JOBS':'1'}
        try:
            built=subprocess.run(['cargo','build','--release','--offline','--target','x86_64-pc-windows-msvc','--manifest-path',str(root/'Cargo.toml')],env=env,capture_output=True,timeout=180)
            if built.returncode: raise ValueError('build')
            exe=repo/'desktop/target/x86_64-pc-windows-msvc/release/kindred-network-phase-probe.exe'
            result=subprocess.run([str(exe),str(root)],capture_output=True,timeout=30)
            detail=json.loads(result.stdout)
            trace=read_sidecar(sidecar,identity,nonce)
            receipt.update(detail,sidecar=trace,harness_exit_code=result.returncode)
            receipt['classification']=classify(detail['process'],trace,detail['output'],detail['output_removed'])
            if result.returncode != 0:
                receipt['classification']={'kind':'harness_failure','phase_attribution':'unknown'}
            receipt['native_diagnostic_completed']=receipt['classification']['kind']=='diagnostic_completed'
        except subprocess.TimeoutExpired:
            receipt['classification']={'kind':'outer_timeout','phase_attribution':'unknown','owned_descendant_cleanup_proven':False}
        except (OSError,ValueError,KeyError):
            receipt['classification']={'kind':'harness_or_build_failure','phase_attribution':'unknown'}
    except (OSError,ValueError):
        receipt['classification']={'kind':'sidecar_or_harness_preparation_failure','phase_attribution':'unknown'}
    finally:
        try: shutil.rmtree(root)
        except OSError: pass
    receipt['temporary_directory_removed']=not root.exists()
    if not receipt['temporary_directory_removed']:
        receipt['native_diagnostic_completed']=False
        receipt['primary_outcome']=receipt.get('classification')
        receipt['classification']={'kind':'cleanup_failure','phase_attribution':'unknown'}
    with (out/'phase-receipt.json').open('x') as f: f.write(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt))
    return 0 if receipt['native_diagnostic_completed'] else 1

if __name__ == '__main__': raise SystemExit(main())
