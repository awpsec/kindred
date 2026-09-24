import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import base64
import zipfile
import xml.etree.ElementTree as ET
import plistlib

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('release_gate', Path(__file__).with_name('verify-release.py'))
gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)

class ReleaseControls(unittest.TestCase):
    def test_dmg_verifies_mounted_image_without_a_staging_app(self):
        spec = importlib.util.spec_from_file_location('package_collector', Path(__file__).with_name('collect-packages.py'))
        collector = importlib.util.module_from_spec(spec); spec.loader.exec_module(collector)
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            if args[:2] == ['hdiutil','attach']:
                mount = Path(args[args.index('-mountpoint')+1])
                contents = mount/'Kindred.app/Contents';(contents/'MacOS').mkdir(parents=True)
                (contents/'Info.plist').write_bytes(plistlib.dumps({'CFBundleShortVersionString':'1.2.3','CFBundleExecutable':'kindred-desktop'}))
                (contents/'MacOS/kindred-desktop').write_bytes(b'fixture')
        with tempfile.TemporaryDirectory() as folder:
            dmg=Path(folder)/'fixture.dmg';dmg.write_bytes(b'fixture'+b'koly'+bytes(508))
            with patch.object(collector,'version',return_value='1.2.3'),patch.object(collector.subprocess,'run',side_effect=run),patch.object(collector.subprocess,'check_output',return_value='arm64\n'):
                collector.inspect(dmg,'dmg','aarch64-apple-darwin')
            self.assertTrue(any(c[:2]==['hdiutil','detach'] for c in calls))
            self.assertTrue(any(c[:4]==['codesign','--verify','--deep','--strict'] for c in calls))

    def test_complete_signed_set_passes_but_does_not_authorize_publication(self):
        from cryptography.hazmat.primitives.asymmetric import rsa, padding
        from cryptography.hazmat.primitives import hashes
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder); version = '1.2.3'; native = b'MZfixture-native'
            for target, kinds in gate.REQUIRED.items():
                assets = []
                for kind in sorted(kinds):
                    suffix = {'native':'exe','appimage':'AppImage'}.get(kind,kind)
                    name = f'Kindred-{version}-{target}.{suffix}'
                    data = {'native':native,'dmg':b'fixture'+b'koly'+bytes(508),'deb':b'!<arch>\nfixture','appimage':b'\x7fELF'+bytes(4)+b'AI\x02fixture'}[kind]
                    (p/name).write_bytes(data)
                    assets.append({'kind':kind,'name':name,'bytes':len(data),'sha256':gate.sha(data)})
                (p/f'build-{target}.json').write_text(json.dumps({'target':target,'version':version,'source_commit':'a'*40,'assets':assets,'macos_bundle_signature_verified':True}))
            setup = p/f'Kindred-{version}-Setup.exe'; setup.write_bytes(b'MZfixture-setup')
            archive = p/f'kindred-windows-{version}.zip'
            with zipfile.ZipFile(archive,'w') as z:
                z.writestr('Kindred.exe',native);z.writestr('release.json',json.dumps({'version':version}))
            payload = json.dumps({'version':version,'platform':'windows-x86_64','size':archive.stat().st_size,'sha256':gate.sha(archive.read_bytes())}).encode()
            key = rsa.generate_private_key(public_exponent=65537,key_size=2048)
            sig = key.sign(payload,padding.PKCS1v15(),hashes.SHA256())
            (p/'stable.json').write_text(json.dumps({'payload':base64.b64encode(payload).decode(),'signature':base64.b64encode(sig).decode()}))
            proof = {'passed':True,'version':version,'installerSha256':gate.sha(setup.read_bytes()),'packageSha256':gate.sha(archive.read_bytes()),'exactSignedPayload':True}
            (p/'installer-verification.json').write_text(json.dumps(proof))
            public = key.public_key().public_numbers();tree=ET.Element('RSAKeyValue')
            for label,n in [('Exponent',public.e),('Modulus',public.n)]:ET.SubElement(tree,label).text=base64.b64encode(n.to_bytes((n.bit_length()+7)//8,'big')).decode()
            with patch('xml.etree.ElementTree.parse',return_value=ET.ElementTree(tree)):
                # This fixture covers the legacy Windows proof; test_client_updates covers the full new feed.
                result = gate.verify(p,version,'a'*40,require_client_feed=False)
                self.assertTrue(result['ready']);self.assertFalse(result['publication_authorized'])
                mac_manifest = p/'build-aarch64-apple-darwin.json'
                original = mac_manifest.read_text()
                row = json.loads(original);row.pop('macos_bundle_signature_verified')
                mac_manifest.write_text(json.dumps(row))
                with self.assertRaisesRegex(ValueError,'signature'):
                    gate.verify(p,version,'a'*40)
                mac_manifest.write_text(original)
                proof['packageSha256']='0'*64;(p/'installer-verification.json').write_text(json.dumps(proof))
                with self.assertRaisesRegex(ValueError,'Missing installer validation'):
                    gate.verify(p,version,'a'*40)

    def test_workflows_cannot_start_from_pushes_tags_or_schedules(self):
        for name in ['desktop-ci.yml', 'server-ci.yml', 'desktop-validation-ci.yml']:
            s = (Path(__file__).parent / name).read_text()
            self.assertIn('  workflow_dispatch:', s)
            for event in ['push:', 'pull_request:', 'schedule:', 'release:', 'workflow_run:']:
                self.assertNotIn(event, s)
            self.assertIn('default: false', s)
            self.assertIn('inputs.approve_runner_usage', s)
            self.assertIn('contents: read', s)
            self.assertNotIn('contents: write', s)

    def test_windows_only_release_is_blocked(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder); (p/'Kindred-1.2.3-Setup.exe').write_bytes(b'MZfixture')
            with self.assertRaisesRegex(ValueError, 'Missing platform manifest'):
                gate.verify(p, '1.2.3', 'a'*40)

    def test_mixed_version_and_source_are_blocked_before_publication(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)
            row = {'target':'x86_64-unknown-linux-gnu','version':'1.2.2','source_commit':'a'*40,'assets':[]}
            (p/'build-x86_64-unknown-linux-gnu.json').write_text(json.dumps(row))
            with self.assertRaisesRegex(ValueError, 'Mixed version/source'):
                gate.verify(p, '1.2.3', 'a'*40)

    def test_tampered_package_is_blocked(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder); (p/'linux.deb').write_bytes(b'changed')
            row = {'target':'x86_64-unknown-linux-gnu','version':'1.2.3','source_commit':'a'*40,'assets':[{'kind':'deb','name':'linux.deb','bytes':7,'sha256':'0'*64},{'kind':'appimage','name':'linux.AppImage','bytes':1,'sha256':'0'*64}]}
            (p/'build-x86_64-unknown-linux-gnu.json').write_text(json.dumps(row))
            with self.assertRaisesRegex(ValueError, 'Package changed'):
                gate.verify(p, '1.2.3', 'a'*40)

if __name__ == '__main__': unittest.main()
