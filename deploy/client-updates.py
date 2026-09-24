#!/usr/bin/env python3
"""Verify or promote an explicitly approved complete Mac/Linux client update feed.

Keep the compatible Windows stable.json beside it. No builds, server restarts or
profile changes are performed. Package bytes are immutable; the manifest is atomic.
"""
import argparse,base64,hashlib,json,os,re,shutil,tempfile
from pathlib import Path
import xml.etree.ElementTree as ET
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa,padding
TARGETS={'linux-x86_64':'AppImage','macos-aarch64':'dmg'}
MAX_PACKAGE=512*1024*1024

def sha(path):
    with Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def verify(root):
    data=(root/'client-stable.json').read_bytes()
    if len(data)>65536:raise ValueError('Client manifest is too large')
    envelope=json.loads(data);payload=base64.b64decode(envelope['payload'],validate=True)
    xml=ET.parse(Path(__file__).with_name('update-public-key.xml')).getroot()
    number=lambda tag:int.from_bytes(base64.b64decode(xml.findtext(tag),validate=True),'big')
    rsa.RSAPublicNumbers(number('Exponent'),number('Modulus')).public_key().verify(base64.b64decode(envelope['signature'],validate=True),payload,padding.PKCS1v15(),hashes.SHA256())
    release=json.loads(payload);version=release['version']
    if not re.fullmatch(r'\d{1,5}\.\d{1,5}\.\d{1,5}',version) or release['channel']!='stable':raise ValueError('Invalid client release')
    if set(release['platforms'])!=set(TARGETS):raise ValueError('A complete Mac/Linux client package set is required')
    if not re.fullmatch(r'[0-9a-f]{40}',release['source_commit']):raise ValueError('Exact client build source required')
    files={}
    for target,suffix in TARGETS.items():
        info=release['platforms'][target];name=f'kindred-{target}-{version}.{suffix}';p=root/name
        if not p.is_file() or p.is_symlink() or not 0<info['size']<=MAX_PACKAGE or p.stat().st_size!=info['size'] or sha(p)!=info['sha256']:raise ValueError('Client package differs from signed manifest: '+name)
        files[name]=info
    return release,files

def promote(root,destination,approval):
    release,files=verify(root)
    if approval!='promote client updates '+release['version']:raise ValueError('Explicit release promotion approval is required')
    destination.mkdir(parents=True,exist_ok=True)
    if (destination/'client-stable.json').exists():
        previous,_=verify(destination)
        if tuple(map(int,previous['version'].split('.')))>tuple(map(int,release['version'].split('.'))):raise ValueError('Refusing to downgrade the stable client feed')
        if previous['version']==release['version'] and (root/'client-stable.json').read_bytes()!=(destination/'client-stable.json').read_bytes():raise ValueError('An existing release manifest is immutable')
    for name,info in files.items():
        target=destination/name
        if target.exists():
            if target.is_symlink() or sha(target)!=info['sha256']:raise ValueError('Existing packages are immutable: '+name)
            continue
        fd,tmp=tempfile.mkstemp(prefix='.client-stage-',dir=destination)
        try:
            with os.fdopen(fd,'wb') as dst,(root/name).open('rb') as src:
                shutil.copyfileobj(src,dst);dst.flush();os.fsync(dst.fileno())
            os.chmod(tmp,0o644);os.link(tmp,target)
        finally:Path(tmp).unlink(missing_ok=True)
    fd,tmp=tempfile.mkstemp(prefix='.client-feed-',dir=destination)
    try:
        with os.fdopen(fd,'wb') as dst:dst.write((root/'client-stable.json').read_bytes());dst.flush();os.fsync(dst.fileno())
        os.chmod(tmp,0o644);os.replace(tmp,destination/'client-stable.json')
    finally:Path(tmp).unlink(missing_ok=True)
    return {'promoted':True,'version':release['version'],'platforms':list(TARGETS)}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--directory',type=Path,required=True);p.add_argument('--destination',type=Path);p.add_argument('--approval',default='');a=p.parse_args()
    if a.destination:print(json.dumps(promote(a.directory,a.destination,a.approval),indent=2))
    else:
        release,files=verify(a.directory);print(json.dumps({'verified':True,'version':release['version'],'files':list(files)},indent=2))
