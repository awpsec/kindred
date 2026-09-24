"""Check the packaged native command worker without launching a GUI or using live data."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--binary', type=Path, required=True)
args = parser.parse_args()
binary = args.binary.resolve()
windows = os.name == 'nt'
children = []

with tempfile.TemporaryDirectory(prefix='kindred worker test ') as folder:
    root = Path(folder)

    def launch(directory):
        child = subprocess.Popen([str(binary), '--kindred-command-worker', str(directory)],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        children.append(child)
        return child

    def start(command, seconds=30):
        directory = root / str(uuid.uuid4())
        directory.mkdir()
        (directory / 'request.json').write_text(json.dumps({
            'command': command, 'path': folder, 'created': int(time.time()), 'max_seconds': seconds,
        }))
        return directory, launch(directory)

    def receipt(directory, name, predicate=lambda value: True):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            try:
                value = json.loads((directory / name).read_text())
                if predicate(value):
                    return value
            except (OSError, ValueError):
                pass
            time.sleep(.1)
        raise AssertionError(f'Missing {name} for {directory.name}')

    try:
        command = ("Add-Content launches launch; Write-Output phase-one; Start-Sleep -Seconds 3; Write-Output phase-two"
                   if windows else 'echo launch >> launches; echo phase-one; sleep 3; echo phase-two')
        directory, child = start(command)
        receipt(directory, 'progress.json', lambda v: 'phase-one' in v['text'])
        launch(directory).wait(timeout=10)
        result = receipt(directory, 'result.json')
        assert result['status'] == 'completed' and result['exit_code'] == 0, result
        assert 'phase-two' in result['text']
        child.wait(timeout=10)
        launch(directory).wait(timeout=10)
        assert (root / 'launches').read_text().splitlines() == ['launch']

        sleep = 'Start-Sleep -Seconds 30' if windows else 'sleep 30'
        directory, child = start(sleep)
        receipt(directory, 'progress.json')
        (directory / 'stop').touch()
        assert receipt(directory, 'result.json')['status'] == 'cancelled'
        child.wait(timeout=10)
        directory, child = start(sleep, 1)
        assert receipt(directory, 'result.json')['status'] == 'timed_out'
        child.wait(timeout=10)

        command = "[Console]::Error.WriteLine('deliberate-failure'); exit 7" if windows else 'echo deliberate-failure >&2; exit 7'
        directory, child = start(command)
        result = receipt(directory, 'result.json')
        assert result['status'] == 'failed' and result['exit_code'] == 7, result
        assert 'deliberate-failure' in result['text']
        child.wait(timeout=10)
        command = "[Console]::Write(('x' * 100000)); Write-Output TAIL" if windows else "head -c 100000 /dev/zero | tr '\\0' x; echo TAIL"
        directory, child = start(command)
        result = receipt(directory, 'result.json')
        assert result['status'] == 'completed' and result['output_truncated'], result
        assert result['text'].rstrip().endswith('TAIL') and len(result['text'].encode()) <= 32768
        child.wait(timeout=10)
        print(json.dumps({'passed': True, 'platform': os.name, 'incremental_output': True,
                          'no_duplicate_execution': True, 'cancel': True, 'deadline': True,
                          'failed_exit': True, 'bounded_output': True}))
    finally:
        for child in children:
            if child.poll() is None:
                child.kill()
            child.wait(timeout=10)
