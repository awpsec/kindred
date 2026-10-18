"""Stage exact retained CI inputs; does not execute an EXE or pass a native gate."""
import argparse
import hashlib
import io
import json
import stat
import subprocess
import zipfile
from pathlib import Path

SOURCE = 'f8de9989a64334beb5f04939a635c8df6d9d85b0'
SERVER = '7ee6c9e4ad414c6ecb5abbe2ef8f5b313789f4cb'
ARTIFACT = 12127524815
RUN = 39104319571
ARCHIVE = 'ef04c30e95ba590899c4cc215f2c61660c2e509bcd00c56a65b17ca31b95b4aa'
EXE = '90014aeac2c7af3b6e895fee0b00560f9adca5c3285b4756b91db0478bb3662b'
MEMBER = 'desktop/target/x86_64-pc-windows-msvc/release/kindred-desktop.exe'
ASSET = 652691536
BUNDLE = '071eb7912858e1fe706751954e9d7d0f7828973e6ba2cbf745447d14df2dce36'
RUNTIME = 'd4b785263d23a1d8e19753cc00d632b2c9d026077118a55df308e59e1123510b'
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
    assert meta['name'] == 'unverified-kindred-0.86.17-x86_64-pc-windows-msvc'
    assert meta['workflow_run']['id'] == RUN and meta['workflow_run']['head_sha'] == SOURCE
    assert meta['digest'] == 'sha256:' + ARCHIVE and meta['size_in_bytes'] == len(blob)
    assert sha(blob) == ARCHIVE
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        assert archive.namelist() == [MEMBER] and archive.testzip() is None
        info = archive.getinfo(MEMBER)
        assert not stat.S_ISLNK(info.external_attr >> 16) and not (info.flag_bits & 1)
        exe = archive.read(MEMBER)
    assert len(exe) == 36844544 and sha(exe) == EXE and exe.startswith(b'MZ')
    return exe


def verify_bundle(meta, blob, exe):
    assert meta['id'] == ASSET and meta['name'] == 'standalone.zip'
    assert meta['digest'] == 'sha256:' + BUNDLE and meta['size'] == len(blob) == 27254172
    assert sha(blob) == BUNDLE
    # Windows ships standalone.zip as an adjacent resource; it is not an EXE section.
    assert sha(exe) == EXE, 'Retained native executable changed'
    with zipfile.ZipFile(io.BytesIO(blob)) as bundle:
        assert bundle.testzip() is None
        source = json.loads(bundle.read('bundle.json'))
        assert source['version'] == '0.86.17' and source['source_commit'] == SERVER
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
    assert json.loads((root / 'desktop/tauri.conf.json').read_text())['version'] == '0.86.17'
    args.output.mkdir(parents=True, exist_ok=True)
    receipt_path = args.output / 'retained-inputs.json'
    assert not receipt_path.exists(), 'Refuse to overwrite prior custody receipt'
    receipt = {'source': SOURCE, 'server_source': SERVER, 'artifact_id': ARTIFACT,
               'origin_run': RUN, 'exe_sha256': EXE, 'bundle_sha256': BUNDLE,
               'runtime_sha256': RUNTIME, 'provider_helper_sha256': HELPER,
               'native_gate_passed': False, 'staged': False}
    stage = 'artifact'
    try:
        artifact = get('actions/artifacts/' + str(ARTIFACT))
        exe = verify_artifact(artifact, get('actions/artifacts/' + str(ARTIFACT) + '/zip', True))
        stage = 'bundle'
        release = get('releases/416276019')
        assert release['draft'] is True and release['tag_name'] == 'build-inputs-0.86.17-complete-final'
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
