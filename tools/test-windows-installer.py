"""Exercise the real Windows setup EXE without altering the user's installation.

Each install uses /D inside a unique test directory and /NOSHORTCUTS. Per-install
uninstall registry entries are removed by the tested uninstaller. Native processes
are confined to the fixture directory; the app's icon registration is restored.
"""
from pathlib import Path
import argparse,hashlib,json,os,subprocess,time,uuid,zipfile
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--installer',type=Path,required=True)
p.add_argument('--previous',type=Path,required=True)
p.add_argument('--release',type=Path,required=True)
p.add_argument('--stage',type=Path,required=True,help='Prepared build directory for signature-failure testing')
a=p.parse_args();repo=Path(__file__).resolve().parents[1]
root=repo/'test-results'/('windows-installer-'+uuid.uuid4().hex);root.mkdir(parents=True)
env={k:v for k,v in os.environ.items() if k.upper()!='PSMODULEPATH'}
env.update(APPDATA=str(root/'fixture-appdata'),WEBVIEW2_USER_DATA_FOLDER=str(root/'webview'))
reg=r'HKCU\Software\Classes\AppUserModelId\dev.kindred.personal'
old_icon=subprocess.run(['reg.exe','query',reg,'/v','IconUri'],capture_output=True,text=True,creationflags=subprocess.CREATE_NO_WINDOW)
prior=old_icon.stdout.split('REG_SZ',1)[1].strip() if old_icon.returncode==0 else None
child=None
def run(exe,install,expected=0):
 command=subprocess.list2cmdline([str(exe.resolve()),'/S','/NOSHORTCUTS'])+' /D='+str(install.resolve())
 proc=subprocess.run(command,env=env,creationflags=subprocess.CREATE_NO_WINDOW,timeout=90)
 assert proc.returncode==expected,(str(install),proc.returncode,expected)
