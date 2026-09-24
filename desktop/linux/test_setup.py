"""Exercise the shipped recovery script with recorded package/group commands.

Run on Linux. No root access, real package installation, or Docker daemon is used.
The AppImage integration smoke test is separate and uses an isolated container.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

FAKE = r'''#!/usr/bin/python3
import json,os,sys
from pathlib import Path
root=Path(os.environ['FIXTURE_ROOT']); command=Path(sys.argv[0]).name; args=sys.argv[1:]
if command=='sudo':
    if args==['-v']:sys.exit(0)
    os.environ['FIXTURE_SUDO']='1';command,args=args[0],args[1:]
if command=='timeout':command,args=args[1],args[2:]
state=json.loads((root/'state.json').read_text())
with (root/'calls.jsonl').open('a') as f:f.write(json.dumps([command,args,bool(os.environ.get('FIXTURE_SUDO')),{k:v for k,v in os.environ.items() if k.startswith('GST_')}])+'\n')
def save(): (root/'state.json').write_text(json.dumps(state))
if command=='id':
    if args==['-u']:print('1000')
    elif args==['-un']:print('casey')
    elif args and args[0]=='-nG':print('casey docker' if state.get('active') or (len(args)>1 and state.get('member')) else 'casey')
elif command=='uname':print('x86_64')
elif command=='dpkg-query':
    if state.get('conflict')==args[-1]:print('install ok installed')
    else:sys.exit(1)
elif command=='dpkg':print('amd64')
elif command=='apt-cache':sys.exit(0 if state.get('repository') else 1)
elif command=='rpm':sys.exit(0 if state.get('conflict') in args else 1)
elif command=='gst-inspect-1.0':sys.exit(1 if state.get('missing_plugin') in args else 0)
elif command in ('apt-get','dnf','pacman'):
    if state.get('package_failure'):sys.exit(42)
    if 'install' in args or '-S' in args:
        if 'docker-ce' in args or 'docker' in args:
            state['installed']=True;(root/'bin/docker').symlink_to('fake');state['compose']=True
        if 'docker-compose-plugin' in args or 'docker-compose-v2' in args:state['compose']=True
        save()
    elif 'repolist' in args:sys.exit(1)
elif command=='docker':
    if args[:2]==['context','show']:print(state.get('context','default'))
    elif args[:2]==['compose','version']:sys.exit(0 if state.get('compose') else 1)
    elif args and args[0]=='info':sys.exit(0 if state.get('daemon') and (state.get('active') or os.environ.get('FIXTURE_SUDO')) else 1)
elif command=='systemctl':state['daemon']=True;save()
elif command=='getent':sys.exit(0)
elif command=='usermod':state['member']=True;save()
elif command=='tee':sys.stdin.read();state['repository']=True;save()
elif command not in ('install','curl','chmod','groupadd'):raise SystemExit('Unexpected fixture command '+command)
'''


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        fake = self.bin / 'fake'
        fake.write_text(FAKE)
        fake.chmod(0o755)
        for name in ['sudo', 'timeout', 'id', 'uname', 'systemctl', 'dpkg', 'dpkg-query', 'apt-cache', 'rpm', 'getent','gst-inspect-1.0']:
            (self.bin / name).symlink_to('fake')
        # Do not let an installed host Docker satisfy the "not installed" case.
        # Only these read-only text utilities may escape the command fixture.
        for name in ['grep', 'tr', 'env']:
            (self.bin / name).symlink_to(shutil.which(name))
        self.script = self.root / 'setup.sh'
        self.source = Path(__file__).with_name('setup.sh').read_text()
        self.env = {**os.environ, 'PATH': str(self.bin), 'FIXTURE_ROOT': str(self.root)}
        self.env.pop('DOCKER_HOST', None)
        self.env.pop('DOCKER_CONTEXT', None)

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, state, distro='ubuntu', args=()):
        (self.root / 'state.json').write_text(json.dumps(state))
        if state.get('installed') and not (self.bin / 'docker').exists():
            (self.bin / 'docker').symlink_to('fake')
        self.script.write_text(self.source.replace('. /etc/os-release', f'ID={distro}\nVERSION_CODENAME=noble'))
        result = subprocess.run(['/bin/bash', str(self.script), *args], env=self.env, text=True, capture_output=True, timeout=20)
        log = self.root / 'calls.jsonl'
        calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
        return result, calls

    def test_new_engine_compose_and_group_require_desktop_login(self):
        result, calls = self.run_script({})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('SIGN OUT', result.stdout)
        self.assertTrue(any(c[0] == 'usermod' and c[1] == ['-aG', 'docker', 'casey'] for c in calls))
        self.assertTrue(any(c[0] == 'apt-get' and 'docker-compose-plugin' in c[1] for c in calls))
        state = json.loads((self.root / 'state.json').read_text())
        state['active'] = True
        (self.root / 'calls.jsonl').unlink()
        result, calls = self.run_script(state)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('SIGN OUT', result.stdout)
        self.assertFalse(any(c[0] == 'usermod' for c in calls))

    def test_installed_but_membership_not_in_session(self):
        result, calls = self.run_script({'installed': True, 'compose': True, 'daemon': True, 'member': True})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('SIGN OUT', result.stdout)
        self.assertFalse(any(c[0] == 'usermod' for c in calls))

    def test_missing_compose_does_not_replace_engine(self):
        result, calls = self.run_script({'installed': True, 'daemon': True, 'active': True, 'repository': True})
        self.assertEqual(result.returncode, 0, result.stderr)
        installs = [c[1] for c in calls if c[0] == 'apt-get' and 'install' in c[1]]
        self.assertEqual(installs, [['install', '-y', 'docker-compose-plugin']])

    def test_conflicting_container_software_is_preserved(self):
        result, calls = self.run_script({'conflict': 'containerd'})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('does not remove', result.stderr)
        self.assertFalse(any('remove' in c[1] for c in calls))

    def test_unsupported_distribution_and_package_failure_stop(self):
        result, calls = self.run_script({}, 'unknown')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(c[2] for c in calls))
        result, calls = self.run_script({'package_failure': True})
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(c[0] == 'usermod' for c in calls))

    def test_custom_unavailable_context_is_not_replaced(self):
        result, calls = self.run_script({'installed': True, 'context': 'rootless'})
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(c[2] for c in calls))

    def test_fedora_installs_compose_and_does_not_claim_current_session_ready(self):
        result, calls = self.run_script({}, 'fedora')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('SIGN OUT', result.stdout)
        self.assertTrue(any(c[0] == 'dnf' and 'docker-compose-plugin' in c[1] for c in calls))

    def test_cachyos_client_only_installs_and_verifies_audio_without_docker(self):
        self.env['GST_PLUGIN_SYSTEM_PATH_1_0']='/disabled/bundled/plugins'
        self.env['GST_PLUGIN_SCANNER_1_0']='/disabled/bundled/scanner'
        result,calls=self.run_script({}, 'cachyos', ['--client'])
        self.assertEqual(result.returncode,0,result.stderr)
        installs=[c[1] for c in calls if c[0]=='pacman']
        self.assertEqual(len(installs),1)
        self.assertIn('gst-plugins-good',installs[0]); self.assertIn('gstreamer',installs[0])
        self.assertNotIn('-Sy',installs[0])
        self.assertFalse(any(c[0] in ('docker','systemctl','usermod') for c in calls))
        probes=[c for c in calls if c[0]=='gst-inspect-1.0']
        self.assertEqual(len(probes),6)
        self.assertTrue(all(not c[3] for c in probes))

    def test_cachyos_standalone_uses_distribution_docker(self):
        result,calls=self.run_script({},'cachyos')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertTrue(any(c[0]=='pacman' and 'docker-compose' in c[1] for c in calls))
        self.assertIn('SIGN OUT',result.stdout)

    def test_cachyos_keeps_an_existing_engine(self):
        result,calls=self.run_script({'installed':True,'compose':True,'daemon':True,'active':True},'cachyos')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(any(c[0]=='pacman' for c in calls))

    def test_missing_audio_plugin_stops_before_launcher_changes(self):
        result,calls=self.run_script({'missing_plugin':'autoaudiosink'},'cachyos',['--client'])
        self.assertNotEqual(result.returncode,0)
        self.assertIn('autoaudiosink is unavailable',result.stderr)
        self.assertNotIn('audio plugins are ready',result.stdout)

    def test_native_launcher_clears_stale_gstreamer_paths(self):
        import sys
        appdir=self.root/'Kindred test.AppDir'
        binary=appdir/'usr/bin/kindred-desktop';binary.parent.mkdir(parents=True)
        binary.write_text('#!'+sys.executable+'\nimport json,os;print(json.dumps(dict(os.environ)))\n');binary.chmod(0o755)
        icon=appdir/'usr/share/icons/hicolor/512x512/apps/kindred-desktop.png';icon.parent.mkdir(parents=True);icon.write_bytes(b'fixture')
        data=self.root/'data $special % space'
        snippet=self.source.split("<<'KINDRED_MENU_PY'\n",1)[1].split('\nKINDRED_MENU_PY',1)[0]
        subprocess.run([sys.executable,'-',str(self.root),str(data),str(binary)],input=snippet,text=True,check=True,capture_output=True)
        variables=['GST_PLUGIN_PATH','GST_PLUGIN_PATH_1_0','GST_PLUGIN_SYSTEM_PATH','GST_PLUGIN_SYSTEM_PATH_1_0','GST_PLUGIN_SCANNER','GST_PLUGIN_SCANNER_1_0','GST_REGISTRY','GST_REGISTRY_1_0']
        env={**os.environ,**{key:'/stale/bundle' for key in variables},'KINDRED_TEST_KEEP':'keep'}
        result=subprocess.run([str(data/'kindred/bin/kindred')],env=env,text=True,capture_output=True,check=True)
        actual=json.loads(result.stdout)
        self.assertTrue(all(key not in actual for key in variables))
        self.assertEqual(actual['KINDRED_TEST_KEEP'],'keep')


if __name__ == '__main__':
    unittest.main()
