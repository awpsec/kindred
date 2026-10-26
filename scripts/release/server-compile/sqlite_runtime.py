"""Pinned real SQLite for the unchanged SQL regression suite; no product edits."""
from pathlib import Path, PurePosixPath
import argparse,datetime,hashlib,importlib,json,os,re,runpy,signal,sqlite3 as _unused_builtin_probe,stat,sys,urllib.request,zipfile
# Importing the builtin above is diagnostic only; it is never the selected test provider.
sys.dont_write_bytecode=True
NAME='pysqlite3_binary-0.5.4-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl'
SIZE=5195175
SHA='cb551d736ac3a049b3a91332dbcb0df506eaed58add8a95acfd264dc45ce3fa8'
URL='https://files.pythonhosted.org/packages/fe/6a/fd500f0ab7d722671c6ec93093e93b7448b416cee2f35fc6c40131ddfa87/'+NAME
SOURCE='b13363fcc9911f214bb1f2c86915abaca50c606f'
SOURCE_HASHES={'deploy/test_continuity_invalidation.py':'00d358eadd9c8c960e50a2c7e09bad50243755ba33c77316abfd1eb049a29ca4','src/migrations/continuity-2.sql':'0483805e5a02008fc4022c379efd6e9aa325e4312278abb7a8ddee3ede3cc81c'}
MAX_EXPANDED=64*1024**2

def sha(data):return hashlib.sha256(data).hexdigest()
def fingerprint(s):return tuple(getattr(s,k)for k in ('st_dev','st_ino','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns'))
def read_regular(p,limit):
 p=Path(p);before=p.lstat();assert stat.S_ISREG(before.st_mode)and before.st_nlink==1 and before.st_size<=limit
 with os.fdopen(os.open(p,os.O_RDONLY|os.O_NOFOLLOW),'rb')as f:
  assert fingerprint(before)==fingerprint(os.fstat(f.fileno()));data=f.read(limit+1)
  assert len(data)==before.st_size and fingerprint(before)==fingerprint(os.fstat(f.fileno()))==fingerprint(p.lstat())
 return data

def new_file(p,data):
 with os.fdopen(os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb')as f:f.write(data);f.flush();os.fsync(f.fileno())
def safe_root(root):
 root=Path(root).absolute()
 for p in [*reversed(root.parents),root]:
  if p.exists():assert stat.S_ISDIR(p.lstat().st_mode) and not p.is_symlink()
 return root

def wheel_rows(wheel):
 raw=read_regular(wheel,SIZE);assert len(raw)==SIZE and sha(raw)==SHA
 import io
 rows={}
 with zipfile.ZipFile(io.BytesIO(raw))as z:
  infos=z.infolist();assert 0<len(infos)<=256 and len({x.filename for x in infos})==len(infos)
  assert sum(x.file_size for x in infos)<=MAX_EXPANDED
  for x in infos:
   p=PurePosixPath(x.filename);assert not p.is_absolute()and not any(k in ('','.','..')for k in p.parts)and '\\'not in x.filename and ':'not in x.filename
   assert p.parts[0]in {'pysqlite3','pysqlite3-binary','pysqlite3_binary.libs','pysqlite3_binary-0.5.4.dist-info'}
   mode=x.external_attr>>16;assert not stat.S_ISLNK(mode)and not(x.flag_bits&1)
   if x.is_dir():continue
   assert stat.S_IFMT(mode)in(0,stat.S_IFREG)and 0<=x.file_size<=32*1024**2
   data=z.read(x);assert len(data)==x.file_size
   rows[x.filename]={'bytes':len(data),'sha256':sha(data)}
 assert 'pysqlite3/__init__.py'in rows and any(n.endswith('.so')for n in rows)
 return rows

def fetch(root):
 root=safe_root(root)
 if not root.exists():root.mkdir(mode=0o700)
 wheel=root/NAME;assert not wheel.exists()
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*a,**kw):return None
 def expired(*_):raise TimeoutError('Pinned public wheel deadline')
 old=signal.signal(signal.SIGALRM,expired);signal.setitimer(signal.ITIMER_REAL,45)
 try:
  with urllib.request.build_opener(NoRedirect).open(URL,timeout=15)as r:
   assert r.status==200;data=r.read(SIZE+1);assert len(data)==SIZE and sha(data)==SHA
  new_file(wheel,data)
 finally:signal.setitimer(signal.ITIMER_REAL,0);signal.signal(signal.SIGALRM,old)
 return measure(root)

