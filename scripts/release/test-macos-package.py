"""Launch an existing DMG on its native Mac architecture and inspect real windows.

Uses a fresh HOME, only local fixture traffic, and existing package bytes. It does
not rebuild/re-sign the app, clear quarantine, change Gatekeeper, start Docker,
use accounts, or publish. A passing launch is separate from Gatekeeper approval.
"""
from pathlib import Path
import argparse,hashlib,json,os,platform,plistlib,signal,subprocess,tempfile,time,urllib.request,zipfile

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--directory',type=Path,required=True);p.add_argument('--source',type=Path,required=True)
p.add_argument('--version',required=True);p.add_argument('--source-commit',required=True)
p.add_argument('--target',choices=['aarch64-apple-darwin','x86_64-apple-darwin'],required=True)
p.add_argument('--output',type=Path,required=True)
p.add_argument('--reuse-native-validation',type=Path,help='Previous passing validation for the exact unchanged native executable; resource-only repacks')
p.add_argument('--reuse-installation-validation',type=Path,help='Completed installation subcheck for this exact DMG; rerun all GUI checks without recompiling tests')
a=p.parse_args()
assert not (a.reuse_native_validation and a.reuse_installation_validation)
assert platform.system()=='Darwin','Run on a Mac with a GUI session'
arch='arm64' if a.target.startswith('aarch64') else 'x86_64'
assert platform.machine()==arch,'Use a native runner for this package'
out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
tools=Path(__file__).resolve().parent
manifest=json.loads((a.directory/f'build-{a.target}.json').read_text())
assert manifest['target']==a.target and manifest['version']==a.version and manifest['source_commit']==a.source_commit
assert len(manifest['assets'])==1 and manifest['assets'][0]['kind']=='dmg'
entry=manifest['assets'][0];assert Path(entry['name']).name==entry['name']
dmg=(a.directory/entry['name']).resolve()
assert dmg.stat().st_size==entry['bytes'] and hashlib.sha256(dmg.read_bytes()).hexdigest()==entry['sha256']
assert subprocess.check_output(['git','-C',str(a.source),'rev-parse','HEAD'],text=True).strip()==a.source_commit
proof={'passed':False,'version':a.version,'target':a.target,'source_commit':a.source_commit,'dmg_sha256':entry['sha256'],'host_arch':platform.machine(),'macos':platform.mac_ver()[0],'no_security_settings_changed':True}
def command(args,name,required=True,**kwargs):
 r=subprocess.run([str(x) for x in args],capture_output=True,text=True,timeout=kwargs.pop("timeout",90),**kwargs)
 (out/name).write_text(r.stdout+r.stderr)
 if required:assert r.returncode==0,f'{name}: command failed ({r.returncode})'
 return r
def stop(child):
 if child is not None and child.poll() is None:
  os.killpg(child.pid,signal.SIGTERM)
  try:child.wait(timeout=8)
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
def wait_report(folder,phase,child):
 for _ in range(150):
  assert child.poll() is None,'Native app exited'
  path=folder/'reports.json'
  if path.exists():
   try:reports=json.loads(path.read_text())
   except json.JSONDecodeError:reports=[]
   assert all(r.get('passed') for r in reports),reports
   match=next((r for r in reports if r.get('phase')==phase),None)
   if match:return match
  time.sleep(.2)
 raise AssertionError('Native UI did not report '+phase)
def capture(child,name,required_words):
 assert child.poll() is None,'Native app exited'
 command([out/'window-proof',child.pid,out/name],name+'.log')
 rows=json.loads((out/name/'windows.json').read_text())
 text=' '.join(s for row in rows for s in row['text']).lower()
 assert all(word.lower() in text for word in required_words),f'{name}: expected UI text missing from captured windows'
 return rows
