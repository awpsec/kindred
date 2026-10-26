"""Six exact current-crate VNC backend tests; import performs no product action."""
from pathlib import Path
import hashlib,json,re,math
SELECTION_SHA256='526b00b453b39b264b118e55e218cae05aa75d4e91f44c7bf1f1f9f31e3220a6'
SELECTION_SOURCE='b13363fcc9911f214bb1f2c86915abaca50c606f'
SOURCE='b13363fcc9911f214bb1f2c86915abaca50c606f'
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
    expected={'src/vnc.rs': '1c5bc3f99b8b17e0f99fbcd093e018972bdbaba0442a9fc651926160ce0fc4ae', 'deploy/test_continuity_invalidation.py': '00d358eadd9c8c960e50a2c7e09bad50243755ba33c77316abfd1eb049a29ca4', 'src/migrations/continuity-2.sql': '0483805e5a02008fc4022c379efd6e9aa325e4312278abb7a8ddee3ede3cc81c'}
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

SQL_NAMES = ['test_artifact_visibility_remains_conservative', 'test_execution_receipt_edit_and_delete_remain_protected', 'test_hiding_activity_marker_does_not_invalidate_memory_or_history', 'test_independent_reader_is_protected_when_recipient_has_not_started', 'test_presentation_body_changes_are_not_silently_exempted', 'test_queued_edit_and_withdrawal_remain_conservative', 'test_real_checklist_revision_still_invalidates_derived_knowledge', 'test_started_handed_off_unknown_and_partially_delivered_messages_remain_protected', 'test_upgrade_replaces_old_trigger_and_remains_idempotent', 'test_user_edit_hide_and_delete_still_invalidate']
TEST_ARGV = ['python3','-B','deploy/test_continuity_invalidation.py','-v']
SQL_ARGV = ['python3','-B','-I','../.release-tools/scripts/release/server-compile/sqlite_runtime.py','run']
PREFLIGHT_ARGV = ['python3','-B','-I','../.release-tools/scripts/release/server-compile/sqlite_runtime.py','prepare']
def sql_selection():
    s=selection()['memory_sql']
    assert s=={'command':TEST_ARGV,'expected_cases':10,'test_sha256':'00d358eadd9c8c960e50a2c7e09bad50243755ba33c77316abfd1eb049a29ca4','migration_sha256':'0483805e5a02008fc4022c379efd6e9aa325e4312278abb7a8ddee3ede3cc81c','execution':'Once in the selected cached FIRST879 job with exactsource readback/stdout SHA; no local heavy or full206suite repeat.'}
    return s

def exact_sql_result(stdout):
    assert type(stdout)is str and 0<len(stdout.encode())<=32768 and '\x1b'not in stdout and '\x00'not in stdout
    lines=[line.strip()for line in stdout.splitlines()if line.strip()]
    expected=['%s (__main__.ContinuityInvalidation.%s) ... ok'%(name,name)for name in SQL_NAMES]
    assert lines[:10]==expected and len(lines)==13 and re.fullmatch('-{10,}',lines[10]) and lines[12]=='OK'
    m=re.fullmatch(r'Ran 10 tests in ([0-9]+(?:\.[0-9]+)?)s',lines[11]);assert m
    seconds=float(m[1]);assert math.isfinite(seconds) and 0<=seconds<=60
    return {'executed':10,'passed':10,'failed':0,'skipped':0,'reported_test_seconds':seconds}

def validate_sql(row,phase_records):
    import sqlite_runtime
    s=sql_selection();assert type(row)is dict and set(row)=={'argv','source','selection_sha256','phase','stdout','stdout_sha256','test_sha256','migration_sha256','provider','result'}
    sqlite_runtime.validate_summary(row['provider'])
    assert row['argv']==SQL_ARGV and row['source']==SOURCE and row['selection_sha256']==SELECTION_SHA256 and row['phase']=='memory_sql_tests'
    assert row['test_sha256']==s['test_sha256'] and row['migration_sha256']==s['migration_sha256'] and row['result']==exact_sql_result(row['stdout'])
    assert all(type(row['result'][k])is int for k in ('executed','passed','failed','skipped')) and type(row['result']['reported_test_seconds'])is float
    digest=hashlib.sha256(row['stdout'].encode()).hexdigest();assert row['stdout_sha256']==digest
    p=phase_records['memory_sql_tests'];assert p['phase']=='memory_sql_tests' and type(p['exit_code'])is int and p['exit_code']==0
    assert p['timed_out']is False and p['process_group_cleanup_complete']is True and p['live_owned_group_members']==[] and p['cleanup_error']is None
    assert p['stdout_truncated']is False and p['stdout_sha256']==digest and type(p['stdout_total_bytes'])is int and p['stdout_total_bytes']==len(row['stdout'].encode())
    assert type(p['maximum_seconds'])in(int,float) and math.isfinite(p['maximum_seconds']) and 0<p['maximum_seconds']<=60
    return row

def run_sql(server,server_source,env,work,git,run_phase):
    verify_source(server,server_source,git);s=sql_selection()
    assert not({'GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','GH_DEBUG'}&set(env))
    environment=json.loads(Path(env['KINDRED_SQLITE_ENVIRONMENT']).read_bytes())
    import sqlite_runtime
    sqlite_runtime.validate_summary(environment['provider'])
    p=run_phase('memory_sql_tests',SQL_ARGV,server,env,work/'memory-sql-tests.json',60)
    row={'argv':SQL_ARGV,'source':server_source,'selection_sha256':SELECTION_SHA256,'phase':'memory_sql_tests','stdout':p['stdout'],'stdout_sha256':hashlib.sha256(p['stdout'].encode()).hexdigest(),'test_sha256':s['test_sha256'],'migration_sha256':s['migration_sha256'],'provider':environment['provider'],'result':exact_sql_result(p['stdout'])}
    validate_sql(row,{'memory_sql_tests':p});return row,p


def validate_preflight(row,phase_records):
    import sqlite_runtime
    assert type(row)is dict and set(row)=={'argv','phase','stdout','stdout_sha256','record'}
    assert row['argv']==PREFLIGHT_ARGV and row['phase']=='sqlite_environment_preflight'
    text=row['stdout'];assert type(text)is str and 0<len(text.encode())<=32768
    record=json.loads(text);assert record==row['record'] and set(record)=={'schema','provider','source_root_readback_only','installed_file_count'}
    assert type(record['schema'])is int and record['schema']==1 and record['source_root_readback_only']is True
    assert type(record['installed_file_count'])is int and 0<record['installed_file_count']<=256
    sqlite_runtime.validate_summary(record['provider'])
    digest=hashlib.sha256(text.encode()).hexdigest();assert row['stdout_sha256']==digest
    p=phase_records['sqlite_environment_preflight'];assert p['phase']=='sqlite_environment_preflight' and type(p['exit_code'])is int and p['exit_code']==0
    assert p['timed_out']is False and p['process_group_cleanup_complete']is True and p['live_owned_group_members']==[] and p['cleanup_error']is None
    assert p['stdout_truncated']is False and p['stdout_sha256']==digest and type(p['stdout_total_bytes'])is int and p['stdout_total_bytes']==len(text.encode())
    assert type(p['maximum_seconds'])in(int,float)and math.isfinite(p['maximum_seconds'])and 0<p['maximum_seconds']<=60
    return row