def measure(root):
 wheel=root/NAME
 rows=wheel_rows(wheel);measurement={'wheel_name':NAME,'wheel_bytes':SIZE,'wheel_sha256':SHA,'expanded_file_bytes':sum(x['bytes']for x in rows.values()),'members':len(rows),'maximum_expanded_bytes':MAX_EXPANDED,'no_provider_execution':True}
 new_file(root/'WHEEL-MEASURED.json',(json.dumps(measurement,indent=2)+'\n').encode());return measurement

def install(root):
 import io
 wheel=root/NAME;rows=wheel_rows(wheel);target=root/'provider';assert not target.exists();target.mkdir(mode=0o700)
 with zipfile.ZipFile(io.BytesIO(read_regular(wheel,SIZE)))as z:
  for name,row in rows.items():
   p=target/name
   for parent in reversed(p.parents):
    if parent==target or target in parent.parents:
     if not parent.exists():parent.mkdir(mode=0o700)
     assert stat.S_ISDIR(parent.lstat().st_mode)and not parent.is_symlink()
   data=z.read(name);assert len(data)==row['bytes']and sha(data)==row['sha256'];new_file(p,data)
 return rows

def verify_install(root):
 rows=wheel_rows(root/NAME);target=root/'provider';safe_root(target)
 all_paths=list(target.rglob('*'));assert not any(p.is_symlink()for p in all_paths)
 actual={str(p.relative_to(target)):p for p in all_paths if not p.is_dir()};assert set(actual)==set(rows)
 for name,p in actual.items():
  data=read_regular(p,32*1024**2);assert len(data)==rows[name]['bytes']and sha(data)==rows[name]['sha256']
 return rows

def source_ok(source_root):
 source_root=safe_root(source_root)
 for name,digest in SOURCE_HASHES.items():assert sha(read_regular(source_root/name,1024**2))==digest
 return source_root

def provider(root):
 assert sys.version_info[:2]==(3,12),'Exact CP312 wheel ABI required'
 rows=verify_install(root);target=root/'provider';sys.path.insert(0,str(target))
 p=importlib.import_module('pysqlite3');db=importlib.import_module('pysqlite3.dbapi2')
 assert Path(p.__file__).resolve()==(target/'pysqlite3/__init__.py').resolve()
 # Alias the genuine, hash-bound DBAPI implementation. No functions are emulated.
 sys.modules['sqlite3']=p;sys.modules['sqlite3.dbapi2']=db
 c=p.connect(':memory:')
 try:
  assert c.execute("select unixepoch('1970-01-01T00:00:00Z')").fetchone()==(0,)
  assert c.execute("select value from json_each('[\"ok\"]')").fetchall()==[('ok',)]
  c.execute('create virtual table capability_fts using fts5(content)');c.execute("insert into capability_fts values('native capability')");assert c.execute("select count(*) from capability_fts where capability_fts match 'native'").fetchone()==(1,)
  options=sorted(x[0]for x in c.execute('pragma compile_options'))
 finally:c.close()
 assert tuple(p.sqlite_version_info)>=(3,38,0)
 summary={'wheel_name':NAME,'wheel_bytes':SIZE,'wheel_sha256':SHA,'python_version':sys.version,'builtin_sqlite_version_diagnostic_only':_unused_builtin_probe.sqlite_version,'python_executable_sha256':sha(Path(sys.executable).resolve().read_bytes()),'sqlite_version':p.sqlite_version,'compile_options':options,'compile_options_sha256':sha(json.dumps(options,separators=(',',':')).encode()),'native_unixepoch':True,'native_json_each':True,'native_fts5':True,'extension_hashes':{n:r['sha256']for n,r in rows.items()if '.so'in Path(n).name},'source':SOURCE,'source_hashes':SOURCE_HASHES,'provider':'pysqlite3-binary==0.5.4','no_function_stubs_or_test_changes':True}
 assert summary['extension_hashes'];return summary


