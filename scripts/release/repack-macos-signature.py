"""Repair only an existing Mac app's ad-hoc bundle signature, on a Mac.

Retains the compiled app and resources, verifies native signatures, and creates a
new DMG with exact input provenance. No Apple credentials, notarization, runtime
compilation, release publication or system security changes are involved.
"""
from pathlib import Path
import argparse,hashlib,json,os,platform,plistlib,shutil,subprocess,tempfile

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--directory',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
p.add_argument('--version',required=True);p.add_argument('--source-commit',required=True)
p.add_argument('--target',choices=['aarch64-apple-darwin','x86_64-apple-darwin'],required=True);a=p.parse_args()
assert platform.system()=='Darwin'
manifest=json.loads((a.directory/f'build-{a.target}.json').read_text())
assert manifest['target']==a.target and manifest['version']==a.version and manifest['source_commit']==a.source_commit
assert len(manifest['assets'])==1 and manifest['assets'][0]['kind']=='dmg'
entry=manifest['assets'][0];assert Path(entry['name']).name==entry['name']
original=(a.directory/entry['name']).resolve()
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert original.stat().st_size==entry['bytes'] and digest(original)==entry['sha256']
out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
run=lambda args:subprocess.run([str(x) for x in args],check=True,timeout=180)
run(['hdiutil','verify',original])
with tempfile.TemporaryDirectory(prefix='kindred-signature-repair-') as temp:
 temp=Path(temp);mount=temp/'mount';mount.mkdir();stage=temp/'stage';stage.mkdir()
 run(['hdiutil','attach','-readonly','-nobrowse','-mountpoint',mount,original])
 try:
  apps=list(mount.glob('*.app'));assert len(apps)==1
  app=stage/apps[0].name;run(['ditto',apps[0],app])
  for name in ['.background','.DS_Store','.VolumeIcon.icns']:
   if (mount/name).exists():run(['ditto',mount/name,stage/name])
 finally:run(['hdiutil','detach',mount])
 os.symlink('/Applications',stage/'Applications')
 info=plistlib.loads((app/'Contents/Info.plist').read_bytes());assert info['CFBundleShortVersionString']==a.version
 executable=app/'Contents/MacOS'/info['CFBundleExecutable']
 # Only the Mach-O signature and the signature resource directory may change.
 before={str(f.relative_to(app)):digest(f) for f in app.rglob('*') if f.is_file() and not f.is_symlink() and '_CodeSignature' not in f.parts and f!=executable}
 # Preserve the original entitlement and hardened-runtime metadata when repairing
 # the bundle seal; otherwise a valid signature can silently lose audio access.
 run(['codesign','--force','--sign','-','--preserve-metadata','--timestamp=none',app])
 run(['codesign','--verify','--deep','--strict','--verbose=2',app])
 for name,sha in before.items():assert digest(app/name)==sha,name
 repaired=out/entry['name']
 run(['hdiutil','create','-volname','Kindred','-srcfolder',stage,'-format','UDZO',repaired])
 run(['hdiutil','verify',repaired])
 manifest['assets']=[{'name':repaired.name,'kind':'dmg','bytes':repaired.stat().st_size,'sha256':digest(repaired)}]
 manifest['macos_bundle_signature_verified']=True
 manifest['packaging']={'operation':'ad-hoc bundle signature repair','input_dmg_sha256':entry['sha256'],'application_recompiled':False,'unchanged_resource_files':len(before),'notarized':False,'tool_commit':subprocess.check_output(['git','-C',str(Path(__file__).resolve().parents[2]),'rev-parse','HEAD'],text=True).strip()}
 (out/f'build-{a.target}.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(json.dumps(manifest,indent=2))
