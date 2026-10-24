import hashlib, json, os, re, stat, zipfile, io
from pathlib import Path, PurePosixPath
REPO = 'awpsec/kindred'
HARNESS = ('harness/pi/worker.mjs','harness/pi/session.mjs','harness/pi/package.json','harness/pi/package-lock.json','harness/pi/opencode-models.json','deploy/update-harnesses.py','deploy/provider-cli.py','deploy/provider-connectors.py','deploy/wait-screen-ready','deploy/check-codex.py','deploy/kindred-screen@.service','deploy/update-guest-runtime.py','deploy/vm-manager.py')
MAX_ZIP = 128 * 1024**2
MAX_EXPANDED = 512 * 1024**2
def sha(data): return hashlib.sha256(data).hexdigest()
def canonical(value): return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)
def load(data):
    def pairs(rows):
        result = {}
        for key, value in rows:
            assert key not in result, 'Duplicate JSON key'
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=pairs, parse_constant=lambda _: (_ for _ in ()).throw(AssertionError('Nonfinite JSON')))
def hexstr(value, n): return type(value) is str and re.fullmatch('[0-9a-f]{'+str(n)+'}', value) is not None
def safe_name(name):
    return type(name) is str and bool(name) and '\\' not in name and ':' not in name and not name.startswith('/') and all(x not in ('','.','..','.git') for x in name.split('/'))
def files_for(version):
    assert version == '0.87.5'
    return {'server/SOURCE.json': 128*1024, 'server/kindred-standalone-'+version+'.zip': MAX_ZIP, 'build-receipt.json': 128*1024}
def bound(s):
    assert set(s) == {'schema','bound','repo','version','desktop_source','server_source','tool','tool_ref','pin_sha256','authority_sha256','desktop_lock_sha256','server_lock_sha256','driver','source_files','route','route_decision_sha256','backend_evidence','backend_source_objects'}
    assert type(s['schema']) is int and s['schema']==2 and s['bound'] is True
    assert s['repo']==REPO and s['version']=='0.87.5'
    for k in ('desktop_source','server_source','tool'): assert hexstr(s[k],40)
    assert (s['desktop_source'],s['server_source'],s['pin_sha256'],s['authority_sha256'],s['route_decision_sha256'])==('b2e8c925a47b58f347dce0b0f82ce14dd0e39dd9','7d1f353ca450f3eedc9aaeb0267c1e2dca28d626','e00211411e3307ad89e8f22a4c7cce58d2e6f5f8b186cc36c6aa563fb69ad112','f8beaabf8014df5dd66f62ab2dd4af9261ba29ba6f3c8f75f81a43d94594ef7e','783b42d02fb8b7b56cdb929a8ac7182d5bf5f657be8799346649a7ca8d14209a')
    for k in ('pin_sha256','authority_sha256','desktop_lock_sha256','server_lock_sha256'): assert hexstr(s[k],64)
    assert re.fullmatch(r'codex/[A-Za-z0-9._/-]+',s['tool_ref']) and '..' not in s['tool_ref']
    assert s['route']=='COMBINED_SERVER_LINUX45' and hexstr(s['route_decision_sha256'],64)
    assert canonical(s['backend_evidence'])==canonical(load(Path(__file__).with_name('prior-backend-evidence.json').read_bytes()))
    assert s['backend_source_objects']==load(Path(__file__).with_name('backend-source-objects.json').read_bytes())['unchanged']
    assert len(s['backend_source_objects'])==153 and s['backend_evidence']['actual_original_names_executed']==27 and s['backend_evidence']['new_tests_executed']==0 and s['backend_evidence']['not_current_local_test_PASS'] is True
    assert s['backend_evidence']['current_server_source']==s['server_source'] and s['backend_evidence']['current_product_version']==s['version']
    d=s['driver']; assert set(d)=={'asset_id','release_id','name','size','sha256','binary_sha256','binary_size','packaged_path'}
    for k in ('asset_id','release_id'): assert type(d[k]) is int and d[k]>0
    assert d['name']=='driver.tar.gz' and type(d['size']) is int and 0<d['size']<=16*1024**2 and hexstr(d['sha256'],64)
    assert hexstr(d['binary_sha256'],64) and type(d['binary_size']) is int and 0<d['binary_size']<=64*1024**2
    assert d['packaged_path']=='deploy/vendor/cua-driver'
    rows=s['source_files']; assert type(rows) is dict and 13<=len(rows)<=4096 and set(HARNESS)|{'deploy/cua-driver-manifest.json'}<=set(rows)
    assert not {'kindred','bundle.json',d['packaged_path']} & set(rows)
    for n,v in rows.items():
        assert safe_name(n) and set(v)=={'sha256','size'} and hexstr(v['sha256'],64) and type(v['size']) is int and 0<=v['size']<=32*1024**2
    assert sum(v['size'] for v in rows.values())<=256*1024**2
    return s
def ancestors(path):
    path=Path(path).absolute()
    for p in [path,*path.parents]: assert stat.S_ISDIR(p.lstat().st_mode) and not p.is_symlink(), 'Unsafe ancestor'
    return path
