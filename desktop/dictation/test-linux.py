"""Exercise a built Linux runtime with a pinned model and public sample WAV.

Usage: python3 test-linux.py runtime.zip ggml-base-q5_1.bin jfk.wav
No provider, microphone recording, or Kindred server is used.
"""
from pathlib import Path
import hashlib
import io
import json
import re
import selectors
import struct
import subprocess
import sys
import tempfile
import time
import wave
import zipfile


def reply(process, timeout=900):
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        if not selector.select(timeout):
            raise AssertionError('Speech worker timed out')
        line = process.stdout.readline(128001)
    assert line.endswith(b'\n') and len(line) <= 128000, 'Invalid protocol reply'
    return json.loads(line)


def send(process, audio):
    process.stdin.write(struct.pack('<I', len(audio)) + audio)
    process.stdin.flush()


def wav_bytes(frames):
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(frames)
    return buffer.getvalue()


def main(archive_path, model_path, sample_path):
    model = Path(model_path).resolve()
    assert hashlib.sha256(model.read_bytes()).hexdigest() == '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898'
    with wave.open(sample_path, 'rb') as sample:
        assert (sample.getnchannels(), sample.getsampwidth(), sample.getframerate()) == (1, 2, 16000)
        frames = sample.readframes(sample.getnframes())
        audio = wav_bytes(frames)
    preview = wav_bytes(frames[:int(1.8 * 16000) * 2])
    # Grow past the model's 30-second window, then shrink back to a preview.
    # This catches stale encoder dimensions and truncation between requests.
    long_audio = wav_bytes((frames + bytes(16000)) * 3)
    silence = wav_bytes(bytes(16000 * 2))
    results = []
    with tempfile.TemporaryDirectory(prefix='kindred-whisper-test-') as folder:
        root = Path(folder)
        with zipfile.ZipFile(archive_path) as archive:
            assert set(archive.namelist()) == {'whisper-cpu', 'whisper-cpu-avx2', 'WHISPER-LICENSE.txt', 'BUILD.json'}
            manifest = json.loads(archive.read('BUILD.json'))
            for name, digest in manifest['files'].items():
                data = archive.read(name)
                assert hashlib.sha256(data).hexdigest() == digest
                (root / name).write_bytes(data)
        flags = set(Path('/proc/cpuinfo').read_text().split())
        for name in ['whisper-cpu-avx2', 'whisper-cpu']:
            if name.endswith('avx2') and not {'avx2', 'fma', 'f16c', 'sse4_2', 'bmi2'} <= flags:
                results.append({'worker': name, 'skipped': 'CPU features unavailable'})
                continue
            binary = root / name
            binary.chmod(0o700)
            print('Testing ' + name, file=sys.stderr, flush=True)
            invalid = subprocess.run([binary, root / 'missing-model'], capture_output=True, timeout=10)
            assert invalid.returncode != 0 and json.loads(invalid.stdout)['type'] == 'error'
            with subprocess.Popen([binary, model], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL) as process:
                try:
                    ready = reply(process, timeout=180)
                    assert ready['type'] == 'ready' and ready['backend'] == 'CPU' and ready['gpu'] is False
                    preview_started = time.monotonic()
                    send(process, preview)
                    first = reply(process)
                    preview_elapsed = time.monotonic() - preview_started
                    assert first['type'] == 'transcript' and 'fellow' in first['text'].lower(), first
                    started = time.monotonic()
                    send(process, audio)
                    text = reply(process)
                    elapsed = time.monotonic() - started
                    assert text['type'] == 'transcript' and 'ask not what your country' in text['text'].lower()
                    send(process, silence)
                    assert reply(process) == {'type': 'transcript', 'text': ''}
                    send(process, long_audio)
                    long_text = reply(process)
                    assert len(re.findall(r'ask(?:ed)?\s+not\s+what your country', long_text['text'].lower())) == 3, long_text
                    assert long_text['text'].lower().count('what you can do for your country') == 3, long_text
                    send(process, preview)
                    assert 'fellow' in reply(process)['text'].lower()
                    assert process.poll() is None, 'Worker must stay resident'
                    send(process, audio)
                    process.terminate()
                    process.wait(timeout=5)
                    results.append({'worker': name, 'ready': ready, 'transcription_seconds': round(elapsed, 3),
                                    'transcript': text['text'], 'preview_seconds': round(preview_elapsed, 3),
                                    'preview': first['text'], 'long_recording_preserved': True,
                                    'resident': True, 'silence': True,
                                    'cancelled': True, 'invalid_model_rejected': True})
                    print(f'{name}: transcription passed in {elapsed:.3f}s', file=sys.stderr, flush=True)
                finally:
                    if process.poll() is None:
                        process.kill()
                        process.wait()
    print(json.dumps({'passed': True, 'results': results}, indent=2))


if __name__ == '__main__':
    main(*sys.argv[1:])
