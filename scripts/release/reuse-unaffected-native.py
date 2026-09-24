"""Reuse unchanged Windows/Linux packages after a macOS-only notification fix.

Verifies the complete Git tree difference, including identical bundled resources.
Original package manifests and build commits remain in the release provenance.
"""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def source_check(original, source):
    def git(*args):
        return subprocess.check_output(['git', '-C', str(ROOT), *args])
    subprocess.run(['git', '-C', str(ROOT), 'merge-base', '--is-ancestor', original, source], check=True)
    changed = git('diff', '--name-only', original, source).decode().splitlines()
    for name in changed:
        if name.startswith('scripts/release/') or name.startswith('tools/frontend/test-') or name == 'tools/frontend/fixtures/desktop.cjs':
            continue
        if name != 'desktop/src/notch.rs':
            raise ValueError('Unverified application change prevents package reuse: ' + name)
        sections = []
        for commit in [original, source]:
            text = git('show', commit + ':' + name).decode()
            prefix, native = text.split('#[cfg(target_os = "macos")]\npub mod native {', 1)
            _, suffix = native.split('\n#[cfg(test)]\nmod tests {', 1)
            sections.append((prefix, suffix))
        if sections[0] != sections[1]:
            raise ValueError('Non-macOS notification code changed')
    return changed

def verify(row, source):
    reuse = row['packaging']
    original = reuse['input_manifest']
    if row['target'] not in ['x86_64-pc-windows-msvc', 'x86_64-unknown-linux-gnu']:
        raise ValueError('macOS package must be rebuilt')
    if any(row[k] != original[k] for k in ['version', 'target', 'assets']):
        raise ValueError('Reused package bytes/version/target changed')
    if row['native_source_commit'] != original['source_commit'] or row['source_commit'] != source:
        raise ValueError('Invalid original build provenance')
    if reuse['changed_files'] != source_check(original['source_commit'], source):
        raise ValueError('Source difference does not match reuse proof')

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory', type=Path, required=True)
    p.add_argument('--source-commit', required=True)
    a = p.parse_args()
    for target in ['x86_64-pc-windows-msvc', 'x86_64-unknown-linux-gnu']:
        path = a.directory / ('build-' + target + '.json')
        original = json.loads(path.read_text())
        assert 'packaging' not in original, 'Do not wrap provenance twice'
        row = {**original, 'source_commit': a.source_commit, 'native_source_commit': original['source_commit'],
               'packaging': {'operation': 'unaffected-target-reuse', 'application_recompiled': False,
                             'input_manifest': original, 'changed_files': source_check(original['source_commit'], a.source_commit)}}
        verify(row, a.source_commit)
        path.write_text(json.dumps(row, indent=2) + '\n')
        print('Preserved exact package bytes and original build provenance:', target)

if __name__ == '__main__':
    main()
