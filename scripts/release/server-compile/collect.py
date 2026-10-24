import argparse,hashlib,json,os,stat,subprocess,zipfile,signal,time
from pathlib import Path
import guards as g
from export import write_new
def validate_file(path,spec,run_id,run,jobs,artifact):
    g.validate_api(spec,run_id,run,jobs,artifact)
    path=Path(path);g.ancestors(path.parent); before=path.lstat()
    assert stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_size==artifact['size_in_bytes'] and not before.st_mode&0o111
    with open(path,'rb',opener=lambda n,f:os.open(n,f|os.O_NOFOLLOW)) as stream:
        assert g.fingerprint(before)==g.fingerprint(os.fstat(stream.fileno()))
        assert hashlib.file_digest(stream,'sha256').hexdigest()==artifact['digest'].split(':',1)[1]
        stream.seek(0)
        with zipfile.ZipFile(stream) as z:
            allowed={*g.files_for(spec['version']),'custody.json'}
            allrows=g.zip_rows(z,g.MAX_ZIP+1024**2,allowed)
        assert len(allrows['custody.json'])<=256*1024; custody_raw=allrows.pop('custody.json');custody=g.load(custody_raw);checked=g.validate_payload(allrows,spec)
        assert set(custody)=={'schema','repo','version','desktop_source','server_source','tool','run_id','run_attempt','pin_sha256','authority_sha256','files','harness13','scope'}
        assert type(custody['schema']) is int and custody['schema']==1 and custody['repo']==g.REPO and custody['version']==spec['version']
        for k in ('desktop_source','server_source','tool','pin_sha256','authority_sha256'):assert custody[k]==spec[k]
        assert type(custody['run_id']) is int and custody['run_id']==checked['receipt']['run_id']==run_id and type(custody['run_attempt']) is int and custody['run_attempt']==1
        assert custody['files']=={n:{'sha256':g.sha(v),'size':len(v)} for n,v in allrows.items()}
        assert custody['harness13']==checked['harness13']
        assert g.fingerprint(before)==g.fingerprint(os.fstat(stream.fileno()))==g.fingerprint(path.lstat())
    return allrows,custody,custody_raw
def api(path):return g.load(subprocess.check_output(['gh','api',path],timeout=30))
def download(artifact_id,path,limit):
    assert not path.exists() and not path.is_symlink();g.ancestors(path.parent)
    child=subprocess.Popen(['gh','api','repos/'+g.REPO+'/actions/artifacts/'+str(artifact_id)+'/zip'],stdout=subprocess.PIPE)
    count=0;old=signal.getsignal(signal.SIGALRM)
    def expired(a,b):raise TimeoutError('Bounded artifact download')
    signal.signal(signal.SIGALRM,expired);signal.alarm(300)
    try:
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as out:
            while data:=child.stdout.read(1024*1024):
                count+=len(data);assert count<=limit;out.write(data)
            out.flush();os.fsync(out.fileno())
        assert child.wait(timeout=30)==0 and count==limit
    finally:
        signal.alarm(0);signal.signal(signal.SIGALRM,old)
        if child.poll() is None:child.kill();child.wait(timeout=15)
def main():
    p=argparse.ArgumentParser();p.add_argument('--spec',required=True,type=Path);p.add_argument('--run-id',required=True,type=int);p.add_argument('--output',required=True,type=Path)
    p.add_argument('--admission',required=True,type=Path);p.add_argument('--selected-run-file',required=True,type=Path)
    a=p.parse_args();spec_raw=g.regular_bytes(a.spec,2*1024**2);spec=g.bound(g.load(spec_raw))
    selection=g.load(g.regular_bytes(a.selected_run_file,128*1024));g.selected_run_ok(spec,selection,a.run_id,g.sha(spec_raw))
    # The collector does not admit a partial/failed parent. Existing full Linux QA must complete.
    run=api('repos/'+g.REPO+'/actions/runs/'+str(a.run_id));jobs=api('repos/'+g.REPO+'/actions/runs/'+str(a.run_id)+'/jobs?per_page=100')
    artifacts=api('repos/'+g.REPO+'/actions/runs/'+str(a.run_id)+'/artifacts?per_page=100')['artifacts']
    found=[x for x in artifacts if x['name']=='server-compile-'+spec['version']+'-'+str(a.run_id)];assert len(found)==1
    artifact=found[0];g.validate_api(spec,a.run_id,run,jobs,artifact)
    admission=g.load(g.regular_bytes(a.admission,128*1024));v=os.statvfs(a.output.parent);g.admission_ok(admission,artifact,v.f_bavail*v.f_frsize,time.time())
    assert not a.output.exists() and not a.output.is_symlink();g.ancestors(a.output.parent);a.output.mkdir(mode=0o700)
    write_new(a.output/'selected-api.json',(json.dumps({'run':run,'jobs':jobs,'artifact':artifact},indent=2)+'\n').encode())
    raw=a.output/'raw.zip';download(artifact['id'],raw,artifact['size_in_bytes'])
    rows,custody,custody_raw=validate_file(raw,spec,a.run_id,run,jobs,artifact)
    target=a.output/'verified';target.mkdir(mode=0o700)
    for name,data in {**rows,'custody.json':custody_raw}.items():
        dst=target/name;dst.parent.mkdir(parents=True,exist_ok=True);write_new(dst,data)
    write_new(a.output/'collection-result.json',(json.dumps({'ready':True,'run_id':a.run_id,'tool':spec['tool'],'server_source':spec['server_source'],'desktop_source':spec['desktop_source'],'raw_sha256':artifact['digest'],'raw_size':artifact['size_in_bytes'],'verified_files':custody['files'],'native_linux_workflow_status':run['conclusion'],'no_product_execution':True},indent=2)+'\n').encode())
if __name__=='__main__':main()
