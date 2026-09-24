"""Sign the already-verified complete release for server-delivered Mac/Linux updates.

The existing key remains local. This stages files only; no publication/promotion.
"""
import argparse,base64,hashlib,importlib.util,json,shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding,rsa
ROOT=Path(__file__).resolve().parents[2]
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value

def sign(directory,version,source,key_path):
    gate=module('gate',Path(__file__).with_name('verify-release.py'));proof=gate.verify(directory,version,source,require_client_feed=False)
    data=key_path.read_bytes()
    if data.lstrip().startswith(b'<'):
        xml=ET.fromstring(data);n=lambda tag:int.from_bytes(base64.b64decode(xml.findtext(tag),validate=True),'big')
        key=rsa.RSAPrivateNumbers(n('P'),n('Q'),n('D'),n('DP'),n('DQ'),n('InverseQ'),rsa.RSAPublicNumbers(n('Exponent'),n('Modulus'))).private_key()
    else:key=serialization.load_pem_private_key(data,password=None)
    targets={'linux-x86_64':('x86_64-unknown-linux-gnu','AppImage'),'macos-aarch64':('aarch64-apple-darwin','dmg')}
    payload={'version':version,'channel':'stable','source_commit':source,'platforms':{}}
    for target,(build,extension) in targets.items():
        original=directory/f'Kindred-{version}-{build}.{extension}'
        payload['platforms'][target]={'size':original.stat().st_size,'sha256':proof['assets'][original.name]}
        target_path=directory/f'kindred-{target}-{version}.{extension}'
        if target_path.exists():
            if hashlib.sha256(target_path.read_bytes()).hexdigest()!=proof['assets'][original.name]:raise ValueError('Existing package changed')
        else:shutil.copy2(original,target_path)
    feed=directory/'client-stable.json'
    if feed.exists():raise ValueError('Use a fresh candidate; signed manifests are immutable')
    raw=json.dumps(payload,separators=(',',':')).encode();signature=key.sign(raw,padding.PKCS1v15(),hashes.SHA256())
    feed.write_text(json.dumps({'payload':base64.b64encode(raw).decode(),'signature':base64.b64encode(signature).decode()},indent=2)+'\n')
    try:module('client_feed',ROOT/'deploy/client-updates.py').verify(directory)
    except BaseException:feed.unlink();raise
    return {'signed':True,'version':version,'source_commit':source,'platforms':list(targets)}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--directory',type=Path,required=True);p.add_argument('--version',required=True);p.add_argument('--source-commit',required=True);p.add_argument('--private-key',type=Path,required=True);a=p.parse_args();print(json.dumps(sign(a.directory,a.version,a.source_commit,a.private_key),indent=2))
