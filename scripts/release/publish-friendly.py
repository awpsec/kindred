"""Stage clear download names and publish complete, owner-approved releases.

Preserves all package bytes and immutable existing releases. Metadata and build
evidence live in one verification archive instead of cluttering the downloads.
"""
import argparse,hashlib,importlib.util,json,shutil,subprocess,urllib.parse,zipfile
from pathlib import Path
from github_api import request

spec=importlib.util.spec_from_file_location('gate',Path(__file__).with_name('verify-release.py'))
gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sha_bytes=lambda b:hashlib.sha256(b).hexdigest()

def prepare(candidate,output,version,source):
 proof=gate.verify(candidate/'complete',version,source)
 release_notes=(candidate/'RELEASE-NOTES.md').read_text(encoding='utf-8')
 assert release_notes.startswith('# Kindred '+version+'\n'),'Use release notes for this exact candidate'
 server=json.loads((candidate/'server/SOURCE.json').read_text())
 # The chat is served by the server, even inside the native client.
 # Refuse matched version numbers backed by different shared UI sources.
 import runpy
 workspace=Path(__file__).resolve().parents[3]
 ui_gate=runpy.run_path(str(Path(__file__).with_name('verify-shared-ui.py')))
 desktop_source=workspace/'kindred'
 if not (desktop_source/'.git').exists():desktop_source=workspace/'kindred-desktop'
 ui_proof=ui_gate['verify'](desktop_source,workspace/'kindred-server',source,server['source_commit'])
 bundle=candidate/'server'/f'kindred-standalone-{version}.zip'
 assert server['version']==version and sha(bundle)==server['standalone_sha256']
 with zipfile.ZipFile(bundle) as z:assert z.testzip() is None
 desktop=output/'desktop';server_dir=output/'server'
 desktop.mkdir(parents=True,exist_ok=True);server_dir.mkdir(parents=True,exist_ok=True)
 names={
  f'Kindred-{version}-Setup.exe':f'Kindred-{version}-Windows-Setup.exe',
  f'kindred-windows-{version}.zip':f'Kindred-{version}-Windows-Update.zip',
  f'Kindred-{version}-aarch64-apple-darwin.dmg':f'Kindred-{version}-macOS-Apple-Silicon.dmg',
  f'Kindred-{version}-x86_64-unknown-linux-gnu.AppImage':f'Kindred-{version}-Linux-x64.AppImage',
  f'Kindred-{version}-x86_64-unknown-linux-gnu.deb':f'Kindred-{version}-Linux-x64.deb',
 }
 for old,new in names.items():
  assert old in proof['assets'];shutil.copy2(candidate/'complete'/old,desktop/new)
  assert sha(desktop/new)==proof['assets'][old]
 # Public updater discovery: upload signed envelopes as first-class release assets.
 for manifest in ('stable.json','client-stable.json'):
  shutil.copy2(candidate/'complete'/manifest,desktop/manifest)
 shutil.copy2(candidate/'installation/linux-setup.sh',desktop/f'Kindred-{version}-Linux-Setup.sh')
 shutil.copy2(candidate/'installation/linux-update.py',desktop/f'Kindred-{version}-Linux-Update.py')
 # Hosted downloads use pullable images; the desktop's embedded bundle keeps
 # its local build workflow. Both contain the same verified server binary.
 hosted=server_dir/f'Kindred-{version}-Server-Bundle.zip'
 server_repo=workspace/'kindred-server'
 def server_file(name):return subprocess.check_output(['git','-C',str(server_repo),'show',server['source_commit']+':'+name])
 with zipfile.ZipFile(bundle) as original,zipfile.ZipFile(hosted,'w',zipfile.ZIP_DEFLATED) as target:
  for info in original.infolist():
   data=original.read(info.filename)
   if info.filename=='compose.yaml':data=server_file('compose.yaml')
   target.writestr(info,data)
  target.writestr('compose.build.yaml',server_file('compose.build.yaml'))
  target.writestr('README.md','# Kindred Server\n\nRun `docker compose up -d`. To update, back up your data, then run `docker compose pull && docker compose up -d`. Keep the same project name and data volume; never use `down -v` to update. Set KINDRED_VERSION in .env to pin a release. For a local build from the included binary, use `docker compose -f compose.yaml -f compose.build.yaml up -d --build`.\n')
 server['hosted_bundle_sha256']=sha(hosted)
 with zipfile.ZipFile(hosted) as z:
  assert z.testzip() is None and sha_bytes(z.read('kindred'))==server['server_sha256']

 root=Path(__file__).resolve().parents[2]
 verification=desktop/f'Kindred-{version}-Verification.zip'
 with zipfile.ZipFile(verification,'w',zipfile.ZIP_DEFLATED) as z:
  z.writestr('download-names.json',json.dumps(names,indent=2))
  z.writestr('complete-platform-gate.json',json.dumps(proof,indent=2))
  z.writestr('shared-ui-source-parity.json',json.dumps(ui_proof,indent=2))
  hosted={f'kindred-windows-{version}.zip':names[f'kindred-windows-{version}.zip']}
  if (candidate/'complete/client-stable.json').exists():
   hosted.update({f'kindred-linux-x86_64-{version}.AppImage':names[f'Kindred-{version}-x86_64-unknown-linux-gnu.AppImage'],f'kindred-macos-aarch64-{version}.dmg':names[f'Kindred-{version}-aarch64-apple-darwin.dmg']})
  z.writestr('hosted-update-names.json',json.dumps(hosted,indent=2))
  z.writestr('README.txt','Package filenames changed for clarity; bytes and signatures are unchanged. hosted-update-names.json maps server /updates filenames to release downloads. Stage these packages with package-manifests/stable.json and, when present, package-manifests/client-stable.json. Use deploy/client-updates.py to verify and atomically promote the Mac/Linux feed only after approval; keep the Windows feed beside it. Publishing does not deploy a server or feed.\n')
  # Public evidence is explicitly curated. Keep operational logs, screenshots,
  # host inventory and deployment receipts out of downloadable verification.
  acceptance=candidate/'verification/public-acceptance.json'
  assert acceptance.exists(), 'Provide a reviewed public acceptance summary'
  z.write(acceptance,'verification/acceptance.json')
  z.writestr('server/SOURCE.json',json.dumps(server,indent=2))
  for p in sorted((candidate/'installation').iterdir()):
   if p.is_file() and p.suffix in ('.sh','.py'):z.write(p,'installation/'+p.name)
  for p in sorted((candidate/'complete').glob('*.json')):z.write(p,'package-manifests/'+p.name)
  for name in ['LICENSE','THIRD_PARTY_NOTICES.md']:z.write(root/name,name)
 with zipfile.ZipFile(verification) as z:assert z.testzip() is None
 shutil.copy2(verification,server_dir/verification.name)
 plans=[]
 base_url=f'https://github.com/awpsec/kindred/releases/download/v{version}/'
 from release_notes import render
 body=render(version,release_notes,'desktop')
 for repo,folder,commit,notes in [('kindred',desktop,source,body),('kindred-server',server_dir,server['source_commit'],render(version,release_notes,'server'))]:
  files={p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(folder.iterdir()) if p.is_file() and p.name!='SHA256SUMS.txt'}
  checksums=folder/'SHA256SUMS.txt';checksums.write_text(''.join(v['sha256']+'  '+n+'\n' for n,v in files.items()),newline='\n')
  files[checksums.name]={'sha256':sha(checksums),'bytes':checksums.stat().st_size}
  (output/(repo+'-notes.md')).write_text(notes,encoding='utf-8')
  plans.append({'repo':repo,'directory':str(folder.resolve()),'commit':commit,'files':files,'notes':str((output/(repo+'-notes.md')).resolve())})
 result={'version':version,'source':source,'candidate':str(candidate.resolve()),'gate':proof,'releases':plans}
 (output/'publication-plan.json').write_text(json.dumps(result,indent=2));return result

