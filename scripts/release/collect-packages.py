"""Collect verified native packages; never publishes or starts CI."""
import argparse
import hashlib
import json
import os
import tempfile
import shutil
import subprocess
from pathlib import Path

ROOT = Path(os.environ.get('KINDRED_PACKAGE_SOURCE_ROOT', str(Path(__file__).resolve().parents[2]))).resolve()
TARGETS = {
    'x86_64-unknown-linux-gnu': ('deb', 'appimage'),
    'x86_64-pc-windows-msvc': ('native',),
    'aarch64-apple-darwin': ('dmg',),
}

def version():
    return json.loads((ROOT / 'desktop/tauri.conf.json').read_text())['version']

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def inspect(p, kind, target):
    with p.open('rb') as f:
        head = f.read(64)
        f.seek(max(0, p.stat().st_size - 512)); trailer = f.read(4)
    if kind == 'deb':
        assert head.startswith(b'!<arch>\n'), 'Invalid DEB'
        assert subprocess.check_output(['dpkg-deb', '-f', str(p), 'Version'], text=True).strip() == version()
        assert subprocess.check_output(['dpkg-deb', '-f', str(p), 'Architecture'], text=True).strip() == 'amd64'
    elif kind == 'appimage':
        assert head[:4] == b'\x7fELF' and head[8:11] == b'AI\x02', 'Invalid AppImage'
        assert int.from_bytes(head[18:20], 'little') == 62, 'Expected x86_64 AppImage'
    elif kind == 'dmg':
        assert trailer == b'koly', 'Invalid DMG trailer'
        subprocess.run(['hdiutil', 'verify', str(p)], check=True)
        # Tauri removes the staging .app after making a DMG; verify the shipped image.
        import plistlib
        with tempfile.TemporaryDirectory(prefix='kindred-dmg-check-') as temp:
            mount = Path(temp) / 'volume'; mount.mkdir()
            subprocess.run(['hdiutil','attach','-readonly','-nobrowse','-mountpoint',str(mount),str(p)],check=True)
            try:
                apps = list(mount.glob('*.app')); assert len(apps) == 1, 'DMG must contain one app'
                info = plistlib.loads((apps[0] / 'Contents/Info.plist').read_bytes())
                assert info['CFBundleShortVersionString'] == version()
                executable = apps[0] / 'Contents/MacOS' / info['CFBundleExecutable']
                arches = subprocess.check_output(['lipo', '-archs', str(executable)], text=True).strip().split()
                assert ('arm64' if target.startswith('aarch64') else 'x86_64') in arches
                subprocess.run(['codesign','--verify','--deep','--strict','--verbose=2',str(apps[0])],check=True)
            finally:
                subprocess.run(['hdiutil','detach',str(mount)],check=True)

    else:
        assert head[:2] == b'MZ', 'Invalid Windows client'
        binary = p.read_bytes().lower()
        assert b'vcruntime140.dll\x00' not in binary and b'vcruntime140_1.dll\x00' not in binary, 'Windows client requires an unbundled VC runtime; build with crt-static'

def verify_set(folder):
    rows = [json.loads(p.read_text()) for p in folder.glob('build-*.json')]
    assert {r['target'] for r in rows} == set(TARGETS) and len(rows) == len(TARGETS), 'Missing platform build'
    assert len({r['source_commit'] for r in rows}) == 1, 'Mixed source revisions'
    for row in rows:
        assert row['version'] == version(), 'Mixed versions'
        assert {a['kind'] for a in row['assets']} == set(TARGETS[row['target']])
        for a in row['assets']:
            assert Path(a['name']).name == a['name']
            p = folder / a['name']
            assert p.stat().st_size == a['bytes'] and digest(p) == a['sha256'], 'Asset changed'
    print(json.dumps({'complete_build_set': True, 'version': version(), 'platforms': len(TARGETS), 'published': False}))

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--check-version'); p.add_argument('--target', choices=TARGETS)
    p.add_argument('--output', type=Path); p.add_argument('--verify-build-set', type=Path)
    args = p.parse_args()
    if args.check_version:
        assert args.check_version == version(), 'Requested version differs from checkout'
        print(version()); return
    if args.verify_build_set:
        verify_set(args.verify_build_set); return
    assert args.target and args.output
    args.output.mkdir(parents=True, exist_ok=True)
    base = ROOT / 'desktop/target' / args.target / 'release'
    assets = []
    for kind in TARGETS[args.target]:
        candidates = [base / 'kindred-desktop.exe'] if kind == 'native' else list((base / 'bundle' / kind).glob('*.AppImage' if kind == 'appimage' else '*.' + kind))
        assert len(candidates) == 1 and candidates[0].is_file(), f'Missing/ambiguous {kind}: {candidates}'
        source = candidates[0]; inspect(source, kind, args.target)
        suffix = {'native': 'exe', 'appimage': 'AppImage'}.get(kind, kind)
        name = f'Kindred-{version()}-{args.target}.{suffix}'
        dest = args.output / name; shutil.copy2(source, dest)
        assets.append({'name': name, 'kind': kind, 'bytes': dest.stat().st_size, 'sha256': digest(dest)})
    sha = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
    manifest = {'version': version(), 'source_commit': sha, 'target': args.target, 'assets': assets}
    if args.target.endswith('apple-darwin'): manifest['macos_bundle_signature_verified'] = True
    (args.output / ('build-' + args.target + '.json')).write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest))

if __name__ == '__main__':
    main()
