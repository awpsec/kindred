"""Six exact current-crate VNC backend tests; import performs no product action."""
from pathlib import Path
import hashlib,json,re,math
SELECTION_SHA256='b4edd4283425600d6e3b896a0fbd2a679c2dd4d616b178bb0d90347a8809be23'
SELECTION_SOURCE='d58ee000a5de625782ad825737e2fd1d97c16c6c'
SOURCE='d58ee000a5de625782ad825737e2fd1d97c16c6c'
MAX_STDOUT_BYTES=8192

def selection():
    p=Path(__file__).with_name('backend-test-selection.json');raw=p.read_bytes()
    assert hashlib.sha256(raw).hexdigest()==SELECTION_SHA256
    s=json.loads(raw);assert s['server']==SELECTION_SOURCE and s['count']==6 and len(s['tests'])==6 and len(set(s['tests']))==6
    assert s['source']=={'path': 'src/vnc.rs', 'sha256': '1c5bc3f99b8b17e0f99fbcd093e018972bdbaba0442a9fc651926160ce0fc4ae', 'size': 32444}
    assert s['tests']==['vnc::tests::screen_observation_does_not_reserve_or_wake_and_power_off_is_not_sleep', 'vnc::tests::desktop_tickets_are_single_use_bounded_and_expire', 'vnc::runtime_start_tests::passive_screen_ensure_cannot_bypass_maintenance_mutex', 'vnc::runtime_start_tests::passive_start_admission_rechecks_durable_maintenance_state', 'vnc::composition_tests::ticket_startup_and_readiness_share_runtime_admission_for_both_modes', 'vnc::composition_tests::passive_session_lifetime_does_not_hold_the_startup_mutex']
    s['selectors']=s['tests']
    return s

def current_source_hashes():
    a=json.loads(Path(__file__).with_name('backend-source-association.json').read_bytes())
    assert a['current_server']==SOURCE and a['original_selection_server']==SELECTION_SOURCE and a['selection_sha256']==SELECTION_SHA256
    expected={'src/vnc.rs': '1c5bc3f99b8b17e0f99fbcd093e018972bdbaba0442a9fc651926160ce0fc4ae'}
    assert a['source_hashes']==expected
    return expected

def argv_for(name):
    assert name in selection()['selectors']
    return ['cargo','test','--release','--locked','--offline','--bin','kindred',name,'--','--exact','--test-threads=1']

def exact_test_result(stdout,name):
    assert type(stdout) is str and 0<len(stdout.encode())<=MAX_STDOUT_BYTES
    assert name in selection()['selectors'] and '\x1b' not in stdout and '\x00' not in stdout
    lines=[x.strip() for x in stdout.splitlines()]
    assert [x for x in lines if re.fullmatch(r'running \d+ tests?',x)]==['running 1 test']
    tests=[x for x in lines if x.startswith('test ') and not x.startswith('test result:')]
    assert tests==['test '+name+' ... ok'], 'Exact test name must execute once'
    summaries=[x for x in lines if x.startswith('test result:')]
    assert len(summaries)==1
    m=re.fullmatch(r'test result: ok\. 1 passed; 0 failed; 0 ignored; 0 measured; (\d+) filtered out; finished in ([0-9]+(?:\.[0-9]+)?)s',summaries[0]);assert m
    seconds=float(m[2]);assert math.isfinite(seconds) and 0<=seconds<=600
    return {'executed':1,'passed':1,'failed':0,'ignored':0,'reported_test_seconds':seconds,'filtered_out':int(m[1])}

def verify_source(server,server_source,git):
    s=selection();assert server_source==SOURCE
    association=json.loads(Path(__file__).with_name('backend-source-association.json').read_bytes())
    assert association['original_selection_server']==s['server'] and association['current_server']==server_source
    assert association['selection_sha256']==SELECTION_SHA256 and association['source_hashes']==current_source_hashes()
    assert association['required_current_tests']==6 and association['prior_test_PASS_substitution'] is False
    assert git(server,'rev-parse','HEAD').decode().strip()==server_source
    for name,digest in current_source_hashes().items():
        actual=git(server,'show',server_source+':'+name)
        assert hashlib.sha256(actual).hexdigest()==digest, 'Selected backend source mismatch: '+name
        assert (server/name).read_bytes()==actual
    return s

def validate_results(rows,phase_records):
    s=selection();assert type(rows) is list and len(rows)==6
    for i,(name,row) in enumerate(zip(s['selectors'],rows)):
        assert set(row)=={'selector','argv','source','selection_sha256','phase','stdout','stdout_sha256','result'}
        phase='backend_test_'+str(i);assert row['selector']==name and row['argv']==argv_for(name)
        assert row['source']==SOURCE and row['selection_sha256']==SELECTION_SHA256 and row['phase']==phase
        expected_result=exact_test_result(row['stdout'],name)
        assert row['result']==expected_result
        assert all(type(row['result'][k]) is int for k in ('executed','passed','failed','ignored','filtered_out'))
        assert type(row['result']['reported_test_seconds']) is float and math.isfinite(row['result']['reported_test_seconds'])
        digest=hashlib.sha256(row['stdout'].encode()).hexdigest();assert row['stdout_sha256']==digest
        record=phase_records[phase]
        assert record['phase']==phase and type(record['exit_code']) is int and record['exit_code']==0
        assert record['timed_out'] is False and record['process_group_cleanup_complete'] is True
        assert record['live_owned_group_members']==[] and record['cleanup_error'] is None
        assert record['stdout_truncated'] is False and record['stdout_sha256']==digest
        assert type(record['stdout_total_bytes']) is int and record['stdout_total_bytes']==len(row['stdout'].encode())
        assert type(record['maximum_seconds']) in (int,float) and math.isfinite(record['maximum_seconds']) and 0<record['maximum_seconds']<=600
    return rows

def run_selected(server,server_source,env,work,git,run_phase):
    s=verify_source(server,server_source,git)
    assert not ({'GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','GH_DEBUG'} & set(env))
    assert env['CARGO_BUILD_JOBS']=='1' and env['CARGO_INCREMENTAL']=='0'
    rows=[];records={}
    for i,name in enumerate(s['selectors']):
        phase='backend_test_'+str(i);argv=argv_for(name)
        record=run_phase(phase,argv,server,env,work/(phase+'.json'),600)
        assert type(record['exit_code']) is int and record['exit_code']==0
        raw=record['stdout'];result=exact_test_result(raw,name)
        row={'selector':name,'argv':argv,'source':server_source,'selection_sha256':SELECTION_SHA256,'phase':phase,'stdout':raw,'stdout_sha256':hashlib.sha256(raw.encode()).hexdigest(),'result':result}
        rows.append(row);records[phase]=record
    validate_results(rows,records)
    return rows,records
