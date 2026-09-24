"""Bundle portable and AVX2 CPU workers for the Linux x86_64 desktop.

Only the app build needs Git, CMake and a compiler. End users download models
explicitly; no compiler, Python installation, GPU driver or Docker is required.
"""
from pathlib import Path
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import zipfile

COMMIT = '371b5a7561823ab2bb32142d2751e35e7534727b'


def run(*args):
    subprocess.run([str(a) for a in args], check=True)


def build(output, target):
    if target != 'x86_64-unknown-linux-gnu' or platform.system() != 'Linux' or platform.machine() != 'x86_64':
        raise SystemExit('Build Linux dictation natively for x86_64-unknown-linux-gnu.')
    jobs = int(os.environ.get('KINDRED_DICTATION_BUILD_JOBS', '1'))
    if not 1 <= jobs <= 8:
        raise SystemExit('KINDRED_DICTATION_BUILD_JOBS must be between 1 and 8.')
    source = Path(__file__).resolve().parent
    out = Path(output).resolve() / 'dictation'
    out.mkdir(parents=True, exist_ok=True)
    whisper = out / 'whisper'
    if not whisper.exists():
        run('git', 'init', whisper)
        run('git', '-C', whisper, 'remote', 'add', 'origin', 'https://github.com/ggml-org/whisper.cpp.git')
    present = subprocess.run(['git', '-C', str(whisper), 'cat-file', '-e', COMMIT + '^{commit}'],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    if not present:
        run('git', '-C', whisper, 'fetch', '--depth=1', 'origin', COMMIT)
    run('git', '-C', whisper, 'checkout', '--detach', COMMIT)
    actual = subprocess.check_output(['git', '-C', str(whisper), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != COMMIT:
        raise SystemExit('Unexpected Whisper source revision.')
    package = out / 'package'
    package.mkdir(exist_ok=True)
    members = []
    for variant in ['cpu', 'cpu-avx2']:
        directory = out / variant
        optimized = 'ON' if variant == 'cpu-avx2' else 'OFF'
        run('cmake', '-S', source, '-B', directory, '-DCMAKE_BUILD_TYPE=Release',
            '-DWHISPER_SOURCE=' + str(whisper), '-DKINDRED_CPU_AVX2=' + optimized,
            '-DGGML_SSE42=' + optimized, '-DGGML_BMI2=' + optimized,
            '-DGGML_VULKAN=OFF', '-DGGML_METAL=OFF', '-DGGML_CUDA=OFF',
            '-DGGML_BLAS=OFF', '-DGGML_CCACHE=OFF')
        run('cmake', '--build', directory, '--target', 'kindred-whisper', '--parallel', jobs)
        destination = package / ('whisper-' + variant)
        shutil.copy2(directory / 'kindred-whisper', destination)
        # Catch accidental cross-target packaging before embedding the archive.
        header = destination.read_bytes()[:20]
        if header[:6] != b'\x7fELF\x02\x01' or header[18:20] != b'\x3e\x00':
            raise SystemExit('Expected a Linux x86_64 ELF speech worker.')
        destination.chmod(0o755)
        members.append(destination)
    license_file = package / 'WHISPER-LICENSE.txt'
    shutil.copy2(whisper / 'LICENSE', license_file)
    members.append(license_file)
    metadata = {
        'revision': 'kindred-whisper-linux-v1', 'whisper_commit': COMMIT, 'target': target,
        'backends': ['CPU'], 'cpu_variants': ['x86_64', 'avx2+fma+f16c+sse4.2+bmi2'],
        'source_files': {name: hashlib.sha256((source / name).read_bytes()).hexdigest()
                         for name in ['worker.cpp', 'CMakeLists.txt', 'build-linux.py']},
        'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in members},
    }
    manifest = package / 'BUILD.json'
    manifest.write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf8')
    members.append(manifest)
    temporary = out / 'runtime.zip.partial'
    with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
        for p in sorted(members):
            info = zipfile.ZipInfo(p.name, date_time=(2026, 9, 14, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (p.stat().st_mode & 0xFFFF) << 16
            archive.writestr(info, p.read_bytes())
    temporary.replace(out / 'runtime.zip')
    return out / 'runtime.zip'


if __name__ == '__main__':
    print(build(sys.argv[1], sys.argv[2]))
