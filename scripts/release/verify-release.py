"""Fail closed unless a release contains every required desktop package.

This command is read-only. Passing it does not authorize publication.
"""
import argparse
import base64
import hashlib
import json
import re
import zipfile
from pathlib import Path

REQUIRED = {
    'x86_64-unknown-linux-gnu': {'deb', 'appimage'},
    'x86_64-pc-windows-msvc': {'native'},
    'aarch64-apple-darwin': {'dmg'},
}

def require(ok, message):
    if not ok:
        raise ValueError(message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def verify(folder, version, source, require_client_feed=True):
    require(re.fullmatch(r'\d+\.\d+\.\d+', version), 'Invalid release version')
    require(re.fullmatch(r'[0-9a-f]{40}', source), 'Exact build source commit required')
    assets = {}
    for target, kinds in REQUIRED.items():
        manifest = folder / f'build-{target}.json'
        require(manifest.is_file(), f'Missing platform manifest: {target}')
        row = json.loads(manifest.read_text())
        require(row.get('version') == version and row.get('source_commit') == source and row.get('target') == target, f'Mixed version/source: {target}')
        if row.get('packaging', {}).get('operation') == 'unaffected-target-reuse':
            import runpy
            runpy.run_path(str(Path(__file__).with_name('reuse-unaffected-native.py')))['verify'](row, source)
        if 'packaging' in row and row['packaging'].get('operation') == 'standalone-resource-refresh':
            repack = row['packaging']; original = repack['input_manifest']
            require(repack.get('application_recompiled') is False and repack['source_commit'] == source, 'Invalid resource-refresh provenance')
            require(original['source_commit'] == row.get('native_source_commit') and re.fullmatch(r'[0-9a-f]{40}', original['source_commit']), 'Original native source is missing')
            require(original['version'] == version and original['target'] == target, 'Original native package version/target differs')
            require(repack['standalone_sha256'] == sha((Path(__file__).resolve().parents[2]/'desktop/standalone.zip').read_bytes()), 'Refreshed standalone resource differs from source')
            require({c['kind'] for c in repack['checks']} == kinds, 'Resource-refresh checks are incomplete')
            for check in repack['checks']:
                require(check.get('native_bytes_unchanged') or check.get('other_files_unchanged') or (check.get('native_code_unchanged') and check.get('other_resources_unchanged') and check.get('bundle_resealed')), 'Native files changed during resource refresh')
            if target == 'x86_64-pc-windows-msvc':
                require(row['assets'] == original['assets'], 'Reused Windows executable changed')
        if target.endswith('apple-darwin'): require(row.get('macos_bundle_signature_verified') is True, f'Mac bundle signature was not verified: {target}')
        require(len(row['assets']) == len(kinds) and {a['kind'] for a in row['assets']} == kinds, f'Incomplete packages: {target}')
        for entry in row['assets']:
            name = entry['name']
            require(Path(name).name == name and '/' not in name and '\\' not in name, 'Unsafe package name')
            path = folder / name
            require(path.is_file() and not path.is_symlink(), f'Missing package: {name}')
            data = path.read_bytes()
            require(len(data) == entry['bytes'] and sha(data) == entry['sha256'], f'Package changed: {name}')
            kind = entry['kind']
            if kind == 'dmg': require(len(data) > 512 and data[-512:-508] == b'koly', 'Invalid DMG')
            elif kind == 'deb': require(data.startswith(b'!<arch>\n'), 'Invalid DEB')
            elif kind == 'appimage': require(data[:4] == b'\x7fELF' and data[8:11] == b'AI\x02', 'Invalid AppImage')
            else:
                require(data[:2] == b'MZ', 'Invalid Windows client')
                require(b'vcruntime140.dll\x00' not in data.lower() and b'vcruntime140_1.dll\x00' not in data.lower(), 'Unbundled Windows C runtime dependency')
            assets[name] = entry['sha256']
    setup = folder / f'Kindred-{version}-Setup.exe'
    require(setup.is_file() and setup.read_bytes()[:2] == b'MZ', 'Missing compatible Windows installer')
    archive = folder / f'kindred-windows-{version}.zip'
    require(archive.is_file(), 'Missing signed Windows ZIP')
    envelope = json.loads((folder / 'stable.json').read_text())
    payload_bytes = base64.b64decode(envelope['payload'], validate=True)
    payload = json.loads(payload_bytes)
    require(payload['version'] == version and payload['platform'] == 'windows-x86_64', 'Incorrect update feed version/platform')
    require(payload['size'] == archive.stat().st_size and payload['sha256'] == sha(archive.read_bytes()), 'Update feed does not match ZIP')
    from cryptography.hazmat.primitives.asymmetric import rsa, padding
    from cryptography.hazmat.primitives import hashes
    import xml.etree.ElementTree as ET
    key = ET.parse(Path(__file__).resolve().parents[2] / 'desktop/update-public-key.xml').getroot()
    n = lambda tag: int.from_bytes(base64.b64decode(key.findtext(tag)), 'big')
    rsa.RSAPublicNumbers(n('Exponent'), n('Modulus')).public_key().verify(base64.b64decode(envelope['signature'], validate=True), payload_bytes, padding.PKCS1v15(), hashes.SHA256())
    native = next(a for a in assets if a.endswith('x86_64-pc-windows-msvc.exe'))
    with zipfile.ZipFile(archive) as z:
        require(z.testzip() is None, 'Corrupt Windows ZIP')
        require(json.loads(z.read('release.json'))['version'] == version, 'Mixed Windows ZIP version')
        require(sha(z.read('Kindred.exe')) == assets[native], 'Windows installer pipeline must use the verified native build')
    installer_proof = json.loads((folder / 'installer-verification.json').read_text())
    require(installer_proof.get('passed') is True and installer_proof.get('version') == version and installer_proof.get('installerSha256') == sha(setup.read_bytes()) and installer_proof.get('exactSignedPayload') is True and installer_proof.get('packageSha256') == payload['sha256'], 'Missing installer validation for these exact bytes')
    assets[setup.name] = sha(setup.read_bytes()); assets[archive.name] = payload['sha256']
    if require_client_feed and (tuple(map(int,version.split('.')))>(0,51,0) or (folder/'client-stable.json').exists()):
        import runpy
        client=runpy.run_path(str(Path(__file__).resolve().parents[2]/'deploy/client-updates.py'))
        release,files=client['verify'](folder)
        require(release['version']==version and release['source_commit']==source,'Client feed source/version differs from this release')
        mapping={'linux-x86_64':'x86_64-unknown-linux-gnu','macos-aarch64':'aarch64-apple-darwin'}
        for target,build in mapping.items():
            suffix=client['TARGETS'][target]
            require(release['platforms'][target]['sha256']==assets[f'Kindred-{version}-{build}.{suffix}'],'Client feed must use the verified native package')
        for name,info in files.items():assets[name]=info['sha256']
    return {'ready': True, 'version': version, 'source_commit': source, 'assets': assets, 'publication_authorized': False}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory', type=Path, required=True); p.add_argument('--version', required=True); p.add_argument('--source-commit', required=True)
    a = p.parse_args()
    try: print(json.dumps(verify(a.directory, a.version, a.source_commit), indent=2))
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as error: raise SystemExit('Release blocked: ' + str(error))

if __name__ == '__main__': main()
