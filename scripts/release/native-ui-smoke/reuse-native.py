"""Restore exact failed-run package bytes; never builds or signs the product."""
from pathlib import Path
import argparse,json,hashlib,subprocess,zipfile,stat,os,shutil,time,signal
p=argparse.ArgumentParser();p.add_argument('phase',choices=['restore','provenance','unchanged']);p.add_argument('--platform',choices=['windows','macos'],required=True);a=p.parse_args()
HERE=Path(__file__).resolve().parent;origin=json.loads((HERE/'reuse-origins.json').read_text())[a.platform];root=Path.cwd();out=root/'reuse-validation';out.mkdir(exist_ok=True);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();target={'windows':'x86_64-pc-windows-msvc','macos':'aarch64-apple-darwin'}[a.platform];base=root/'desktop/target'/target/'release';APP='146373f5e255b62c60b34701d730a6ced0dffbdf'
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==APP

def safe(z):
 rows=z.infolist();assert len(rows)<=32 and sum(x.file_size for x in rows)<256*1024**2;seen=set()
 for x in rows:
  q=Path(x.filename);assert not q.is_absolute() and '..' not in q.parts and '\\' not in x.filename and x.filename not in seen and stat.S_IFMT(x.external_attr>>16) in (0,stat.S_IFREG,stat.S_IFDIR);seen.add(x.filename)
 assert z.testzip() is None
 return rows

def fixed_write(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 with path.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())

def manifest():return json.loads((out/'restored.json').read_text())
if a.phase=='restore':
 assert shutil.disk_usage(root).free>=1024**3+256*1024**2
 raw=out/'origin.zip';assert not raw.exists()
 meta=json.loads(subprocess.check_output(['gh','api','repos/awpsec/kindred/actions/artifacts/'+str(origin['artifact_id'])],timeout=30))
 assert meta['id']==origin['artifact_id'] and not meta['expired'] and meta['size_in_bytes']==origin['raw_bytes'] and meta['digest']=='sha256:'+origin['raw_sha256'] and meta['workflow_run']['id']==origin['run_id'] and meta['workflow_run']['head_sha']==origin['tool_commit']
 # Stream into a bounded file, with a separate hard process deadline even if read stalls.
 import threading
 proc=subprocess.Popen(['gh','api','repos/awpsec/kindred/actions/artifacts/'+str(origin['artifact_id'])+'/zip'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,start_new_session=True)
 timer=threading.Timer(120,proc.kill);timer.start();count=0
 try:
  with raw.open('xb') as f:
   while True:
    chunk=proc.stdout.read(65536)
    if not chunk:break
    count+=len(chunk);assert count<=origin['raw_bytes'];f.write(chunk)
  assert proc.wait(timeout=5)==0 and count==origin['raw_bytes'] and sha(raw)==origin['raw_sha256']
 finally:
  timer.cancel()
  if proc.poll() is None:proc.kill()
  proc.wait(timeout=5);proc.stdout.close()
 restored={}
 with zipfile.ZipFile(raw) as z:
  rows=safe(z);assert [{'name':x.filename,'bytes':x.file_size,'CRC':x.CRC}for x in rows]==origin['outer_members']
  if a.platform=='windows':
   binary=base/'kindred-desktop.exe';fixed_write(binary,z.read(rows[0]));assert sha(binary)==origin['binary_sha256'];restored[str(binary.relative_to(root))]=sha(binary)
  else:
   dmg=next(x for x in rows if x.filename.endswith('.dmg'));appzip=next(x for x in rows if x.filename.endswith('Kindred.app.zip'));fixed_write(root/dmg.filename,z.read(dmg));assert sha(root/dmg.filename)==origin['dmg_sha256']
   import io,plistlib
   with zipfile.ZipFile(io.BytesIO(z.read(appzip))) as app:
    members=safe(app)
    for x in members:
     if x.is_dir():continue
     assert x.filename.startswith('Kindred.app/')
     dest=base/'bundle/macos'/x.filename;fixed_write(dest,app.read(x))
   binary=base/'bundle/macos/Kindred.app/Contents/MacOS/kindred-desktop';binary.chmod(0o755);assert sha(binary)==origin['binary_sha256']
   info=plistlib.loads((binary.parents[1]/'Info.plist').read_bytes());assert info['CFBundleShortVersionString']=='0.87.10' and info['CFBundleExecutable']=='kindred-desktop'
   assert sha(binary.parents[1]/'Resources/standalone.zip')==origin['standalone_sha256']
   fixed_write(root/'desktop/standalone.zip',(binary.parents[1]/'Resources/standalone.zip').read_bytes())
   fixed_write(base/'kindred-desktop',binary.read_bytes());(base/'kindred-desktop').chmod(0o755)
   for f in [binary,base/'kindred-desktop',root/dmg.filename,binary.parents[1]/'Resources/standalone.zip']:restored[str(f.relative_to(root))]=sha(f)
 fixed_write(out/'restored.json',(json.dumps({'origin':origin,'restored':restored,'current_verification_run':os.environ['GITHUB_RUN_ID'],'product_recompiled':False,'product_resigned':False},indent=2)+'\n').encode())
else:
 saved=manifest()
 for n,h in saved['restored'].items():assert sha(root/n)==h,'Original package bytes changed'
 if a.phase=='provenance':
  f=root/'package-artifacts'/('build-'+target+'.json');m=json.loads(f.read_text());assert m['source_commit']==APP and m['version']=='0.87.10';m['compiled_reuse_provenance']=saved;f.write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps({'phase':a.phase,'platform':a.platform,'passed':True,'product_recompiled':False,'product_resigned':False}))