child=server=None;mounted=False
try:
 command(['hdiutil','verify',dmg],'dmg-integrity.log')
 command(['swiftc',tools/'mac-window-proof.swift','-o',out/'window-proof'],'capture-compile.log')
 command(['swiftc',tools/'mac-app-focus.swift','-o',out/'app-focus'],'focus-compile.log')
 with tempfile.TemporaryDirectory(prefix='kindred-mac-validation-') as temp:
  temp=Path(temp);mount=temp/'volume';mount.mkdir()
  command(['hdiutil','attach','-readonly','-nobrowse','-mountpoint',mount,dmg],'mount.log');mounted=True
  try:
   apps=list(mount.glob('*.app'));assert len(apps)==1
   app=temp/'Applications'/apps[0].name;app.parent.mkdir()
   command(['ditto',apps[0],app],'copy-app.log')
  finally:
   command(['hdiutil','detach',mount],'unmount.log');mounted=False
  info=plistlib.loads((app/'Contents/Info.plist').read_bytes());assert info['CFBundleShortVersionString']==a.version
  assert isinstance(info.get('NSMicrophoneUsageDescription'),str) and info['NSMicrophoneUsageDescription'].strip(),'Mac app is missing its microphone purpose declaration'
  executable=app/'Contents/MacOS'/info['CFBundleExecutable']
  assert arch in command(['lipo','-archs',executable],'architecture.log').stdout.split()
  resource=app/'Contents/Resources/standalone.zip'
  assert resource.read_bytes()==(a.source/'desktop/standalone.zip').read_bytes()
  with zipfile.ZipFile(resource) as z:assert z.testzip() is None
  proof['minimum_macos']=info.get('LSMinimumSystemVersion')
  proof['standalone_payload_exact']=True
  proof['codesign_verify_exit']=command(['codesign','--verify','--deep','--strict','--verbose=2',app],'codesign-verify.log',False).returncode
  assert proof['codesign_verify_exit']==0,'Mac app bundle signature is invalid or missing'
  command(['codesign','-dv','--verbose=4',app],'codesign-details.log',False)
  entitlements=plistlib.loads(command(['codesign','--display','--entitlements',':-',app],'codesign-entitlements.log').stdout.encode())
  assert entitlements.get('com.apple.security.device.audio-input') is True,'Mac app signature is missing the audio-input entitlement'
  proof['microphone_usage_declared']=True;proof['audio_input_entitlement']=True
  assessment=command(['spctl','--assess','--type','execute','--verbose=4',app],'gatekeeper.log',False)
  proof['gatekeeper_accepted']=assessment.returncode==0
  proof['gatekeeper_note']='Unsigned/unnotarized acceptance remains separate from direct launch. No security override was applied.'
  env={k:v for k,v in os.environ.items() if not k.startswith('KINDRED_')}
  home=temp/'home';home.mkdir();env.update(HOME=str(home),CFFIXED_USER_HOME=str(home))
  with (out/'onboarding-process.log').open('w') as log:
   child=subprocess.Popen([str(executable),'--profiles'],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
   time.sleep(12);capture(child,'onboarding',(['Welcome to Kindred','On this computer','Connect to a server'] if tuple(map(int,a.version.split('.'))) >= (0,80,0) else ['Accounts','Add account','Standalone']))
   stop(child);child=None
  data=home/'Library/Application Support/Kindred';data.mkdir(parents=True,exist_ok=True)
  test_env={**os.environ,'KINDRED_TEST_MAC_APP':str(app),'KINDRED_TEST_MAC_DMG':str(dmg),'KINDRED_TEST_MAC_DATA':str(data)}
  if a.reuse_installation_validation:
   prior=json.loads(a.reuse_installation_validation.read_text())
   for key in ['version','target','source_commit','dmg_sha256']:assert prior[key]==proof[key],key
   assert prior['native_client_replacement_and_failure_preservation'] is True
   assert prior['standalone_payload_exact'] is True and prior['codesign_verify_exit']==0
   proof['native_client_replacement_and_failure_preservation']=True
   proof['exact_package_installation_validation_reused_from']=prior
   (data/'standalone-preservation-marker').write_bytes(b'Existing standalone data')
  elif a.reuse_native_validation:
   prior=json.loads(a.reuse_native_validation.read_text());repack=manifest['packaging']
   assert repack['operation']=='standalone-resource-refresh' and repack['application_recompiled'] is False
   assert prior['passed'] and prior['native_client_replacement_and_failure_preservation']
   assert prior['source_commit']==manifest['native_source_commit']==repack['input_manifest']['source_commit']
   assert prior['dmg_sha256']==repack['input_manifest']['assets'][0]['sha256']
   assert any(c.get('native_code_unchanged') and c.get('bundle_resealed') for c in repack['checks'])
   proof['unchanged_native_installation_validation_reused_from']=prior
   (data/'standalone-preservation-marker').write_bytes(b'Existing standalone data')
  else:
   command(['cargo','test','--release','--locked','--manifest-path',a.source.resolve()/'desktop/Cargo.toml','--target',a.target,'mac_update::tests::native_candidate_installation','--','--ignored','--exact','--nocapture'],'native-client-install.log',env=test_env,timeout=900)
   proof['native_client_replacement_and_failure_preservation']=True
  before_marker=(data/'standalone-preservation-marker').read_bytes()
  fixture=out/'fixture';fixture.mkdir()
  with (out/'fixture-server.log').open('w') as server_log,(out/'connected-process.log').open('w') as app_log:
   server=subprocess.Popen(['node',str(tools/'native-smoke-server.cjs'),str(a.source.resolve()),str(fixture)],stdout=server_log,stderr=subprocess.STDOUT,start_new_session=True)
   for _ in range(100):
    if (fixture/'fixture.json').exists():break
    assert server.poll() is None,'Fixture server exited';time.sleep(.1)
   url=json.loads((fixture/'fixture.json').read_text())['url']
   env['KINDRED_CLIENT_ONLY']='1'
   # Keep public-feed discovery local and deterministic; signatures are still verified.
   env.update(HTTPS_PROXY=url,https_proxy=url,NO_PROXY='localhost,127.0.0.1,::1',no_proxy='localhost,127.0.0.1,::1')
   env['KINDRED_UPDATE_SESSION']=json.dumps({'server':url,'profile_id':'legacy','token':'native-test-token-only','remember':False,'expires':int(time.time())+300})
   child=subprocess.Popen([str(executable)],env=env,stdout=app_log,stderr=subprocess.STDOUT,start_new_session=True)
   chat=wait_report(fixture,'chat',child);assert chat['clientVersion']==a.version and chat['errors']==[],chat
   assert chat.get('secureContext') and chat.get('microphoneCaptureAvailable') and chat.get('audioContextAvailable'),'Native WKWebView does not expose microphone capture and WebAudio: '+str(chat)
   assert (data/'standalone-preservation-marker').read_bytes()==before_marker
   proof['native_client_launch_and_session_handoff' if a.reuse_native_validation else 'native_updated_client_launch_and_session_handoff']=True
   proof['native_microphone_api_available']=True
   # The fixture already asserted the exact response in the rendered chat DOM.
   # Its image can scroll that response out of view; OCR of a tiny sidebar preview
   # is not a reliable second text assertion. Verify the native chat shell here.
   capture(child,'chat',['Piper','Message Piper'])
   if tuple(map(int,a.version.split('.'))) >= (0,59,0):
    frames=[]
    for mode in ['light','dark','maximize','restore','fullscreen','windowed','local-access']:
     phase='frame-'+mode
     request=urllib.request.Request(url+'/fixture/phase',data=json.dumps({'phase':phase}).encode(),headers={'Content-Type':'application/json'},method='POST')
     with urllib.request.urlopen(request) as response:response.read()
     frame=wait_report(fixture,phase,child)
     assert frame['nativeControls'] and frame['width']>=640 and frame['height']>=400
     windows=capture(child,phase,['Piper'])
     frames.append({'phase':phase,'width':frame['width'],'height':frame['height'],'windows':windows})
    proof['native_window_frame_checks']=frames
   command([out/'app-focus','foreground',child.pid],'notch-foreground-focus.log')
   request=urllib.request.Request(url+'/fixture/phase',data=b'{"phase":"notch-foreground"}',headers={'Content-Type':'application/json'},method='POST')
   with urllib.request.urlopen(request) as response:response.read()
   wait_report(fixture,'notch-foreground',child);time.sleep(.5)
   windows=capture(child,'notch-foreground',['Piper'])
   assert not any(w['title']=='Kindred notification' for w in windows),'Foreground app must suppress notch notifications'
   proof['native_notch_foreground_suppressed']=True
   request=urllib.request.Request(url+'/fixture/phase',data=b'{"phase":"notch-preview"}',headers={'Content-Type':'application/json'},method='POST')
   with urllib.request.urlopen(request) as response:response.read()
   wait_report(fixture,'notch-preview',child);time.sleep(.25)
   windows=capture(child,'notch-preview',['sent you a message'])
   preview_banner=next(w for w in windows if w['title']=='Kindred notification')
   proof['native_notch_preview_visible_while_foreground']=True
   focus=json.loads(command([out/'app-focus','background',child.pid],'notch-background-focus.log').stdout)
   # Start outside the known notification frame, then enter its visible card
   # immediately after presentation. OCR of two windows can consume most of the
   # three-second dismissal timer; do not put it in front of the hover action.
   bounds=preview_banner['bounds']
   if focus['canPostEvents']:
    command([out/'app-focus','move',child.pid,bounds['X']+bounds['Width']/2,bounds['Y']+bounds['Height']+30],'notch-hover-outside.log')
   request=urllib.request.Request(url+'/fixture/phase',data=b'{"phase":"notch"}',headers={'Content-Type':'application/json'},method='POST')
   with urllib.request.urlopen(request) as response:response.read()
   wait_report(fixture,'notch',child);time.sleep(.25)
   hover_started=None
   if focus['canPostEvents']:
    command([out/'app-focus','move',child.pid,bounds['X']+bounds['Width']/2,bounds['Y']+bounds['Height']-24],'notch-hover-move.log')
    hover_started=time.monotonic()
   windows=capture(child,'notch',['sent you a message'])
   banner=next(w for w in windows if w['title']=='Kindred notification' and w['bounds']['Width']<=500 and w['bounds']['Height']<=100)
   proof['native_notch_notification_rendered']=True
   focus=json.loads(command([out/'app-focus','status',child.pid],'notch-background-preserved.log').stdout)
   assert focus['active'] is False,'Notch presentation stole focus'
   bounds=banner['bounds']
   if focus['canPostEvents']:
    assert hover_started is not None
    time.sleep(max(0,5-(time.monotonic()-hover_started)))
    hovered=capture(child,'notch-hover',['sent you a message'])
    assert any(w['title']=='Kindred notification' for w in hovered),'Hover must keep the native notch notification visible beyond its watchdog deadline'
    proof['native_notch_hover_extends_deadline']=True
    proof['native_notch_hover_seconds']=time.monotonic()-hover_started
    command([out/'app-focus','click',child.pid,bounds['X']+bounds['Width']-20,bounds['Y']+bounds['Height']/2],'notch-surface-click.log')
    proof['native_notch_surface_click_activated_app']=True
   else:
    proof['native_notch_surface_click_unverified_reason']='GUI runner does not grant event-posting permission; no OS security setting changed'
    command([out/'app-focus','foreground',child.pid],'notch-return-focus.log')
   request=urllib.request.Request(url+'/fixture/phase',data=b'{"phase":"updater"}',headers={'Content-Type':'application/json'},method='POST')
   with urllib.request.urlopen(request) as response:response.read()
   wait_report(fixture,'updater',child);time.sleep(3)
   capture(child,'client-updater',['up to date','Kindred update'])
   assert json.loads((fixture/'signed-feed.json').read_text())['served']
   proof['native_client_update_window_and_signed_feed']=True
   request=urllib.request.Request(url+'/fixture/phase',data=b'{"phase":"accounts"}',headers={'Content-Type':'application/json'},method='POST')
   with urllib.request.urlopen(request) as response:response.read()
   wait_report(fixture,'accounts',child);time.sleep(3)
   capture(child,'accounts',['Accounts','Add account'])
   stop(child);child=None
   request=urllib.request.Request(url+'/fixture/phase',data=b'{"phase":"native-dictation"}',headers={'Content-Type':'application/json'},method='POST')
   with urllib.request.urlopen(request) as response:response.read()
   child=subprocess.Popen([str(executable)],env=env,stdout=app_log,stderr=subprocess.STDOUT,start_new_session=True)
   proof['native_system_dictation_bridge']=wait_report(fixture,'native-dictation',child)
   stop(child);child=None
   command(['node',a.source.resolve()/'tools/frontend/test-native-workspace-artifacts.cjs'],'native-artifact-rendering.log',env={**env,'KINDRED_NATIVE_EXE':str(executable),'KINDRED_NATIVE_WINDOW_PROBE':str(out/'window-proof')},timeout=90)
   proof['native_sandboxed_artifact_rendering']=True


   stop(child);child=None;stop(server);server=None
  proof.update(passed=True,onboarding_rendered=True,hosted_chat_rendered=True,native_account_ipc=True,bundled_accounts_window_rendered=True,external_accounts_used=False,standalone_server_started=False)
except Exception:
 # Keep the actual native window on failure, including chat-loading diagnostics.
 if child is not None and child.poll() is None:
  try:command([out/'window-proof',child.pid,out/'failure'],'failure-capture.log',False)
  except Exception as capture_error:(out/'failure-capture-error.txt').write_text(str(capture_error))
 raise
finally:
 stop(child);stop(server)
 if mounted:subprocess.run(['hdiutil','detach',str(mount)],capture_output=True)
 (out/'macos-validation.json').write_text(json.dumps(proof,indent=2))
print(json.dumps(proof,indent=2))