def fingerprint(st):
    return (st.st_dev,st.st_ino,st.st_mode,st.st_nlink,st.st_uid,st.st_gid,st.st_size,st.st_mtime_ns,st.st_ctime_ns)
def regular_bytes(path, limit):
    path=Path(path); ancestors(path.parent); before=path.lstat()
    assert stat.S_ISREG(before.st_mode) and before.st_nlink==1 and not before.st_mode&0o111 and before.st_size<=limit
    with open(path,'rb',opener=lambda n,f:os.open(n,f|os.O_NOFOLLOW)) as stream:
        assert fingerprint(before)==fingerprint(os.fstat(stream.fileno()))
        data=stream.read(limit+1)
        assert len(data)==before.st_size and fingerprint(before)==fingerprint(os.fstat(stream.fileno()))==fingerprint(path.lstat())
    return data
def zip_rows(z, max_bytes, allowed=None):
    infos=z.infolist(); names=[x.filename for x in infos]
    assert 0<len(infos)<=4096 and len(names)==len(set(names)) and sum(x.file_size for x in infos)<=max_bytes
    if allowed is not None: assert set(names)==set(allowed)
    for x in infos:
        mode=x.external_attr>>16
        assert safe_name(x.filename) and not x.is_dir() and not x.flag_bits&1 and stat.S_IFMT(mode) in (0,stat.S_IFREG) and 0<=x.file_size<=MAX_ZIP
    assert z.testzip() is None
    return {x.filename:z.read(x) for x in infos}
def validate_payload(rows,s):
    bound(s); expected=files_for(s['version']); assert set(rows)==set(expected)
    for n,v in rows.items(): assert type(v) is bytes and len(v)<=expected[n]
    source=load(rows['server/SOURCE.json']); receipt=load(rows['build-receipt.json']); assert set(source)=={'version','source_commit','target','server_sha256','cua_driver','standalone_sha256','bytes'}; assert set(receipt)=={'schema','desktop_source','server_source','tool','run_id','run_attempt','pin_sha256','authority_sha256','cargo_argv','cargo_build_jobs','compile_exit','server_lock_before','server_lock_after','desktop_lock','rustc_version','cargo_version','package_script_equals_server_git','server_sha256','elapsed_seconds','route','route_decision_sha256','dependency_argv','dependency_exit','backend_evidence','backend_tests_executed_this_run','local_settings_pass','phase_records'}; raw=rows['server/kindred-standalone-'+s['version']+'.zip']
    assert source['source_commit']==s['server_source'] and source['version']==s['version'] and source['target']=='x86_64-unknown-linux-gnu'
    assert source['standalone_sha256']==sha(raw) and source['bytes']==len(raw)
    assert type(receipt['schema']) is int and receipt['schema']==3 and receipt['server_source']==s['server_source'] and receipt['desktop_source']==s['desktop_source'] and receipt['tool']==s['tool']
    assert type(receipt['run_id']) is int and receipt['run_id']>0 and type(receipt['run_attempt']) is int and receipt['run_attempt']==1
    assert receipt['cargo_argv']==['cargo','build','--release','--locked','--offline'] and type(receipt['cargo_build_jobs']) is int and receipt['cargo_build_jobs']==1 and type(receipt['compile_exit']) is int and receipt['compile_exit']==0
    assert receipt['route']==s['route'] and receipt['route_decision_sha256']==s['route_decision_sha256']
    assert receipt['dependency_argv']==['cargo','fetch','--locked'] and type(receipt['dependency_exit']) is int and receipt['dependency_exit']==0
    assert canonical(receipt['backend_evidence'])==canonical(s['backend_evidence']) and type(receipt['backend_tests_executed_this_run']) is int and receipt['backend_tests_executed_this_run']==0 and receipt['local_settings_pass'] is False
    assert set(receipt['phase_records'])=={'dependency_fetch','offline_release_compile','package_server'}
    for phase,row in receipt['phase_records'].items():
        assert type(row['exit_code']) is int and row['exit_code']==0 and row['timed_out'] is False and row['process_group_cleanup_complete'] is True
        assert row['phase']==phase and row['stdout_truncated'] is False and row['live_owned_group_members']==[] and row['cleanup_error'] is None
        assert type(row['maximum_seconds']) in (int,float) and 0<row['maximum_seconds']<={'dependency_fetch':180,'offline_release_compile':1800,'package_server':180}[phase]
        assert hexstr(row['stdout_sha256'],64) and type(row['stdout_total_bytes']) is int and row['stdout_total_bytes']>=0
    assert receipt['server_lock_before']==receipt['server_lock_after']==s['server_lock_sha256'] and receipt['desktop_lock']==s['desktop_lock_sha256']
    assert receipt['package_script_equals_server_git'] is True and receipt['pin_sha256']==s['pin_sha256'] and receipt['authority_sha256']==s['authority_sha256']
    assert type(receipt['elapsed_seconds']) in (int,float) and 0<=receipt['elapsed_seconds']<=2100
    for k in ('rustc_version','cargo_version'): assert type(receipt[k]) is str and 0<len(receipt[k])<=8192
    expected_members=set(s['source_files'])|{'kindred','bundle.json',s['driver']['packaged_path']}
    with zipfile.ZipFile(io.BytesIO(raw)) as z: inner=zip_rows(z,MAX_EXPANDED,expected_members)
    binary=inner['kindred']; assert binary[:5]==b'\x7fELF\x02' and binary[18:20]==b'\x3e\x00'
    meta=load(inner['bundle.json']); assert set(meta)=={'version','source_commit','target','server_sha256','cua_driver'}; assert meta['source_commit']==source['source_commit'] and meta['version']==s['version'] and meta['target']=='x86_64-unknown-linux-gnu'
    assert sha(binary)==meta['server_sha256']==source['server_sha256']==receipt['server_sha256']
    for n,v in s['source_files'].items(): assert len(inner[n])==v['size'] and sha(inner[n])==v['sha256'], 'Packaged source mismatch'
    assert source['cua_driver']==meta['cua_driver']==load(inner['deploy/cua-driver-manifest.json'])
    d=s['driver']; assert len(inner[d['packaged_path']])==d['binary_size'] and sha(inner[d['packaged_path']])==d['binary_sha256']
    return {'source':source,'receipt':receipt,'zip_sha256':sha(raw),'zip_bytes':len(raw),'harness13':{n:s['source_files'][n] for n in HARNESS}}
