import json
import runpy
import tempfile
import unittest
from pathlib import Path

check = runpy.run_path(str(Path(__file__).with_name('verify-installations.py')))['check']


class AcceptanceTests(unittest.TestCase):
    def test_independent_hosts_native_voice_and_exact_source_are_required(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            row = dict(id='mac', kind='desktop', target='macos-aarch64', source_commit='a'*40,
                       voice_required=True, receipt='mac.json')
            receipt = dict(installation_id='mac', kind='desktop', target='macos-aarch64',
                           source_commit='a'*40, version='0.88.6', artifact_sha256='b'*64,
                           installed=True, health_verified=True, accounts_preserved=True,
                           tests_passed=True, native_verified=True, identity_preserved=True,
                           two_way_voice_verified=True, checked_utc='2026-11-03T00:00:00Z', test_receipts=['native.json'])
            def write(): (root/'mac.json').write_text(json.dumps(receipt))
            write()
            plan = dict(version='0.88.6', installations=[row])
            self.assertTrue(check(plan,root)['accepted'])
            for key, bad in [('source_commit','c'*40),('version','0.88.5'),('installed',False),('two_way_voice_verified',False)]:
                old=receipt[key];receipt[key]=bad;write()
                self.assertFalse(check(plan,root)['accepted'])
                receipt[key]=old
            write()
            plan['installations'].append(dict(id='standalone',kind='standalone',target='linux-x86_64',source_commit='d'*40))
            result=check(plan,root)
            self.assertTrue(result['installations'][0]['accepted'])
            self.assertFalse(result['accepted'])

    def test_busy_server_is_not_accepted_as_safe_deployment(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            item=dict(id='hosted',kind='hosted',target='linux-x86_64',source_commit='a'*40,receipt='server.json')
            receipt=dict(installation_id='hosted',kind='hosted',target='linux-x86_64',source_commit='a'*40,
                version='0.88.6',artifact_sha256='b'*64,installed=True,health_verified=True,
                accounts_preserved=True,tests_passed=True,test_receipts=['server.json'],checked_utc='now',
                backup_verified=True,vm_disks_preserved=True,routes_preserved=True,idle_before_switch=False)
            (root/'server.json').write_text(json.dumps(receipt))
            self.assertIn('idle_before_switch not verified',check(dict(version='0.88.6',installations=[item]),root)['installations'][0]['pending'])


if __name__ == '__main__': unittest.main()
