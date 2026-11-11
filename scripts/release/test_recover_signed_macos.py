"""Source/digest rejection checks for packaging-only preserved-app recovery."""
import hashlib,json,os,pathlib,plistlib,runpy,shutil,tempfile,unittest,zipfile
from unittest.mock import patch
P=pathlib.Path;SCRIPT=P(__file__).with_name('recover-signed-macos.py');SOURCE='a'*40
class RecoveryTests(unittest.TestCase):
 def scenario(self,wrong=None):
  with tempfile.TemporaryDirectory() as tmp:
   root=P(tmp);(root/'desktop').mkdir();(root/'desktop/standalone.zip').write_bytes(b'exact-bundle')
   archive=root/'input.zip'
   with zipfile.ZipFile(archive,'w') as z:
    z.writestr('Kindred.app/Contents/Info.plist',plistlib.dumps({'CFBundleShortVersionString':'0.90.2','CFBundleExecutable':'kindred-desktop'}))
    z.writestr('Kindred.app/Contents/MacOS/kindred-desktop',b'unchanged-signed-binary')
    z.writestr('Kindred.app/Contents/Resources/standalone.zip',b'wrong-bundle' if wrong=='bundle' else b'exact-bundle')
   digest=hashlib.sha256(archive.read_bytes()).hexdigest();calls=[]
   def output(args,**kw):
    if args[0]=='git':return SOURCE+'\n'
    if args[0]=='lipo':return 'arm64\n'
    if args[-1].endswith('/artifacts'):return json.dumps({'artifacts':[{'name':'unverified-kindred-0.90.2-aarch64-apple-darwin','expired':False,'id':10,'digest':'sha256:outer-verified-by-actions'}]}).encode()
    return json.dumps({'head_sha':'b'*40 if wrong=='source' else SOURCE,'status':'in_progress' if wrong=='run' else 'completed','conclusion':'failure'}).encode()
   def run(args,**kw):
    calls.append(args)
    if args[:3]==['gh','run','download']:
     d=P(args[-1]);d.mkdir();shutil.copy2(archive,d/'Kindred.app.zip')
    elif args[0]=='ditto':
     with zipfile.ZipFile(args[3]) as z:z.extractall(args[4])
    elif args[0]=='codesign':self.assertEqual(args[1],'--verify')
    else:raise AssertionError(args)
   env={'KINDRED_PACKAGE_SOURCE_ROOT':str(root),'PRESERVED_RUN':'123','PRESERVED_SHA256':'0'*64 if wrong=='hash' else digest,'RELEASE_VERSION':'0.90.2'}
   with patch.dict(os.environ,env),patch('subprocess.check_output',side_effect=output),patch('subprocess.run',side_effect=run):
    if wrong:
     with self.assertRaises(AssertionError):runpy.run_path(str(SCRIPT))
     self.assertFalse((root/'mac-validation/preserved-app-recovery.json').exists())
     if wrong in ('source','run','hash'):self.assertFalse(any(a[0]=='ditto' for a in calls))
    else:
     runpy.run_path(str(SCRIPT));r=json.loads((root/'mac-validation/preserved-app-recovery.json').read_text());self.assertFalse(r['compiled']);self.assertFalse(r['resigned']);self.assertTrue(r['signature_verified']);self.assertEqual((root/'desktop/target/aarch64-apple-darwin/release/kindred-desktop').read_bytes(),b'unchanged-signed-binary');self.assertEqual(r['app_zip_sha256'],digest)
 def test_accepts_unchanged_app_and_never_resigns(self):self.scenario()
 def test_rejects_wrong_source_before_extract(self):self.scenario('source')
 def test_rejects_unfinished_run_before_extract(self):self.scenario('run')
 def test_rejects_wrong_zip_hash_before_extract(self):self.scenario('hash')
 def test_rejects_wrong_bundled_server(self):self.scenario('bundle')
if __name__=='__main__':unittest.main()