def validate_api(s, run_id, run, jobs, artifact):
    bound(s); assert type(run_id) is int and run_id>0
    assert type(run['id']) is int and run['id']==run_id and run['head_sha']==s['tool'] and run['head_branch']==s['tool_ref']
    assert run['repository']['full_name']==REPO and run['event']=='workflow_dispatch' and run['path']=='.github/workflows/build.yml'
    assert type(run['run_attempt']) is int and run['run_attempt']==1 and run['status']=='completed' and run['conclusion']=='success'
    required={'Compile and package exact server in FIRST Linux job','Publish combined server compile custody'}
    matches=[j for j in jobs['jobs'] if required <= {v['name'] for v in j['steps']}]
    assert len(matches)==1
    job=matches[0]; assert job['run_id']==run_id and job['status']=='completed' and job['conclusion']=='success'
    assert all(x['status']=='completed' and x['conclusion']=='success' for x in job['steps'] if x['name'] in required)
    assert artifact['name']=='server-compile-'+s['version']+'-'+str(run_id) and artifact['expired'] is False and type(artifact['id']) is int and artifact['id']>0
    assert type(artifact['size_in_bytes']) is int and 0<artifact['size_in_bytes']<=MAX_ZIP+1024**2
    assert type(artifact['workflow_run']['id']) is int and artifact['workflow_run']['id']==run_id and artifact['workflow_run']['head_sha']==s['tool'] and artifact['workflow_run']['head_branch']==s['tool_ref']
    assert type(artifact['digest']) is str and re.fullmatch(r'sha256:[0-9a-f]{64}',artifact['digest'])
    return job['id']

def admission_ok(a, artifact, available, now):
    assert a['admitted'] is True and a['uid']==223514 and type(a['uid']) is int
    assert a['api_artifact_id']==artifact['id'] and a['api_artifact_size']==artifact['size_in_bytes']
    assert type(a['peak_additional_bytes']) is int and a['peak_additional_bytes']>=artifact['size_in_bytes']+MAX_ZIP+9*1024**2
    assert type(a['concurrent_remaining_bytes']) is int and a['concurrent_remaining_bytes']>=0 and a['reserve_bytes']==50*1024**3
    assert 0<=now-a['observed_unix_seconds']<=120
    assert available-a['peak_additional_bytes']-a['concurrent_remaining_bytes']>=a['reserve_bytes']

def selected_run_ok(s, selection, run_id, spec_sha256):
    assert set(selection)=={'schema','phase','approved','run_id','attempt','minutes','tool','desktop_source','server_source','spec_sha256','pin_sha256','authority_sha256'}
    assert type(selection['schema']) is int and selection['schema']==1 and selection['phase']=='FIRST_LINUX45' and selection['approved'] is True
    assert type(selection['run_id']) is int and selection['run_id']==run_id and type(selection['attempt']) is int and selection['attempt']==1
    assert type(selection['minutes']) is int and selection['minutes']==45 and selection['spec_sha256']==spec_sha256
    for key in ('tool','desktop_source','server_source','pin_sha256','authority_sha256'):assert selection[key]==s[key]

SOURCE_ALIASES = {'compose.yaml':'deploy/compose.standalone.yaml','Dockerfile':'deploy/Dockerfile.standalone','third-party/artifact-vendor.js.LEGAL.txt':'ui/artifact-vendor.js.LEGAL.txt'}
def source_path(member):
    assert safe_name(member)
    return SOURCE_ALIASES.get(member, member)
