from pathlib import Path
import json,hashlib,zipfile,subprocess
folder=Path('/build/package')
metadata={'revision':'kindred-whisper-v1','whisper_commit':'371b5a7561823ab2bb32142d2751e35e7534727b','vulkan_headers_commit':'ee2ec5fd83dafce291024683b50dc89219333076','spirv_headers_commit':'04fd3caa1e8267e4d95c806cad901181728e1006','source_files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(Path('/source').iterdir()) if p.suffix in ['.cpp','.txt','.cmake','.py','.sh'] or p.name=='Dockerfile'},'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(folder.iterdir()) if p.is_file() and p.name!='BUILD.json'},'compiler':subprocess.check_output(['x86_64-w64-mingw32-g++-posix','--version'],text=True).splitlines()[0]}
(folder/'BUILD.json').write_text(json.dumps(metadata,indent=2)+'\n')
with zipfile.ZipFile('/build/runtime.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(folder.iterdir()):
  info=zipfile.ZipInfo(p.name,date_time=(2026,9,10,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,p.read_bytes())
print(json.dumps({'runtime_bytes':Path('/build/runtime.zip').stat().st_size,'runtime_sha256':hashlib.sha256(Path('/build/runtime.zip').read_bytes()).hexdigest(),'metadata':metadata}))