def publish(plan,output):
 releases=[]
 # Validate both destinations before creating drafts; no build is dispatched.
 for entry in plan['releases']:
  base='repos/awpsec/'+entry['repo']
  assert request(base)['full_name']=='awpsec/'+entry['repo']
  assert request(base+'/commits/'+entry['commit'])['sha']==entry['commit']
  existing=next((r for r in request(base+'/releases?per_page=100') if r['tag_name']=='v'+plan['version']),None)
  assert existing is None or existing['draft'],'Published assets are immutable'
  releases.append((entry,base,existing))
 drafts=[]
 for entry,base,existing in releases:
  notes=Path(entry['notes']).read_text(encoding='utf-8')
  release=existing or request(base+'/releases','POST',{'tag_name':'v'+plan['version'],'target_commitish':entry['commit'],'name':'Kindred '+plan['version'],'body':notes,'draft':True})
  assert release['target_commitish']==entry['commit']
  uploaded={a['name']:a for a in release['assets']}
  assert set(uploaded)<=set(entry['files'])
  for name,expected in entry['files'].items():
   path=Path(entry['directory'])/name;assert sha(path)==expected['sha256'] and path.stat().st_size==expected['bytes']
   asset=uploaded.get(name)
   if asset is None:
    print('Uploading '+entry['repo']+'/'+name,flush=True)
    asset=request(release['upload_url'].split('{')[0]+'?name='+urllib.parse.quote(name),'POST',path.read_bytes(),'application/octet-stream')
   assert asset['digest']=='sha256:'+expected['sha256'] and asset['size']==expected['bytes']
  drafts.append((entry,base,release))
 gate.verify(Path(plan['candidate'])/'complete',plan['version'],plan['source'])
 for entry,base,release in drafts:
  current=request(base+'/releases/'+str(release['id']))
  assert {a['name'] for a in current['assets']}==set(entry['files'])
  for asset in current['assets']:
   expected=entry['files'][asset['name']]
   assert asset['digest']=='sha256:'+expected['sha256'] and asset['size']==expected['bytes']
 results=[]
 for entry,base,release in drafts:
  result=request(base+'/releases/'+str(release['id']),'PATCH',{'draft':False,'body':Path(entry['notes']).read_text(encoding='utf-8'),'make_latest':'true'})
  assert not result['draft'];latest=request(base+'/releases/latest');assert latest['id']==result['id']
  assert request(base+'/git/ref/tags/v'+plan['version'])['object']['sha']==entry['commit']
  results.append({'repo':entry['repo'],'url':result['html_url'],'assets':[a['name'] for a in latest['assets']],'published':True})
  (output/'publication-result.json').write_text(json.dumps(results,indent=2))
 print(json.dumps(results,indent=2))

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--candidate',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
 p.add_argument('--version',required=True);p.add_argument('--source-commit',required=True)
 p.add_argument('--publish',action='store_true');p.add_argument('--approval',default='');a=p.parse_args()
 if a.publish:
  assert a.approval=='publish v'+a.version,'Exact owner approval required'
  plan=json.loads((a.output/'publication-plan.json').read_text())
  assert plan['version']==a.version and plan['source']==a.source_commit and plan['candidate']==str(a.candidate.resolve())
  publish(plan,a.output)
 else:
  plan=prepare(a.candidate,a.output,a.version,a.source_commit)
  print(json.dumps({r['repo']:list(r['files']) for r in plan['releases']},indent=2))
