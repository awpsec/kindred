"""Build the pinned resident worker for the macOS app's target architecture.

Runs at app build time. End users need neither Xcode nor a Python environment.
"""
from pathlib import Path
import hashlib, json, os, shutil, subprocess, sys, zipfile

source = Path(__file__).resolve().parent
out = Path(sys.argv[1]).resolve() / 'dictation'
target = sys.argv[2]
arch = {'aarch64-apple-darwin': 'arm64', 'x86_64-apple-darwin': 'x86_64'}[target]
commit = '371b5a7561823ab2bb32142d2751e35e7534727b'
out.mkdir(parents=True, exist_ok=True)
whisper = out / 'whisper'
def run(*args):
    subprocess.run([str(a) for a in args], check=True)
if not whisper.exists():
    run('git', 'init', whisper)
    run('git', '-C', whisper, 'remote', 'add', 'origin', 'https://github.com/ggml-org/whisper.cpp.git')
run('git', '-C', whisper, 'fetch', '--depth=1', 'origin', commit)
run('git', '-C', whisper, 'checkout', '--detach', commit)
actual = subprocess.check_output(['git', '-C', str(whisper), 'rev-parse', 'HEAD'], text=True).strip()
assert actual == commit
package = out / 'package'
package.mkdir(exist_ok=True)
for backend in ['cpu', 'metal']:
    build = out / backend
    run('cmake', '-S', source, '-B', build, '-DCMAKE_BUILD_TYPE=Release',
        '-DWHISPER_SOURCE='+str(whisper), '-DCMAKE_OSX_ARCHITECTURES='+arch,
        '-DCMAKE_OSX_DEPLOYMENT_TARGET=11.0', '-DGGML_VULKAN=OFF',
        '-DGGML_METAL='+('ON' if backend == 'metal' else 'OFF'),
        '-DGGML_METAL_EMBED_LIBRARY=ON', '-DGGML_CCACHE=OFF')
    run('cmake', '--build', build, '--target', 'kindred-whisper', '--config', 'Release', '-j', '2')
    dest = package / ('whisper-'+backend)
    shutil.copy2(build / 'kindred-whisper', dest)
    run('codesign', '--force', '--sign', '-', dest)
shutil.copy2(whisper / 'LICENSE', package / 'WHISPER-LICENSE.txt')
metadata = {'whisper_commit': commit, 'target': target,
            'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in package.iterdir() if p.name != 'BUILD.json'}}
(package / 'BUILD.json').write_text(json.dumps(metadata, indent=2), encoding='utf8')
with zipfile.ZipFile(out / 'runtime.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for p in sorted(package.iterdir()): archive.write(p, p.name)
