"""Recover one source-bound signed app; no compile, signing or retry."""
import hashlib,json,os,pathlib,plistlib,re,shutil,subprocess,zipfile
P=pathlib.Path
def sha(path):
 with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
root=P(os.environ['KINDRED_PACKAGE_SOURCE_ROOT']).resolve()
run=os.environ['PRESERVED_RUN'];expected=os.environ['PRESERVED_SHA256'];version=os.environ['RELEASE_VERSION'];target='aarch64-apple-darwin'
assert re.fullmatch(r'[0-9]+',run) and re.fullmatch(r'[0-9a-f]{64}',expected)
source=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
receipt=json.loads(subprocess.check_output(['gh','api','repos/awpsec/kindred/actions/runs/'+run]))
assert receipt['head_sha']==source and receipt['status']=='completed' and receipt['conclusion']=='failure'
name='unverified-kindred-'+version+'-'+target
artifacts=json.loads(subprocess.check_output(['gh','api','repos/awpsec/kindred/actions/runs/'+run+'/artifacts']))['artifacts']
artifact,=[a for a in artifacts if a['name']==name and not a['expired']]
stage=root/'preserved-macos';assert not stage.exists()
subprocess.run(['gh','run','download',run,'-R','awpsec/kindred','--name',name,'--dir',str(stage)],check=True)
archives=list(stage.rglob('Kindred.app.zip'));assert len(archives)==1
archive=archives[0];assert sha(archive)==expected
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert all(not P(n).is_absolute() and '..' not in P(n).parts for n in z.namelist())
base=root/'desktop/target'/target/'release';bundle=base/'bundle/macos';bundle.mkdir(parents=True);app=bundle/'Kindred.app';assert not app.exists()
subprocess.run(['ditto','-x','-k',str(archive),str(bundle)],check=True)
subprocess.run(['codesign','--verify','--deep','--strict','--verbose=2',str(app)],check=True)
info=plistlib.loads((app/'Contents/Info.plist').read_bytes());assert info['CFBundleShortVersionString']==version
binary=app/'Contents/MacOS'/info['CFBundleExecutable']
assert subprocess.check_output(['lipo','-archs',str(binary)],text=True).strip()=='arm64'
assert sha(app/'Contents/Resources/standalone.zip')==sha(root/'desktop/standalone.zip')
shutil.copy2(binary,base/'kindred-desktop')
proof={'source_commit':source,'version':version,'build_run':run,'artifact_id':artifact['id'],'artifact_digest':artifact['digest'],'app_zip_sha256':expected,'executable_sha256':sha(binary),'bundle_sha256':sha(root/'desktop/standalone.zip'),'compiled':False,'resigned':False,'signature_verified':True}
out=root/'mac-validation';out.mkdir(exist_ok=True);(out/'preserved-app-recovery.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof))
