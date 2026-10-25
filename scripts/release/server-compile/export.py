import json,os
from pathlib import Path
import guards as g
def write_new(path,data):
    g.ancestors(path.parent)
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as stream: stream.write(data); stream.flush(); os.fsync(stream.fileno())
def export(stage, target, spec):
    g.bound(spec); stage=Path(stage); target=Path(target)
    assert not target.exists() and not target.is_symlink(); g.ancestors(target.parent)
    rows={n:g.regular_bytes(stage/n,limit) for n,limit in g.files_for(spec['version']).items()}
    checked=g.validate_payload(rows,spec)
    target.mkdir(mode=0o700)
    # Only the three explicit product/receipt paths are exported; never walk a compiler/source tree.
    for n,data in rows.items():
        dst=target/n; dst.parent.mkdir(parents=True,exist_ok=True); write_new(dst,data)
    custody={'schema':1,'repo':g.REPO,'version':spec['version'],'desktop_source':spec['desktop_source'],'server_source':spec['server_source'],'tool':spec['tool'],'run_id':checked['receipt']['run_id'],'run_attempt':1,'pin_sha256':spec['pin_sha256'],'authority_sha256':spec['authority_sha256'],'files':{n:{'sha256':g.sha(v),'size':len(v)} for n,v in rows.items()},'harness13':checked['harness13'],'scope':'Standalone product ZIP and exact source/compile receipt only. No native Linux QA success inferred by bootstrap upload.'}
    write_new(target/'custody.json',(json.dumps(custody,indent=2)+'\n').encode())
    return custody
