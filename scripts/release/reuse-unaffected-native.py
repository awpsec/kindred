"""Reuse unaffected native packages after a narrowly verified platform-only fix.

Verifies the complete Git tree difference, including identical bundled resources.
Original package manifests and build commits remain in the release provenance.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

WINDOWS_NETWORK = 'desktop/src/network_interfaces.rs'
WINDOWS_HELPERS = {
    'scripts/release/reuse-unaffected-native.py',
    'scripts/release/test_native_reuse.py',
    'scripts/release/test-windows-network-contract.py',
    'scripts/release/test-native-network.py',
}
WINDOWS_SCRIPT_PREFIX = ('#[cfg(windows)]\n'
    'pub fn discover_with_diagnostics(\n'
    '    _root: &std::path::Path,\n'
    ') -> Result<Vec<Interface>, DiscoveryFailure> {\n'
    '    let start = std::time::Instant::now();\n'
    '    let script = ')


def windows_script_only(before, after):
    # Match exactly one ordinary Rust string token; a quote/brace injection,
    # cfg widening, raw string, shared edit or Unix edit cannot be stripped away.
    pattern = re.compile(re.escape(WINDOWS_SCRIPT_PREFIX) + r'("(?:[^"\\\r\n]|\\[^\r\n])*");\n')
    spans = []
    for text in (before, after):
        matches = list(pattern.finditer(text))
        if len(matches) != 1:
            raise ValueError('Windows network discovery script boundary changed')
        match = matches[0]
        # Only the short Rust escapes used by this ordinary script token are
        # accepted; invalid escapes can break parsing even on non-Windows.
        if any(escape not in {'\\', '"', "'", 'n', 'r', 't', '0'}
               for escape in re.findall(r'\\(.)', match.group(1))):
            raise ValueError('Unverified Rust string escape in Windows script')
        spans.append(text[:match.start(1)] + text[match.end(1):])
    if spans[0] != spans[1]:
        raise ValueError('Non-Windows-script network code changed')


def windows_source_check(original, source):
    if not all(re.fullmatch(r'[0-9a-f]{40}', value) for value in (original, source)):
        raise ValueError('Exact reuse source commits required')
    def git(*args):
        return subprocess.check_output(['git', '-C', str(ROOT), *args])
    subprocess.run(['git', '-C', str(ROOT), 'merge-base', '--is-ancestor', original, source], check=True)
    records = git('diff', '--raw', '--no-renames', '-z', original, source).split(b'\0')
    if records[-1] != b'' or len(records) % 2 != 1:
        raise ValueError('Unexpected Git change inventory')
    changed = []
    for index in range(0, len(records) - 1, 2):
        header, name = records[index].decode(), records[index + 1].decode()
        fields = header.split()
        if len(fields) != 5 or not fields[0].startswith(':'):
            raise ValueError('Unexpected Git change metadata')
        before_mode, after_mode, status = fields[0][1:], fields[1], fields[4]
        if name not in WINDOWS_HELPERS and name != WINDOWS_NETWORK:
            raise ValueError('Unverified application change prevents Windows-only package reuse: ' + name)
        # Reject mode/type changes, symlinks, deletion and rename ambiguity.
        if after_mode != '100644' or (status == 'M' and before_mode != after_mode) or status not in ('A', 'M'):
            raise ValueError('Unverified reuse file mode/type: ' + name)
        if status == 'A' and (before_mode != '000000' or name == WINDOWS_NETWORK):
            raise ValueError('Unverified reuse addition: ' + name)
        if name == WINDOWS_NETWORK:
            before, after = [git('show', commit + ':' + name).decode() for commit in (original, source)]
            windows_script_only(before, after)
        changed.append(name)
    return changed


def source_check(original, source, changed_platform='macos'):
    if changed_platform == 'windows':
        return windows_source_check(original, source)
    if changed_platform != 'macos':
        raise ValueError('Unknown changed platform')
    def git(*args):
        return subprocess.check_output(['git', '-C', str(ROOT), *args])
    subprocess.run(['git', '-C', str(ROOT), 'merge-base', '--is-ancestor', original, source], check=True)
    changed = git('diff', '--name-only', original, source).decode().splitlines()
    for name in changed:
        if name.startswith('scripts/release/') or name.startswith('tools/frontend/test-') or name == 'tools/frontend/fixtures/desktop.cjs':
            continue
        if name in ('branding/generate.py', 'branding/test_assets.py', 'branding/requirements.txt', 'docs/BRANDING.md',
                    'mobile/ios/KindredCompanionTests/BrandIdentityTests.swift',
                    'desktop/icons/macos-runtime.png'):
            # Generator/tests/docs are not linked into desktop packages. This
            # separate runtime image is selected only by the macOS config.
            continue
        if name == 'desktop/tauri.macos.conf.json':
            before, after = [json.loads(git('show', commit + ':' + name)) for commit in [original, source]]
            old_icons = before['bundle'].pop('icon')
            new_icons = after['bundle'].pop('icon')
            if before != after or old_icons != ['icons/macos.icns', 'icons/macos.png'] or new_icons != ['icons/macos.icns', 'icons/macos-runtime.png']:
                raise ValueError('Unverified macOS configuration change')
            continue
        if name == 'desktop/src/updater.rs':
            before, after = [git('show', commit + ':' + name).decode() for commit in [original, source]]
            start = after.index('// Cocoa must create and present the updater')
            end_marker = '#[cfg(not(target_os = "macos"))]\n'
            end = after.index(end_marker, start) + len(end_marker)
            block = after[start:end]
            if '#[cfg(target_os = "macos")]\npub fn show' not in block or after[:start] + after[end:] != before:
                raise ValueError('Non-macOS updater code changed')
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
    platform = reuse.get('changed_platform', 'macos')
    targets = {'macos': ['x86_64-pc-windows-msvc', 'x86_64-unknown-linux-gnu'],
               'windows': ['aarch64-apple-darwin', 'x86_64-unknown-linux-gnu']}
    if platform not in targets or row['target'] not in targets[platform]:
        raise ValueError('Changed platform package must be rebuilt')
    if any(row[k] != original[k] for k in ['version', 'target', 'assets']):
        raise ValueError('Reused package bytes/version/target changed')
    if row['native_source_commit'] != original['source_commit'] or row['source_commit'] != source:
        raise ValueError('Invalid original build provenance')
    if reuse['changed_files'] != source_check(original['source_commit'], source, platform):
        raise ValueError('Source difference does not match reuse proof')

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory', type=Path, required=True)
    p.add_argument('--source-commit', required=True)
    p.add_argument('--changed-platform', choices=['macos', 'windows'], default='macos')
    a = p.parse_args()
    targets = (['aarch64-apple-darwin', 'x86_64-unknown-linux-gnu'] if a.changed_platform == 'windows'
               else ['x86_64-pc-windows-msvc', 'x86_64-unknown-linux-gnu'])
    for target in targets:
        path = a.directory / ('build-' + target + '.json')
        original = json.loads(path.read_text())
        assert 'packaging' not in original, 'Do not wrap provenance twice'
        row = {**original, 'source_commit': a.source_commit, 'native_source_commit': original['source_commit'],
               'packaging': {'operation': 'unaffected-target-reuse', 'application_recompiled': False,
                             'input_manifest': original, 'changed_platform': a.changed_platform,
                             'changed_files': source_check(original['source_commit'], a.source_commit, a.changed_platform)}}
        verify(row, a.source_commit)
        path.write_text(json.dumps(row, indent=2) + '\n')
        print('Preserved exact package bytes and original build provenance:', target)

if __name__ == '__main__':
    main()
