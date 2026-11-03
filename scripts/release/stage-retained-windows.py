"""Stage exact retained CI inputs; does not execute an EXE or pass a native gate."""
import argparse
import hashlib
import io
import json
import stat
import subprocess
import zipfile
from pathlib import Path

VERSION = '0.88.6'
SOURCE = '1d28b282d5846b2dbb2a509f728217378cee85f7'
SERVER = '66ff82b98fb2647115c9ea20bc56f63bf9f5f75e'
ARTIFACT = 13253876574
RUN = 41682465830
ARCHIVE = '3eb4d32f38cbc5e7c015540d158959d8f92e11ae6e8074dac8a23274c2ce5248'
ARCHIVE_BYTES = 28466416
EXE = '9a47956a48598df85570445669d0ca05366be1ed72396a96c3c12d3caa40ea46'
EXE_BYTES = 37274624
MEMBER = 'desktop/target/x86_64-pc-windows-msvc/release/kindred-desktop.exe'
RELEASE = 432998252
RELEASE_TAG = 'build-inputs-0.88.6-66ff82b'
ASSET = 706428705
BUNDLE = '3ac3571d4cba5309b38de6f673efb303c39196f12108bedb5b5e82adbbf01fde'
BUNDLE_BYTES = 31640564
RUNTIME = 'ae1328ff46b94ea0f21e8572f42511b6eaf74f28beba3299ce74b6ca5b0aece5'
HELPER = '2a06c326557974f776aedf1ab8faaf4e9f9235f10be4d4e88aabf9cb1f65eefb'


def sha(blob):
    return hashlib.sha256(blob).hexdigest()


def get(path, binary=False):
    argv = ['gh', 'api', 'repos/awpsec/kindred/' + path]
    if binary and path.startswith('releases/assets/'):
        argv += ['-H', 'Accept: application/octet-stream']
    result = subprocess.run(argv, capture_output=True, timeout=90)
    if result.returncode:
        raise RuntimeError('GitHub input request failed')
    return result.stdout if binary else json.loads(result.stdout)


def verify_artifact(meta, blob):
    assert meta['id'] == ARTIFACT and meta['expired'] is False
    assert meta['name'] == f'unverified-kindred-{VERSION}-x86_64-pc-windows-msvc'
    assert meta['workflow_run']['id'] == RUN and meta['workflow_run']['head_sha'] == '655be3631416b463e7740fac0d34a8c7a618f1dc'
    # Original workflow checks out SOURCE explicitly; workflow ref is separately pinned.
    assert meta['workflow_run']['head_branch'] == 'ci/0.88.4-native-packages-20261031'
    assert meta['digest'] == 'sha256:' + ARCHIVE and meta['size_in_bytes'] == len(blob) == ARCHIVE_BYTES
    assert sha(blob) == ARCHIVE
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        assert archive.namelist() == [MEMBER] and archive.testzip() is None
        info = archive.getinfo(MEMBER)
        assert not stat.S_ISLNK(info.external_attr >> 16) and not (info.flag_bits & 1)
        assert info.file_size == EXE_BYTES
        exe = archive.read(MEMBER)
    assert len(exe) == EXE_BYTES and sha(exe) == EXE and exe.startswith(b'MZ')
    return exe


def verify_bundle(meta, blob, exe):
    assert meta['id'] == ASSET and meta['name'] == 'standalone.zip'
    assert meta['digest'] == 'sha256:' + BUNDLE and meta['size'] == len(blob) == BUNDLE_BYTES
    assert sha(blob) == BUNDLE
    # Windows ships standalone.zip as an adjacent resource; it is not an EXE section.
    assert sha(exe) == EXE, 'Retained native executable changed'
    with zipfile.ZipFile(io.BytesIO(blob)) as bundle:
        assert bundle.testzip() is None
        source = json.loads(bundle.read('bundle.json'))
        assert source['version'] == VERSION and source['source_commit'] == SERVER
        assert source['server_sha256'] == RUNTIME and sha(bundle.read('kindred')) == RUNTIME
        assert sha(bundle.read('deploy/provider-connectors.py')) == HELPER
    return source


def owned_destination(root, relative):
    target = root / relative
    for path in [root, *reversed(list(target.parent.parents)), target.parent, target]:
        if path != root and root not in path.parents:
            continue
        if path.exists() or path.is_symlink():
            assert not path.is_symlink(), 'Refuse linked staging path'
            assert path.is_file() if path == target else path.is_dir()
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    root = args.source.resolve()
    assert subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() == SOURCE
    assert not subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain', '--untracked-files=no'], text=True).strip()
    assert json.loads((root / 'desktop/tauri.conf.json').read_text())['version'] == VERSION
    args.output.mkdir(parents=True, exist_ok=True)
    receipt_path = args.output / 'retained-inputs.json'
    assert not receipt_path.exists(), 'Refuse to overwrite prior custody receipt'
    receipt = {'version': VERSION, 'source': SOURCE, 'server_source': SERVER, 'artifact_id': ARTIFACT,
               'origin_run': RUN, 'exe_sha256': EXE, 'bundle_sha256': BUNDLE,
               'runtime_sha256': RUNTIME, 'provider_helper_sha256': HELPER,
               'bundle_release_id': RELEASE, 'bundle_asset_id': ASSET,
               'archive_sha256': ARCHIVE, 'archive_bytes': ARCHIVE_BYTES,
               'exe_bytes': EXE_BYTES, 'bundle_bytes': BUNDLE_BYTES,
               'native_gate_passed': False, 'staged': False}
    stage = 'artifact'
    try:
        artifact = get('actions/artifacts/' + str(ARTIFACT))
        exe = verify_artifact(artifact, get('actions/artifacts/' + str(ARTIFACT) + '/zip', True))
        stage = 'bundle'
        release = get('releases/' + str(RELEASE))
        assert release['id'] == RELEASE and release['draft'] is True and release['tag_name'] == RELEASE_TAG
        assert release['target_commitish'] == SOURCE and any(a['id'] == ASSET for a in release['assets'])
        asset = get('releases/assets/' + str(ASSET))
        bundle = get('releases/assets/' + str(ASSET), True)
        verify_bundle(asset, bundle, exe)
        stage = 'owned_staging'
        destination = owned_destination(root, MEMBER)
        standalone = owned_destination(root, 'desktop/standalone.zip')
        destination.write_bytes(exe)
        standalone.write_bytes(bundle)
        assert sha(destination.read_bytes()) == EXE and sha(standalone.read_bytes()) == BUNDLE
        receipt.update(staged=True, adjacent_resource_bundle_verified=True,
                       final_signed_package_resource_coupling_still_required=True)
    except Exception as error:
        receipt.update(failed_stage=stage, error_type=type(error).__name__)
        raise
    finally:
        with receipt_path.open('x') as output:
            json.dump(receipt, output, indent=2)
        print(json.dumps(receipt))


if __name__ == '__main__':
    main()
