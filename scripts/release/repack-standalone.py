"""Refresh an external standalone resource while retaining verified native builds.

No compilation or publication. Mac resealing/DMG creation must run on a Mac.
Original build provenance is retained alongside the packaging source revision.
"""
import argparse, hashlib, json, os, platform, plistlib, shutil, subprocess, tempfile, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(args, **kwargs):
    return subprocess.run(list(map(str, args)), check=True, timeout=180, **kwargs)
def output(args):
    return subprocess.check_output(list(map(str, args)), text=True).strip()
def inventory(root):
    return {str(p.relative_to(root)): ('link', os.readlink(p)) if p.is_symlink() else ('file', sha(p), p.stat().st_mode & 0o777)
            for p in root.rglob('*') if p.is_symlink() or p.is_file()}
def refresh(root, resource):
    before = inventory(root)
    matches = [p for p in root.rglob('standalone.zip') if p.is_file() and not p.is_symlink()]
    assert len(matches) == 1, 'Expected exactly one external standalone resource'
    name = str(matches[0].relative_to(root))
    shutil.copyfile(resource, matches[0])
    after = inventory(root)
    assert set(before) == set(after)
    assert all(before[n] == after[n] for n in before if n != name), 'Native files changed'
    return name, before, after

def repack(source_dir, destination, target):
    current = output(['git', '-C', ROOT, 'rev-parse', 'HEAD'])
    assert not output(['git', '-C', ROOT, 'status', '--porcelain', '--untracked-files=no']), 'Commit packaging tools first'
    original = json.loads((source_dir / f'build-{target}.json').read_text())
    native_source = original['source_commit']
    # All native code, dependencies, dictation and bundled Accounts UI must match.
    # app.js/updates.js are served by the connected server, which is refreshed here.
    changed = set(output(['git', '-C', ROOT, 'diff', '--name-only', native_source, current, '--', 'desktop', 'ui']).splitlines())
    assert changed <= {'desktop/standalone.zip', 'ui/app.js', 'ui/updates.js'}, changed
    version = json.loads((ROOT / 'desktop/tauri.conf.json').read_text())['version']
    assert original['version'] == version and original['target'] == target
    resource = ROOT / 'desktop/standalone.zip'
    with zipfile.ZipFile(resource) as z:
        assert z.testzip() is None
        server = json.loads(z.read('bundle.json'))
        assert server['version'] == version and hashlib.sha256(z.read('kindred')).hexdigest() == server['server_sha256']
    destination.mkdir(parents=True, exist_ok=True)
    assets = []; proofs = []
    for entry in original['assets']:
        assert Path(entry['name']).name == entry['name']
        source = (source_dir / entry['name']).resolve(); dest = destination / entry['name']
        assert source.stat().st_size == entry['bytes'] and sha(source) == entry['sha256']
        assert not dest.exists(), 'Use a fresh output directory'
        with tempfile.TemporaryDirectory(prefix='kindred-resource-refresh-') as temp:
            temp = Path(temp); tree = temp / 'tree'
            if entry['kind'] == 'native':
                shutil.copy2(source, dest); proofs.append({'kind':'native','native_bytes_unchanged':True})
            elif entry['kind'] == 'appimage':
                source.chmod(source.stat().st_mode | 0o111)
                offset = int(output([source, '--appimage-offset']))
                run([source, '--appimage-extract'], cwd=temp, stdout=subprocess.DEVNULL)
                tree = temp / 'squashfs-root'; name, _, expected = refresh(tree, resource)
                squash = temp / 'filesystem'
                run(['mksquashfs', tree, squash, '-noappend', '-comp', 'gzip', '-processors', '2', '-no-progress'], stdout=subprocess.DEVNULL)
                with source.open('rb') as src, dest.open('wb') as dst:
                    dst.write(src.read(offset))
                    with squash.open('rb') as data: shutil.copyfileobj(data, dst)
                dest.chmod(0o755)
                checked = temp / 'checked'
                run(['unsquashfs', '-no-progress', '-o', str(offset), '-d', checked, dest], stdout=subprocess.DEVNULL)
                assert inventory(checked) == expected, 'Repacked AppImage content differs'
                proofs.append({'kind':'appimage','resource':name,'other_files_unchanged':True,'runtime_prefix_unchanged':True})
            elif entry['kind'] == 'deb':
                run(['dpkg-deb', '-R', source, tree]); name, _, expected = refresh(tree, resource)
                sums = tree / 'DEBIAN/md5sums'
                if sums.exists():
                    sums.write_text(''.join(hashlib.md5(p.read_bytes()).hexdigest()+'  '+str(p.relative_to(tree))+'\n'
                        for p in sorted(tree.rglob('*')) if p.is_file() and not p.is_symlink() and 'DEBIAN' not in p.relative_to(tree).parts))
                expected = inventory(tree)
                run(['dpkg-deb', '--root-owner-group', '-Zxz', '--build', tree, dest])
                checked = temp / 'checked'; run(['dpkg-deb', '-R', dest, checked])
                assert inventory(checked) == expected
                proofs.append({'kind':'deb','resource':name,'other_files_unchanged':True})
            elif entry['kind'] == 'dmg':
                assert platform.system() == 'Darwin' and platform.machine() == 'arm64'
                mount = temp / 'mount'; mount.mkdir(); tree.mkdir()
                run(['hdiutil', 'verify', source])
                run(['hdiutil','attach','-readonly','-nobrowse','-mountpoint',mount,source])
                try:
                    apps = list(mount.glob('*.app')); assert len(apps) == 1
                    run(['ditto', apps[0], tree / apps[0].name])
                finally: run(['hdiutil','detach',mount])
                app = next(tree.glob('*.app'))
                run(['codesign','--verify','--deep','--strict',app])
                info = plistlib.loads((app/'Contents/Info.plist').read_bytes()); assert info['CFBundleShortVersionString'] == version
                exe = app/'Contents/MacOS'/info['CFBundleExecutable']
                assert output(['lipo','-archs',exe]) == 'arm64'
                unsigned_before = temp/'native-before'; shutil.copy2(exe,unsigned_before)
                run(['codesign','--remove-signature',unsigned_before])
                name, before, _ = refresh(app, resource)
                run(['codesign','--force','--sign','-','--preserve-metadata','--timestamp=none',app])
                run(['codesign','--verify','--deep','--strict',app])
                unsigned_after = temp/'native-after'; shutil.copy2(exe,unsigned_after)
                run(['codesign','--remove-signature',unsigned_after]); assert sha(unsigned_before) == sha(unsigned_after), 'Native code changed'
                after = inventory(app)
                for n, value in before.items():
                    if n != name and '_CodeSignature/' not in n and n != str(exe.relative_to(app)):
                        assert after[n] == value, n
                (tree/'Applications').symlink_to('/Applications')
                run(['hdiutil','create','-volname','Kindred','-srcfolder',tree,'-fs','HFS+','-format','UDZO',dest])
                run(['hdiutil','verify',dest])
                proofs.append({'kind':'dmg','resource':name,'native_code_unchanged':True,'other_resources_unchanged':True,'bundle_resealed':True})
            else: raise ValueError('Unsupported package type')
        assets.append({**entry,'bytes':dest.stat().st_size,'sha256':sha(dest)})
    result = {**original,'source_commit':current,'native_source_commit':native_source,'assets':assets,
        'packaging':{'operation':'standalone-resource-refresh','application_recompiled':False,'source_commit':current,
        'input_manifest':original,'standalone_sha256':sha(resource),'server_source_commit':server['source_commit'],'checks':proofs}}
    (destination/f'build-{target}.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))

if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--target',required=True)
    a=p.parse_args();repack(a.input,a.output,a.target)