def read(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def stop():
 global child
 if child and child.poll() is None:
  # This child was created from the fixture path below. Never target by process name.
  subprocess.run(['taskkill.exe','/PID',str(child.pid),'/T','/F'],capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW)
  child.wait(timeout=10)
 child=None
def uninstall(install):
 exe=install/'Uninstall-Kindred.exe'
 # _?= waits in this process rather than handing off to an untracked temp process.
 cmd=subprocess.list2cmdline([str(exe),'/S'])+' _?='+str(install)
 proc=subprocess.run(cmd,env=env,creationflags=subprocess.CREATE_NO_WINDOW,timeout=90)
 assert proc.returncode==0,proc.returncode
 for _ in range(30):
  if not (install/'current.json').exists():break
  time.sleep(.1)
 assert not (install/'current.json').exists()
def payload(archive):
 with zipfile.ZipFile(archive) as z:return json.loads(z.read('release.json'))['version'],{i.filename:z.read(i) for i in z.infolist()}
version,files=payload(a.release);old_version,old_files=payload(a.previous)
fresh=root/'fresh install';upgrade=root/'upgrade install'
try:
 run(a.installer,fresh)
 assert read(fresh/'current.json')['version']==version
 for name,data in files.items():assert (fresh/'versions'/version/name).read_bytes()==data,name
 assert (fresh/'Uninstall-Kindred.exe').exists()
 assert read(fresh/'settings.json')=={'server':'','serverUrl':''}
 # A second installation is harmless and does not manufacture a previous version.
 run(a.installer,fresh);assert not (fresh/'previous.json').exists()
 (fresh/'profiles.json').write_text('{"entries":[],"last":"","hardware_acceleration":false}')
 (fresh/'profiles'/'fixture-profile').mkdir(parents=True)
 (fresh/'profiles'/'fixture-profile'/'keep.txt').write_text('Saved workspace')
 (fresh/'standalone').mkdir();(fresh/'standalone'/'keep.txt').write_text('Local server data')
 saved=digest(fresh/'profiles.json')
 native=fresh/'versions'/version/'Kindred.exe';assert native.resolve().is_relative_to(root.resolve())
 child=subprocess.Popen([str(native)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
 time.sleep(2);assert child.poll() is None
 run(a.installer,fresh,20);assert digest(fresh/'profiles.json')==saved;stop()
 # Updating an existing ZIP installation preserves profiles, server selection, and old binaries.
 old=upgrade/'versions'/old_version;old.mkdir(parents=True)
 for name,data in old_files.items():(old/name).write_bytes(data)
 (upgrade/'current.json').write_text(json.dumps({'version':old_version}))
 (upgrade/'settings.json').write_text('{"server":"","serverUrl":"https://fixture.invalid"}')
 (upgrade/'profiles.json').write_text('{"entries":[],"last":"fixture","hardware_acceleration":false}')
 keep={n:digest(upgrade/n) for n in ['settings.json','profiles.json']}
 run(a.installer,upgrade)
 assert read(upgrade/'current.json')['version']==version and read(upgrade/'previous.json')['version']==old_version
 assert all(digest(upgrade/n)==h for n,h in keep.items())
 assert (old/'Kindred.exe').read_bytes()==old_files['Kindred.exe']
 for name,data in files.items():assert (upgrade/'versions'/version/name).read_bytes()==data,name
 run(a.installer,upgrade);assert read(upgrade/'previous.json')['version']==old_version
 # Downgrades and a conflicting same-version payload fail without overwriting it.
 current=(upgrade/'current.json').read_bytes();(upgrade/'current.json').write_text('{"version":"99.0.0"}')
 run(a.installer,upgrade,1);assert read(upgrade/'current.json')['version']=='99.0.0';(upgrade/'current.json').write_bytes(current)
 conflict=upgrade/'versions'/version/'WebView2Loader.dll';original=conflict.read_bytes();conflict.write_bytes(b'Conflicting fixture file')
 run(a.installer,upgrade,1);assert conflict.read_bytes()==b'Conflicting fixture file';conflict.write_bytes(original)
 # Corrupt the signed package in a separate stage and call the same embedded helper.
 tampered=root/'tampered';tampered.mkdir()
 for name in ['Install-Package.ps1','stable.json','update-public-key.xml']:(tampered/name).write_bytes((a.stage/name).read_bytes())
 (tampered/'package.zip').write_bytes(b'Not the signed package')
 bad=root/'rejected install'
 proc=subprocess.run(['powershell.exe','-NoProfile','-File',str(tampered/'Install-Package.ps1'),'-InstallRoot',str(bad),'-NoShortcuts'],env=env,capture_output=True,text=True,creationflags=subprocess.CREATE_NO_WINDOW)
 assert proc.returncode==1 and not bad.exists()
 assert 'integrity' in (tampered/'result.ini').read_text()
 uninstall(fresh);uninstall(upgrade)
 assert digest(fresh/'profiles.json')==saved
 assert (fresh/'profiles'/'fixture-profile'/'keep.txt').read_text()=='Saved workspace'
 assert (fresh/'standalone'/'keep.txt').read_text()=='Local server data'
 assert all(digest(upgrade/n)==h for n,h in keep.items())
 result={'passed':True,'version':version,'freshInstall':True,'exactSignedPayload':True,'repeatInstall':True,'runningAppBlocked':True,'zipInstallUpgradedFrom':old_version,'profilesAndSettingsPreserved':True,'downgradeBlocked':True,'conflictingVersionPreserved':True,'tamperedPayloadRejected':True,'uninstallPreservesUserData':True,'root':str(root),'installerSha256':digest(a.installer),'packageSha256':digest(a.release)}
 (root/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:
 stop()
 current_icon=subprocess.run(['reg.exe','query',reg,'/v','IconUri'],capture_output=True,text=True,creationflags=subprocess.CREATE_NO_WINDOW)
 value=current_icon.stdout.split('REG_SZ',1)[1].strip() if current_icon.returncode==0 else ''
 if value.lower().startswith(str(root).lower()+'\\'):
  command=['reg.exe','add',reg,'/v','IconUri','/t','REG_SZ','/d',prior,'/f'] if prior else ['reg.exe','delete',reg,'/v','IconUri','/f']
  subprocess.run(command,stdout=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
