"""Recover a manifest for an unchanged DMG preserved by a failed validation job."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

def prepare(directory, report, output, version, source, run):
    prior = json.loads(report.read_text())
    assert prior['version'] == version and prior['source_commit'] == source
    assert prior['target'] == 'aarch64-apple-darwin'
    # A failure before the installation check still leaves valid package bytes.
    # The validation workflow must run that missing check instead of reusing it.
    assert prior['codesign_verify_exit'] == 0 and prior['standalone_payload_exact'] is True
    images = list(directory.rglob('*.dmg'))
    assert len(images) == 1, 'Expected one preserved Apple Silicon DMG'
    image = images[0]
    digest = hashlib.sha256(image.read_bytes()).hexdigest()
    assert digest == prior['dmg_sha256'], 'Preserved DMG differs from its native validation receipt'
    output.mkdir(parents=True, exist_ok=False)
    name = f'Kindred-{version}-aarch64-apple-darwin.dmg'
    shutil.copy2(image, output / name)
    manifest = {'version': version, 'source_commit': source, 'target': 'aarch64-apple-darwin',
                'assets': [{'name': name, 'kind': 'dmg', 'bytes': image.stat().st_size, 'sha256': digest}],
                'macos_bundle_signature_verified': True,
                'preserved_package': {'build_run_id': run, 'application_recompiled': False,
                                      'package_bytes_unchanged': True, 'validation_receipt': prior}}
    (output / 'build-aarch64-apple-darwin.json').write_text(json.dumps(manifest, indent=2)+'\n')

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for name in ['directory', 'report', 'output']:p.add_argument('--'+name, type=Path, required=True)
    for name in ['version', 'source']:p.add_argument('--'+name, required=True)
    p.add_argument('--run', type=int, required=True)
    a = p.parse_args()
    prepare(a.directory, a.report, a.output, a.version, a.source, a.run)