def validate_summary(s):
 assert type(s)is dict and set(s)=={'wheel_name','wheel_bytes','wheel_sha256','python_version','builtin_sqlite_version_diagnostic_only','python_executable_sha256','sqlite_version','compile_options','compile_options_sha256','native_unixepoch','native_json_each','native_fts5','extension_hashes','source','source_hashes','provider','no_function_stubs_or_test_changes'}
 assert s['wheel_name']==NAME and type(s['wheel_bytes'])is int and s['wheel_bytes']==SIZE and s['wheel_sha256']==SHA
 assert type(s['python_version'])is str and s['python_version'].startswith('3.12.')and len(s['python_version'])<=1024
 assert type(s['builtin_sqlite_version_diagnostic_only'])is str and re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+',s['builtin_sqlite_version_diagnostic_only'])
 assert re.fullmatch(r'3\.[0-9]+\.[0-9]+',s['sqlite_version']) and tuple(map(int,s['sqlite_version'].split('.')))>=(3,38,0)
 assert re.fullmatch('[0-9a-f]{64}',s['python_executable_sha256'])
 opts=s['compile_options'];assert type(opts)is list and 0<len(opts)<=256 and opts==sorted(set(opts))and all(type(x)is str and len(x)<=256 for x in opts)
 assert s['compile_options_sha256']==sha(json.dumps(opts,separators=(',',':')).encode())
 assert all(s[k]is True for k in ['native_unixepoch','native_json_each','native_fts5','no_function_stubs_or_test_changes'])
 ext=s['extension_hashes'];assert type(ext)is dict and 0<len(ext)<=8
 assert all(type(n)is str and not PurePosixPath(n).is_absolute()and '..'not in PurePosixPath(n).parts and PurePosixPath(n).parts[0]in {'pysqlite3','pysqlite3-binary','pysqlite3_binary.libs'}and '.so'in PurePosixPath(n).name and re.fullmatch('[0-9a-f]{64}',v)for n,v in ext.items())
 assert s['source']==SOURCE and s['source_hashes']==SOURCE_HASHES and s['provider']=='pysqlite3-binary==0.5.4'
 return s

def main():
 parser=argparse.ArgumentParser();parser.add_argument('action',choices=['fetch','inspect','prepare','run']);parser.add_argument('--root');parser.add_argument('--source-root',default='.');parser.add_argument('--offline',action='store_true');args=parser.parse_args();assert not(args.offline and args.action=='fetch')
 if args.action=='run':
  env=Path(os.environ['KINDRED_SQLITE_ENVIRONMENT']);root=safe_root(env.parent);assert env==root/'ENVIRONMENT.json'
  record=json.loads(read_regular(env,256*1024));src=source_ok(args.source_root);summary=provider(root);assert summary==record['provider']
  sys.argv=[str(src/'deploy/test_continuity_invalidation.py'),'-v'];exit_code=0
  try:runpy.run_path(sys.argv[0],run_name='__main__')
  except SystemExit as e:exit_code=e.code
  source_ok(src);assert verify_install(root)
  raise SystemExit(exit_code)
 root=safe_root(args.root if args.root is not None else Path(os.environ['KINDRED_SQLITE_ENVIRONMENT']).parent)
 if args.action=='fetch':print(json.dumps(fetch(root)));return
 if args.action=='inspect':print(json.dumps(measure(root)));return
 src=source_ok(args.source_root);assert sys.version_info[:2]==(3,12),'Exact CP312 wheel ABI required'
 if args.offline:assert (root/NAME).exists(),'Offline retainedwheel required; no fetch'
 if not(root/NAME).exists():fetch(root)
 install(root);summary=provider(root)
 validate_summary(summary)
 record={'schema':1,'provider':summary,'source_root_readback_only':True,'installed_file_count':len(verify_install(root))}
 new_file(root/'ENVIRONMENT.json',(json.dumps(record,indent=2)+'\n').encode());print(json.dumps(record))
if __name__=='__main__':main()
