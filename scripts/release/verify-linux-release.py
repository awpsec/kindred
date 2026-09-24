"""Explicit Linux/server prerelease gate; leaves the complete-release gate unchanged."""
import argparse, hashlib, json, re, subprocess, zipfile
from pathlib import Path

def verify(root, version, desktop, server):
    assert re.fullmatch(r'\d+\.\d+\.\d+', version)
    assert all(re.fullmatch(r'[0-9a-f]{40}', s) for s in (desktop, server))
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    build = json.loads((root/'complete/build-x86_64-unknown-linux-gnu.json').read_text())
    assert (build['version'], build['source_commit'], build['target']) == (version, desktop, 'x86_64-unknown-linux-gnu')
    assert len(build['assets']) == 2 and {a['kind'] for a in build['assets']} == {'deb','appimage'}
    assets = {}
    for item in build['assets']:
        assert Path(item['name']).name == item['name']
        p = root/'complete'/item['name']; assert p.is_file() and not p.is_symlink()
        assert p.stat().st_size == item['bytes'] and sha(p) == item['sha256']
        with p.open('rb') as f: header = f.read(12)
        assert header.startswith(b'!<arch>\n') if item['kind']=='deb' else header[:4]==b'\x7fELF' and header[8:11]==b'AI\x02'
        assets[p.name] = item['sha256']
        proof = json.loads((root/'verification'/f"linux-{item['kind']}-payload.json").read_text())
        assert proof['passed'] and proof['version']==version and proof['source_commit']==server
    meta = json.loads((root/'server/SOURCE.json').read_text())
    assert (meta['version'],meta['source_commit']) == (version,server)
    archive = root/'server'/f'kindred-standalone-{version}.zip'
    assert sha(archive)==meta['standalone_sha256']
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None and hashlib.sha256(z.read('kindred')).hexdigest()==meta['server_sha256']
        assert json.loads(z.read('bundle.json'))['source_commit']==server
    assets[archive.name]=sha(archive)
    for name in ('server-smoke.json','browser-checks.json','linux-package-checks.json'):
        assert json.loads((root/'verification'/name).read_text())['passed'], name
    native=json.loads((root/'verification/linux-package-checks.json').read_text())
    assert native['appimage_sha256']==next(a['sha256'] for a in build['assets'] if a['kind']=='appimage')
    assert json.loads((root/'verification/server-tests.json').read_text())['passed']
    repo=Path(__file__).resolve().parents[2]
    subprocess.run(['python3',str(repo/'scripts/release/verify-shared-ui.py'),'--desktop',str(repo),'--server',str(repo.parent/'kindred-server'),'--desktop-source',desktop,'--server-source',server],check=True,stdout=subprocess.DEVNULL)
    return {'ready':True,'scope':'linux-server-prerelease','prerelease':True,'version':version,'source_commit':desktop,'server_source_commit':server,'assets':assets,'publication_authorized':False}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--candidate',type=Path,required=True);p.add_argument('--version',required=True)
    p.add_argument('--desktop-source',required=True);p.add_argument('--server-source',required=True)
    a=p.parse_args();print(json.dumps(verify(a.candidate,a.version,a.desktop_source,a.server_source),indent=2))
