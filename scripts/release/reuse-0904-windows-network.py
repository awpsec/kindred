"""Reuse exact passing network evidence from the unchanged 0.90.4 Windows build."""
import argparse
import io
import json
import zipfile
from pathlib import Path

from importlib.util import spec_from_file_location, module_from_spec

spec = spec_from_file_location('retained', Path(__file__).with_name('stage-retained-windows.py'))
retained = module_from_spec(spec)
spec.loader.exec_module(retained)
ARTIFACT = 13981700664
DIGEST = 'bc9755f742be05028bc8c3b6a6daf9baffeabce9486569caddb88ca894d2ccfa'
FILES = {'native-reuse-tests.log', 'network-harness.log', 'network-validation.json', 'windows-contract.json'}


def verify(meta, blob):
    assert meta['id'] == ARTIFACT and meta['expired'] is False
    assert meta['name'] == 'native-network-0.90.4-x86_64-pc-windows-msvc'
    assert meta['workflow_run']['id'] == retained.RUN
    assert meta['workflow_run']['head_sha'] == retained.SOURCE
    assert meta['digest'] == 'sha256:' + DIGEST and retained.sha(blob) == DIGEST
    assert meta['size_in_bytes'] == len(blob)
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        assert set(archive.namelist()) == FILES and len(archive.namelist()) == len(FILES)
        assert archive.testzip() is None
        files = {name: archive.read(name) for name in FILES}
    report = json.loads(files['network-validation.json'])
    assert report['source_commit'] == retained.SOURCE
    assert report['target'] == 'x86_64-pc-windows-msvc' and report['exit_code'] == 0
    for key in ['passed', 'actual_native_discovery_passed', 'explicit_compose_generation_passed',
                'actual_compose_merge_passed', 'windows_contract_passed', 'unaffected_reuse_tests_passed']:
        assert report[key] is True, key
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    meta = retained.get('actions/artifacts/' + str(ARTIFACT))
    blob = retained.get('actions/artifacts/' + str(ARTIFACT) + '/zip', True)
    files = verify(meta, blob)
    args.output.mkdir(exist_ok=False)
    for name, data in files.items():
        (args.output / name).write_bytes(data)
    (args.output / 'reuse-provenance.json').write_text(json.dumps({
        'original_run': retained.RUN, 'source_commit': retained.SOURCE,
        'artifact_id': ARTIFACT, 'archive_sha256': DIGEST,
        'new_network_execution': False, 'original_checks_preserved': True,
    }, indent=2) + '\n')


if __name__ == '__main__':
    main()
