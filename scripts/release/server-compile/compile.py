"""One explicit source-bound server compile/package inside FIRST Linux45.

No historical bootstrap entrypoint or backend tests are imported or executed.
"""
import base64, hashlib, io, json, os, shutil, signal, subprocess, sys, tarfile, time, tomllib, types
from pathlib import Path
import guards as g
import phase_runner
import source_manifest
from source_manifest import read_source
from export import export, write_new

DEADLINE = None

def remaining(cap):
    left = DEADLINE - time.monotonic()
    assert left > 0, 'Combined server phase deadline exhausted'
    return min(cap, left)

def bounded_output(argv, **kwargs):
    kwargs["timeout"] = remaining(kwargs.get("timeout",30))
    return subprocess.check_output(argv, **kwargs)

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], timeout=remaining(30))

def api(path):
    return g.load(subprocess.check_output(['gh', 'api', 'repos/'+g.REPO+'/'+path], timeout=remaining(30)))

def asset_bytes(asset_id, release_id, name, size, digest, limit):
    assert type(asset_id) is int and asset_id > 0 and type(release_id) is int and release_id > 0
    assert type(size) is int and 0 < size <= limit and g.hexstr(digest, 64)
    meta = api('releases/assets/'+str(asset_id)); release = api('releases/'+str(release_id))
    assert release['id'] == release_id and release['draft'] is True
    assert meta['id'] == asset_id and meta['name'] == name and meta['size'] == size and meta['state'] == 'uploaded' and meta['digest'] == 'sha256:'+digest
    assert len([x for x in release['assets'] if x['id'] == asset_id and x['name'] == name and x['size'] == size and x['digest'] == 'sha256:'+digest]) == 1
    old = signal.getsignal(signal.SIGALRM)
    def expired(a, b): raise TimeoutError('Bounded private input download')
    signal.signal(signal.SIGALRM, expired); signal.setitimer(signal.ITIMER_REAL, remaining(120))
    child = subprocess.Popen(['gh', 'api', 'repos/'+g.REPO+'/releases/assets/'+str(asset_id), '-H', 'Accept: application/octet-stream'], stdout=subprocess.PIPE)
    try:
        data = child.stdout.read(size+1)
        assert len(data) == size and child.wait(timeout=remaining(15)) == 0 and g.sha(data) == digest
        return data
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0); signal.signal(signal.SIGALRM, old)
        if child.poll() is None: child.kill(); child.wait(timeout=15)
        child.stdout.close()

def run_phase(name, argv, cwd, env, output, cap):
    try:
        result = phase_runner.run_settings(argv, cwd, env, output, remaining(cap))
    finally:
        if output.exists():
            row = g.load(output.read_bytes()); row['phase'] = name
            row['stdout_sha256'] = g.sha(row['stdout'].encode())
            output.write_text(json.dumps(row, indent=2)+'\n')
            print(json.dumps({'phase': name, 'exit': row['exit_code'], 'timed_out': row['timed_out'], 'cleanup_complete': row['process_group_cleanup_complete']}), flush=True)
            print(row['stdout'], flush=True)
    assert type(result.returncode) is int and result.returncode == 0, name+' failed'
    return g.load(output.read_bytes())

