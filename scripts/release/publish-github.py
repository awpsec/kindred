"""Preview a complete desktop release; publish only with explicit owner approval."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import urllib.parse
from github_api import request

spec = importlib.util.spec_from_file_location('release_gate', Path(__file__).with_name('verify-release.py'))
gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory', type=Path, required=True); p.add_argument('--version', required=True)
    p.add_argument('--source-commit', required=True); p.add_argument('--notes', type=Path, required=True)
    p.add_argument('--publish', action='store_true'); p.add_argument('--approval', default='')
    args = p.parse_args()
    proof = gate.verify(args.directory, args.version, args.source_commit)
    from release_notes import render
    notes = render(args.version, args.notes.read_text(encoding='utf8'), 'desktop')
    if not args.publish:
        print(json.dumps({**proof, 'published': False, 'next_step': 'Obtain explicit owner approval for this version.'}, indent=2)); return
    gate.require(args.approval == 'publish v' + args.version, 'Explicit approval for this exact version is required')
    base = 'repos/awpsec/kindred'
    gate.require(request(base)['full_name'] == 'awpsec/kindred', 'Unexpected repository destination')
    gate.require(request(base + '/commits/' + args.source_commit)['sha'] == args.source_commit, 'Build source not present in repository')
    tag = 'v' + args.version
    existing = next((r for r in request(base + '/releases?per_page=100') if r['tag_name'] == tag), None)
    gate.require(existing is None or existing['draft'], 'Published versions are immutable; prepare a new approved version')
    release = existing or request(base + '/releases', 'POST', {'tag_name':tag,'target_commitish':args.source_commit,'name':'Kindred '+args.version,'body':notes,'draft':True})
    gate.require(release['target_commitish'] == args.source_commit, 'Draft source differs from build')
    extra = ['stable.json','client-stable.json','installer-verification.json',*[p.name for p in args.directory.glob('build-*.json')]]
    files = {name:args.directory/name for name in [*proof['assets'], *extra]}
    # Keep the public updater's fixed asset names available on this legacy path.
    for source, friendly in {
        f'kindred-windows-{args.version}.zip': f'Kindred-{args.version}-Windows-Update.zip',
        f'Kindred-{args.version}-aarch64-apple-darwin.dmg': f'Kindred-{args.version}-macOS-Apple-Silicon.dmg',
        f'Kindred-{args.version}-x86_64-unknown-linux-gnu.AppImage': f'Kindred-{args.version}-Linux-x64.AppImage',
    }.items():
        files[friendly] = args.directory/source
    checksums = args.directory / 'SHA256SUMS'
    checksums.write_text(''.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+name+'\n' for name,f in sorted(files.items())))
    files['SHA256SUMS'] = checksums
    uploaded = {a['name']:a for a in release['assets']}
    for name,f in files.items():
        digest = 'sha256:' + hashlib.sha256(f.read_bytes()).hexdigest()
        if name in uploaded:
            gate.require(uploaded[name].get('digest') == digest, 'Draft asset mismatch: ' + name); continue
        asset = request(release['upload_url'].split('{')[0]+'?name='+urllib.parse.quote(name),'POST',f.read_bytes(),'application/octet-stream')
        gate.require(asset.get('digest') == digest and asset['size'] == f.stat().st_size, 'Upload verification failed: ' + name)
    # Recheck complete local inputs before making the draft public.
    gate.verify(args.directory, args.version, args.source_commit)
    current = request(base + '/releases/' + str(release['id']))
    gate.require({a['name'] for a in current['assets']} == set(files), 'Unexpected/missing draft assets')
    result = request(base + '/releases/' + str(release['id']), 'PATCH', {'draft':False,'body':notes,'make_latest':'true'})
    print(json.dumps({'published':not result['draft'],'url':result['html_url'],'version':args.version}))

if __name__ == '__main__': main()
