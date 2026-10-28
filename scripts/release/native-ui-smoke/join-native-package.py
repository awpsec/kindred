"""Join actual native smoke executable to the collected immutable package."""
from pathlib import Path
import argparse,json,hashlib,subprocess,tempfile,plistlib
p=argparse.ArgumentParser();p.add_argument('--target',required=True);p.add_argument('--source-commit',required=True);p.add_argument('--version',required=True);a=p.parse_args()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
out=Path('native-ui-validation');proof=json.loads((out/'verification.json').read_bytes());m=json.loads((Path('package-artifacts')/('build-'+a.target+'.json')).read_bytes())
assert proof['passed'] is True and proof['sourceCommit']==m['source_commit']==a.source_commit and proof['version']==m['version']==a.version
assets=m['assets'];assert len(assets)==1;row=assets[0];package=Path('package-artifacts')/row['name'];assert package.name==row['name'] and package.stat().st_size==row['bytes'] and sha(package)==row['sha256']
if a.target=='x86_64-pc-windows-msvc':
 assert row['kind']=='native' and proof['platform']=='windows';binary_sha=sha(package)
elif a.target=='aarch64-apple-darwin':
 assert row['kind']=='dmg' and proof['platform']=='macos'
 with tempfile.TemporaryDirectory(prefix='kindred-native-package-join-') as tmp:
  mount=Path(tmp)/'volume';mount.mkdir();attached=False
  try:
   subprocess.run(['hdiutil','attach','-readonly','-nobrowse','-mountpoint',str(mount),str(package)],check=True,timeout=45);attached=True
   apps=list(mount.glob('*.app'));assert len(apps)==1
   info=plistlib.loads((apps[0]/'Contents/Info.plist').read_bytes());assert info['CFBundleShortVersionString']==a.version
   name=info['CFBundleExecutable'];assert Path(name).name==name
   binary_sha=sha(apps[0]/'Contents/MacOS'/name)
  finally:
   if attached:subprocess.run(['hdiutil','detach',str(mount)],check=True,timeout=30)
else:raise AssertionError('Native package join target refused')
assert binary_sha==proof['binarySha256'],'Observed native executable differs from actual collected package'
with (out/'package-binding.json').open('x') as f:json.dump({'passed':True,'source_commit':a.source_commit,'version':a.version,'target':a.target,'observed_binary_sha256':binary_sha,'package':row,'build_manifest_sha256':sha(Path('package-artifacts')/('build-'+a.target+'.json')),'verification_sha256':sha(out/'verification.json')},f,indent=2)
