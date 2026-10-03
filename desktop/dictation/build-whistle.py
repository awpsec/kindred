"""Build-time only: verify upstream engine, compile our private resident adapter.
No Python, compiler or network access is needed for installed inference.
"""
from pathlib import Path
import hashlib, io, json, subprocess, sys, urllib.request, zipfile

def build(package, target):
    source=Path(__file__).resolve().parent
    pins=json.loads((source/'whistle-pins.json').read_text())
    pin=pins['targets'][target]
    package=Path(package);package.mkdir(parents=True,exist_ok=True)
    cache=package.parent/Path(pin['file']).name
    if not cache.exists() or hashlib.sha256(cache.read_bytes()).hexdigest()!=pin['sha256']:
        data=urllib.request.urlopen('https://huggingface.co/Cactus-Compute/needle3/resolve/'+pins['revision']+'/'+pin['file'],timeout=60).read()
        if hashlib.sha256(data).hexdigest()!=pin['sha256']:raise RuntimeError('Whistle runtime checksum mismatch')
        cache.write_bytes(data)
    windows='windows' in target; mac='apple' in target
    extension='.dll' if windows else '.dylib' if mac else '.so'
    with zipfile.ZipFile(cache) as archive:
        data=archive.read('needle/libneedle3'+extension)
    library=package/('libneedle'+extension);library.write_bytes(data)
    worker=package/('whistle-worker.exe' if windows else 'whistle-worker')
    compiler='x86_64-w64-mingw32-g++-posix' if windows else 'c++'
    flags=['-static','-static-libgcc','-static-libstdc++','-municode'] if windows else ['-pthread']
    if mac:flags+=['-arch','arm64' if target.startswith('aarch64') else 'x86_64','-mmacosx-version-min=11.0']
    if not windows and not mac:flags+=['-ldl']
    subprocess.run([compiler,'-std=c++17','-O2',str(source/'whistle-worker.cpp'),'-o',str(worker),*flags],check=True)
    worker.chmod(0o755)
    if mac:
        for file in [library,worker]:subprocess.run(['codesign','--force','--sign','-',str(file)],check=True)
    license=package/'NEEDLE-LICENSE.txt'
    license.write_bytes((source/'needle-LICENSE').read_bytes())
    llvm=package/'LLVM-LICENSE.txt';llvm.write_bytes((source/'LLVM-LICENSE.txt').read_bytes())
    return [worker,library,license,llvm]

if __name__=='__main__':build(sys.argv[1],sys.argv[2])
