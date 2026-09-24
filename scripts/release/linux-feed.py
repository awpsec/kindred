"""Sign, verify, or atomically promote the Linux-only feed; never changes Mac/Windows feeds."""
import argparse, base64, hashlib, importlib.util, json, os, re, shutil, tempfile
from pathlib import Path
import xml.etree.ElementTree as ET
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def public_key(path):
    xml=ET.parse(path).getroot()
    n=lambda tag:int.from_bytes(base64.b64decode(xml.findtext(tag),validate=True),'big')
    return rsa.RSAPublicNumbers(n('Exponent'),n('Modulus')).public_key()
def verify(root, public):
    raw=(root/'client-linux.json').read_bytes();assert len(raw)<=65536
    envelope=json.loads(raw);payload=base64.b64decode(envelope['payload'],validate=True)
    public_key(public).verify(base64.b64decode(envelope['signature'],validate=True),payload,padding.PKCS1v15(),hashes.SHA256())
    data=json.loads(payload);assert re.fullmatch(r'\d{1,5}\.\d{1,5}\.\d{1,5}',data['version'])
    assert data['channel']=='stable' and data['release_scope']=='linux-server-prerelease'
    assert re.fullmatch(r'[0-9a-f]{40}',data['source_commit'])
    assert set(data['platforms'])=={'linux-x86_64'}
    name=f"kindred-linux-x86_64-{data['version']}.AppImage";p=root/name;info=data['platforms']['linux-x86_64']
    assert p.is_file() and not p.is_symlink() and 0<info['size']<=512*1024*1024
    assert p.stat().st_size==info['size'] and digest(p)==info['sha256']
    return data,name

def sign(candidate,keypath,public):
    state=json.loads((candidate/'STATE.json').read_text())
    spec=importlib.util.spec_from_file_location('gate',Path(__file__).with_name('verify-linux-release.py'));gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
    proof=gate.verify(candidate,state['version'],state['desktop_build_commit'],state['server_build_commit'])
    folder=candidate/'complete';version=state['version'];original=folder/f'Kindred-{version}-x86_64-unknown-linux-gnu.AppImage'
    name=f'kindred-linux-x86_64-{version}.AppImage';target=folder/name
    if target.exists():assert digest(target)==digest(original)
    else:shutil.copy2(original,target)
    data=keypath.read_bytes()
    if data.lstrip().startswith(b'<'):
        xml=ET.fromstring(data);n=lambda tag:int.from_bytes(base64.b64decode(xml.findtext(tag),validate=True),'big')
        key=rsa.RSAPrivateNumbers(n('P'),n('Q'),n('D'),n('DP'),n('DQ'),n('InverseQ'),rsa.RSAPublicNumbers(n('Exponent'),n('Modulus'))).private_key()
    else:key=serialization.load_pem_private_key(data,password=None)
    payload={'version':version,'channel':'stable','release_scope':'linux-server-prerelease','source_commit':state['desktop_build_commit'],'platforms':{'linux-x86_64':{'size':target.stat().st_size,'sha256':proof['assets'][original.name]}}}
    raw=json.dumps(payload,separators=(',',':')).encode()
    feed=folder/'client-linux.json';assert not feed.exists(),'Signed releases are immutable'
    feed.write_text(json.dumps({'payload':base64.b64encode(raw).decode(),'signature':base64.b64encode(key.sign(raw,padding.PKCS1v15(),hashes.SHA256())).decode()},indent=2)+'\n')
    verify(folder,public);return proof

def promote(root,dest,public):
    data,name=verify(root,public);dest.mkdir(parents=True,exist_ok=True)
    retained={p:digest(dest/p) for p in ('stable.json','client-stable.json') if (dest/p).exists()}
    if (dest/'client-linux.json').exists():
        previous,_=verify(dest,public)
        assert tuple(map(int,previous['version'].split('.'))) <= tuple(map(int,data['version'].split('.')))
        if previous['version']==data['version']:assert (dest/'client-linux.json').read_bytes()==(root/'client-linux.json').read_bytes()
    target=dest/name
    if target.exists():assert not target.is_symlink() and digest(target)==digest(root/name)
    else:
        fd,tmp=tempfile.mkstemp(prefix='.linux-package-',dir=dest)
        try:
            with os.fdopen(fd,'wb') as f,(root/name).open('rb') as src:shutil.copyfileobj(src,f);f.flush();os.fsync(f.fileno())
            os.chmod(tmp,0o644);os.link(tmp,target)
        finally:Path(tmp).unlink(missing_ok=True)
    fd,tmp=tempfile.mkstemp(prefix='.linux-feed-',dir=dest)
    try:
        with os.fdopen(fd,'wb') as f:f.write((root/'client-linux.json').read_bytes());f.flush();os.fsync(f.fileno())
        os.chmod(tmp,0o644);os.replace(tmp,dest/'client-linux.json')
    finally:Path(tmp).unlink(missing_ok=True)
    verify(dest,public);assert all(digest(dest/p)==h for p,h in retained.items())
    return {'promoted':True,'version':data['version'],'preserved_feeds':retained}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--directory',type=Path,required=True);p.add_argument('--public-key',type=Path,required=True);p.add_argument('--private-key',type=Path);p.add_argument('--destination',type=Path)
    a=p.parse_args()
    if a.private_key:result=sign(a.directory,a.private_key,a.public_key)
    elif a.destination:result=promote(a.directory,a.destination,a.public_key)
    else:result=verify(a.directory,a.public_key)[0]
    print(json.dumps(result,indent=2))
