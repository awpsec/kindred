"""Eight exact current-crate backend tests; import performs no product action."""
from pathlib import Path
import hashlib,json,re,math
SELECTION_SHA256='da3947a7fe6671d44b2483fe31049564552003d2ae6404ab20677c222c2f2aa9'
SELECTION_SOURCE='f2aac07f5a95646171a4af03af7193322deb50df'
SOURCE='51576ba75357350c9c148010130e770bce38d828'
MAX_STDOUT_BYTES=8192

def selection():
    p=Path(__file__).with_name('backend-test-selection.json');raw=p.read_bytes()
    assert hashlib.sha256(raw).hexdigest()==SELECTION_SHA256
    s=json.loads(raw);assert s['source']==SELECTION_SOURCE and len(s['selectors'])==8 and len(set(s['selectors']))==8
    assert s['expected_each']=={'executed':1,'passed':1,'failed':0,'ignored':0}
    assert all(re.fullmatch(r'conversation_updates::tests::[a-z0-9_]+',n) for n in s['selectors'])
    return s

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
    assert association['original_selection_server']==s['source'] and association['current_server']==server_source
    assert association['selection_sha256']==SELECTION_SHA256 and association['source_hashes']==s['source_hashes']
    assert association['required_current_tests']==8 and association['prior_test_PASS_substitution'] is False
    assert git(server,'rev-parse','HEAD').decode().strip()==server_source
    for name,digest in s['source_hashes'].items():
        actual=git(server,'show',server_source+':'+name)
        assert hashlib.sha256(actual).hexdigest()==digest, 'Selected backend source mismatch: '+name
        assert (server/name).read_bytes()==actual
    return s

def validate_results(rows,phase_records):
    s=selection();assert type(rows) is list and len(rows)==8
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
