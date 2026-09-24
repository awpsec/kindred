"""Exercise complete release signing and atomic feed promotion with disposable keys."""
import base64, hashlib, importlib.util, json, shutil, tempfile, unittest, zipfile
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding

ROOT = Path(__file__).resolve().parents[2]
def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value

def sha(data): return hashlib.sha256(data).hexdigest()

class ClientUpdates(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.source = 'a' * 40
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        numbers = self.key.public_key().public_numbers()
        encode = lambda n: base64.b64encode(n.to_bytes((n.bit_length()+7)//8, 'big')).decode()
        public = '<RSAKeyValue><Modulus>'+encode(numbers.n)+'</Modulus><Exponent>'+encode(numbers.e)+'</Exponent></RSAKeyValue>'
        for name in ['deploy', 'desktop', 'scripts/release']: (self.root/name).mkdir(parents=True)
        for name in ['deploy', 'desktop']: (self.root/name/'update-public-key.xml').write_text(public)
        for name in ['deploy/client-updates.py', 'scripts/release/sign-client-updates.py', 'scripts/release/verify-release.py']:
            shutil.copy2(ROOT/name, self.root/name)
        self.private = self.root/'fixture.pem'
        self.private.write_bytes(self.key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        self.signer = module('fixture_signer', self.root/'scripts/release/sign-client-updates.py')
        self.gate = module('fixture_gate', self.root/'scripts/release/verify-release.py')
        self.feed = module('fixture_feed', self.root/'deploy/client-updates.py')

    def envelope(self, payload):
        raw = json.dumps(payload).encode()
        return json.dumps({'payload':base64.b64encode(raw).decode(), 'signature':base64.b64encode(self.key.sign(raw,padding.PKCS1v15(),hashes.SHA256())).decode()})

    def candidate(self, version='0.52.0'):
        root = self.root/version; root.mkdir()
        native = b'MZfixture native executable'
        builds = {
            'x86_64-unknown-linux-gnu': [('appimage','AppImage',b'\x7fELF0000AI\x02fixture'),('deb','deb',b'!<arch>\nfixture')],
            'aarch64-apple-darwin': [('dmg','dmg',b'fixture'+b'koly'+bytes(508))],
            'x86_64-pc-windows-msvc': [('native','exe',native)]}
        for target, rows in builds.items():
            assets = []
            for kind, extension, content in rows:
                name = f'Kindred-{version}-{target}.{extension}'; (root/name).write_bytes(content)
                assets.append({'kind':kind,'name':name,'bytes':len(content),'sha256':sha(content)})
            (root/f'build-{target}.json').write_text(json.dumps({'version':version,'source_commit':self.source,'target':target,'assets':assets,'macos_bundle_signature_verified':True}))
        archive = root/f'kindred-windows-{version}.zip'
        with zipfile.ZipFile(archive,'w') as z:
            z.writestr('release.json',json.dumps({'version':version}));z.writestr('Kindred.exe',native)
        payload = {'version':version,'platform':'windows-x86_64','channel':'stable','size':archive.stat().st_size,'sha256':sha(archive.read_bytes())}
        (root/'stable.json').write_text(self.envelope(payload))
        setup = b'MZfixture installer';(root/f'Kindred-{version}-Setup.exe').write_bytes(setup)
        (root/'installer-verification.json').write_text(json.dumps({'passed':True,'version':version,'installerSha256':sha(setup),'exactSignedPayload':True,'packageSha256':payload['sha256']}))
        return root

    def test_complete_signing_gate_and_promotion_preserve_windows(self):
        root = self.candidate(); destination = self.root/'hosted'; destination.mkdir()
        (destination/'stable.json').write_text('existing Windows feed')
        with self.assertRaises(FileNotFoundError): self.gate.verify(root,'0.52.0',self.source)
        self.signer.sign(root,'0.52.0',self.source,self.private)
        self.assertTrue(self.gate.verify(root,'0.52.0',self.source)['ready'])
        self.feed.promote(root,destination,'promote client updates 0.52.0')
        self.feed.promote(root,destination,'promote client updates 0.52.0')
        self.assertEqual((destination/'stable.json').read_text(),'existing Windows feed')
        self.assertEqual(self.feed.verify(destination)[0]['version'],'0.52.0')
        self.assertEqual(set(self.feed.verify(destination)[0]['platforms']), {'linux-x86_64','macos-aarch64'})
        with self.assertRaises(ValueError): self.feed.promote(root,destination,'')
        with self.assertRaises(ValueError): self.signer.sign(root,'0.52.0',self.source,self.private)

    def test_incomplete_corrupt_or_symlinked_package_never_switches_feed(self):
        root = self.candidate(); self.signer.sign(root,'0.52.0',self.source,self.private)
        destination = self.root/'hosted'; self.feed.promote(root,destination,'promote client updates 0.52.0')
        old = (destination/'client-stable.json').read_bytes()
        package = root/'kindred-macos-aarch64-0.52.0.dmg'; saved = package.read_bytes()
        for mode in ['absent','corrupt','symlink']:
            package.unlink(missing_ok=True)
            if mode=='corrupt': package.write_bytes(b'corrupt')
            if mode=='symlink': package.symlink_to(root/'Kindred-0.52.0-aarch64-apple-darwin.dmg')
            with self.assertRaises(ValueError): self.feed.promote(root,destination,'promote client updates 0.52.0')
            self.assertEqual((destination/'client-stable.json').read_bytes(),old)
        package.unlink();package.write_bytes(saved)
        envelope = json.loads((root/'client-stable.json').read_text());envelope['signature']=base64.b64encode(b'invalid').decode()
        (root/'client-stable.json').write_text(json.dumps(envelope))
        with self.assertRaises(Exception): self.feed.verify(root)

    def test_downgrade_and_same_version_mutation_are_rejected(self):
        old = self.candidate(); new = self.candidate('0.53.0')
        for root in [old,new]: self.signer.sign(root,root.name,self.source,self.private)
        destination = self.root/'hosted';self.feed.promote(new,destination,'promote client updates 0.53.0')
        with self.assertRaisesRegex(ValueError,'downgrade'): self.feed.promote(old,destination,'promote client updates 0.52.0')
        release,_ = self.feed.verify(new);release['source_commit']='b'*40
        (new/'client-stable.json').write_text(self.envelope(release))
        with self.assertRaisesRegex(ValueError,'immutable'): self.feed.promote(new,destination,'promote client updates 0.53.0')
        with self.assertRaisesRegex(ValueError,'source/version'): self.gate.verify(new,'0.53.0',self.source)

if __name__=='__main__': unittest.main()