def main():
    global DEADLINE
    DEADLINE = time.monotonic()+2100
    source_manifest.subprocess = types.SimpleNamespace(check_output=bounded_output)
    assert os.environ['GITHUB_REPOSITORY'] == g.REPO and os.environ['GITHUB_EVENT_NAME'] == 'workflow_dispatch'
    assert os.environ['SERVER_COMPILE_SELECTED'] == 'true' and os.environ['LEGACY_BOOTSTRAP_SELECTED'] == 'false' and os.environ['SELECTED_PLATFORMS'] == 'linux'
    assert os.environ['UNUSED_BUNDLE_RELEASE'] == 'build-inputs-compile-only' and os.environ['UNUSED_BUNDLE_SHA'] == '0'*64
    descriptor = g.load(os.environ['COMPILE_SPEC_JSON'])
    assert set(descriptor) == {'asset_id', 'release_id', 'size', 'sha256'}
    raw = asset_bytes(descriptor['asset_id'], descriptor['release_id'], 'server-compile-spec.json', descriptor['size'], descriptor['sha256'], 2*1024**2)
    s = g.bound(g.load(raw))
    assert s['tool'] == os.environ['GITHUB_SHA'] == os.environ['TOOL_SOURCE'] and s['tool_ref'] == os.environ['GITHUB_REF_NAME']
    assert s['desktop_source'] == os.environ['APP_SOURCE'] and s['server_source'] == os.environ['SERVER_SOURCE'] and s['version'] == os.environ['RELEASE_VERSION']
    root = Path(os.environ['GITHUB_WORKSPACE']); server = root/'.server-compile-source'; tools = root/'.release-tools'
    assert git(root, 'rev-parse', 'HEAD').decode().strip() == s['desktop_source'] and not git(root, 'status', '--porcelain', '--untracked-files=no').strip()
    assert git(tools, 'rev-parse', 'HEAD').decode().strip() == s['tool']
    assert git(server, 'rev-parse', 'HEAD').decode().strip() == s['server_source'] and not git(server, 'status', '--porcelain').strip()
    assert tomllib.loads((server/'Cargo.toml').read_text())['package']['version'] == s['version']
    server_lock = git(server, 'show', 'HEAD:Cargo.lock'); desktop_lock = git(root, 'show', 'HEAD:desktop/Cargo.lock')
    assert g.sha(server_lock) == s['server_lock_sha256'] and g.sha(desktop_lock) == s['desktop_lock_sha256']
    assert (server/'Cargo.lock').read_bytes() == server_lock and (root/'desktop/Cargo.lock').read_bytes() == desktop_lock
    objects = {line.split(b'\t',1)[1].decode(): line.split(b'\t',1)[0].decode() for line in git(server, 'ls-tree', '-r', 'HEAD').splitlines()}
    assert all(objects[name] == value for name, value in s['backend_source_objects'].items())
    for n, v in s['source_files'].items():
        data = read_source(server, s['server_source'], n)
        assert len(data) == v['size'] and g.sha(data) == v['sha256']
    run_id = int(os.environ['GITHUB_RUN_ID']); attempt = int(os.environ['GITHUB_RUN_ATTEMPT'])
    assert run_id > 0 and attempt == 1
    work = Path(os.environ['RUNNER_TEMP'])/('kindred-combined-'+str(run_id))
    g.ancestors(work.parent); assert not work.exists() and not work.is_symlink()
    assert shutil.disk_usage(work.parent).free >= 8*1024**3, 'Remote runner compile space not admitted'
    work.mkdir(mode=0o700)
    d = s['driver']; archive = asset_bytes(d['asset_id'], d['release_id'], d['name'], d['size'], d['sha256'], 16*1024**2)
    manifest = g.load(git(server, 'show', 'HEAD:deploy/cua-driver-manifest.json'))
    assert manifest['archive_sha256'] == d['sha256'] and manifest['binary_sha256'] == d['binary_sha256'] and manifest['binary_bytes'] == d['binary_size'] and manifest['packaged_path'] == d['packaged_path'] and manifest['archive_member'] == 'cua-driver'
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tar:
        members = tar.getmembers(); assert len(members) <= 4096 and sum(x.size for x in members) <= 128*1024**2
        matches = [x for x in members if x.name == 'cua-driver']
        assert len(matches) == 1 and matches[0].isreg() and matches[0].size == d['binary_size']
        driver = tar.extractfile(matches[0]).read(d['binary_size']+1)
    assert len(driver) == d['binary_size'] and g.sha(driver) == d['binary_sha256']
    write_new(work/'driver.tar.gz', archive); write_new(work/'cua-driver', driver)
    os.chmod(work/'cua-driver', 0o700, follow_symlinks=False)
    env = {k:v for k,v in os.environ.items() if k not in {'GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','GH_DEBUG'}}
    env.update(CARGO_TARGET_DIR=str(work/'server-target'), CARGO_BUILD_JOBS='1', CARGO_INCREMENTAL='0', CARGO_TERM_COLOR='never')
    start = time.monotonic(); records = {}
    rust = subprocess.check_output(['rustc','--version','--verbose'], env=env, text=True, timeout=remaining(30))
    cargo = subprocess.check_output(['cargo','--version'], env=env, text=True, timeout=remaining(30))
    fetch = ['cargo','fetch','--locked']
    records['dependency_fetch'] = run_phase('dependency_fetch', fetch, server, env, work/'dependency-fetch.json', 180)
    assert (server/'Cargo.lock').read_bytes() == server_lock
    cmd = ['cargo','build','--release','--locked','--offline']
    records['offline_release_compile'] = run_phase('offline_release_compile', cmd, server, env, work/'compile.json', 1800)
    assert (server/'Cargo.lock').read_bytes() == server_lock and not git(server, 'status', '--porcelain').strip()
    binary = work/'server-target/release/kindred'
    assert subprocess.check_output([str(binary),'--version'], env=env, text=True, timeout=remaining(30)).strip() == 'kindred '+s['version']
    stage = work/'stage'; (stage/'server').mkdir(parents=True)
    script = server/'scripts/release/package-server.py'
    assert script.read_bytes() == git(server, 'show', 'HEAD:scripts/release/package-server.py')
    records['package_server'] = run_phase('package_server', ['python3',str(script),'--binary',str(binary),'--output',str(stage/'server'),'--cua-driver',str(work/'cua-driver'),'--cua-driver-archive',str(work/'driver.tar.gz')], server, env, work/'package.json', 180)
    assert (server/'Cargo.lock').read_bytes() == server_lock and not git(server, 'status', '--porcelain').strip()
    source = g.load((stage/'server/SOURCE.json').read_bytes())
    receipt = {'schema':3,'desktop_source':s['desktop_source'],'server_source':s['server_source'],'tool':s['tool'],'run_id':run_id,'run_attempt':attempt,'pin_sha256':s['pin_sha256'],'authority_sha256':s['authority_sha256'],'route':s['route'],'route_decision_sha256':s['route_decision_sha256'],'cargo_argv':cmd,'cargo_build_jobs':1,'compile_exit':0,'dependency_argv':fetch,'dependency_exit':0,'server_lock_before':g.sha(server_lock),'server_lock_after':g.sha((server/'Cargo.lock').read_bytes()),'desktop_lock':g.sha(desktop_lock),'rustc_version':rust,'cargo_version':cargo,'package_script_equals_server_git':True,'server_sha256':source['server_sha256'],'elapsed_seconds':time.monotonic()-start,'backend_evidence':s['backend_evidence'],'backend_tests_executed_this_run':0,'local_settings_pass':False,'phase_records':{name:{key:value for key,value in row.items() if key!='stdout'} for name,row in records.items()}}
    write_new(stage/'build-receipt.json', (json.dumps(receipt,indent=2)+'\n').encode())
    export(stage, root/'server-compile-export', s)
    bundle = g.regular_bytes(stage/'server'/('kindred-standalone-'+s['version']+'.zip'), g.MAX_ZIP)
    write_new(root/'desktop/standalone.zip', bundle)
    print(json.dumps({'phase':'combined-server-complete','version':s['version'],'source':s['server_source'],'zip_sha256':g.sha(bundle),'run_id':run_id,'backend_tests_executed_this_run':0,'native_linux_QA_still_required':True}), flush=True)

if __name__ == '__main__': main()
