"""Wrap an existing signed Windows release in the compatible per-user NSIS installer.

Windows preparation verifies Microsoft's WebView2 bootstrapper signature. The
prepared directory may then be compiled with NSIS on Windows or Linux. No signing
private key, GitHub credential, application account, or server configuration is used.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--release-dir',type=Path,required=True)
p.add_argument('--bootstrapper',type=Path,required=True,help='Microsoft-signed Evergreen WebView2 bootstrapper')
p.add_argument('--stage',type=Path,required=True,help='New empty preparation directory')
p.add_argument('--makensis',help='Compile after preparation using this NSIS executable')
p.add_argument('--output',type=Path,help='Copy the compiled setup here; requires --makensis')
a=p.parse_args()
root=Path(__file__).resolve().parents[1]
if os.name!='nt':raise SystemExit('Prepare on Windows to verify the Microsoft Authenticode signature; compile the prepared directory on either OS.')
if a.stage.exists():raise SystemExit('Choose a new stage directory; existing prepared packages are not overwritten.')
envelope=json.loads((a.release_dir/'stable.json').read_text(encoding='utf-8-sig'))
payload=base64.b64decode(envelope['payload'],validate=True)
xml=ET.parse(root/'desktop/update-public-key.xml').getroot()
number=lambda tag:int.from_bytes(base64.b64decode(xml.findtext(tag),validate=True),'big')
rsa.RSAPublicNumbers(number('Exponent'),number('Modulus')).public_key().verify(base64.b64decode(envelope['signature'],validate=True),payload,padding.PKCS1v15(),hashes.SHA256())
release=json.loads(payload);version=release['version']
assert re.fullmatch(r'\d+\.\d+\.\d+',version) and release['platform']=='windows-x86_64' and release['channel']=='stable'
archive=a.release_dir/f'kindred-windows-{version}.zip';data=archive.read_bytes()
assert len(data)==release['size'] and hashlib.sha256(data).hexdigest()==release['sha256']
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None and json.loads(z.read('release.json'))['version']==version
 assert z.read('Kindred.exe')[:2]==b'MZ'
 assert z.read('update-public-key.xml')==(root/'desktop/update-public-key.xml').read_bytes()
bootstrapper=a.bootstrapper.resolve();quoted="'"+str(bootstrapper).replace("'","''")+"'"
command="$s=Get-AuthenticodeSignature -LiteralPath "+quoted+"; if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch '(^|, )O=Microsoft Corporation(,|$)'){throw 'WebView2 bootstrapper is not validly signed by Microsoft'}; @{status=[string]$s.Status;publisher=$s.SignerCertificate.Subject;thumbprint=$s.SignerCertificate.Thumbprint}|ConvertTo-Json -Compress"
env={k:v for k,v in os.environ.items() if k.upper()!='PSMODULEPATH'}
signature=json.loads(subprocess.check_output(['powershell.exe','-NoProfile','-Command',command],text=True,env=env,creationflags=subprocess.CREATE_NO_WINDOW))
a.stage.mkdir(parents=True)
for source,name in [(archive,'package.zip'),(a.release_dir/'stable.json','stable.json'),(root/'desktop/update-public-key.xml','update-public-key.xml'),(bootstrapper,'MicrosoftEdgeWebview2Setup.exe'),(root/'desktop/icons/icon.ico','icon.ico'),(root/'desktop/installer/banner.bmp','banner.bmp'),(root/'desktop/installer/Install-Package.ps1','Install-Package.ps1')]:shutil.copy2(source,a.stage/name)
(a.stage/'Kindred.nsi').write_text('!define VERSION "'+version+'"\n'+(root/'desktop/installer/Kindred.nsi').read_text(encoding='utf8'),encoding='utf8',newline='\n')
metadata={'version':version,'package_sha256':release['sha256'],'package_signature_verified':True,'bootstrapper':{'sha256':hashlib.sha256(bootstrapper.read_bytes()).hexdigest(),'bytes':bootstrapper.stat().st_size,'signature':signature},'files':{n:hashlib.sha256((a.stage/n).read_bytes()).hexdigest() for n in ['Kindred.nsi','Install-Package.ps1','package.zip','stable.json','update-public-key.xml','MicrosoftEdgeWebview2Setup.exe','icon.ico','banner.bmp']}}
(a.stage/'BUILD.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf8')
if a.makensis:
 subprocess.run([a.makensis,'Kindred.nsi'],cwd=a.stage,check=True)
 exe=a.stage/f'Kindred-{version}-Setup.exe';assert exe.read_bytes()[:2]==b'MZ'
 if a.output:
  if a.output.exists():raise SystemExit('Output already exists. Do not replace a published installer.')
  a.output.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(exe,a.output)
print(json.dumps({'version':version,'stage':str(a.stage.resolve()),'package_signature_verified':True,'bootstrapper_signature_verified':True,'compiled':bool(a.makensis)}))
