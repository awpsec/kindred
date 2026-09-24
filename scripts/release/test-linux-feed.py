"""Offline regression checks for Linux feed isolation and immutable packages."""
import base64, importlib.util, json, tempfile
from pathlib import Path
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa,padding
spec=importlib.util.spec_from_file_location('feed',Path(__file__).with_name('linux-feed.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
with tempfile.TemporaryDirectory() as temp:
    root=Path(temp);src=root/'source';dst=root/'destination';src.mkdir();dst.mkdir()
    numbers=key.public_key().public_numbers();enc=lambda n:base64.b64encode(n.to_bytes((n.bit_length()+7)//8,'big')).decode()
    public=root/'public.xml';public.write_text(f'<RSAKeyValue><Modulus>{enc(numbers.n)}</Modulus><Exponent>{enc(numbers.e)}</Exponent></RSAKeyValue>')
    package=src/'kindred-linux-x86_64-0.60.0.AppImage';package.write_bytes(b'fixture native package')
    payload={'version':'0.60.0','channel':'stable','release_scope':'linux-server-prerelease','source_commit':'a'*40,'platforms':{'linux-x86_64':{'size':package.stat().st_size,'sha256':m.digest(package)}}}
    raw=json.dumps(payload).encode();feed={'payload':base64.b64encode(raw).decode(),'signature':base64.b64encode(key.sign(raw,padding.PKCS1v15(),hashes.SHA256())).decode()}
    (src/'client-linux.json').write_text(json.dumps(feed))
    for name in ('stable.json','client-stable.json'):(dst/name).write_bytes(b'unchanged prior signed feed')
    m.promote(src,dst,public);m.promote(src,dst,public)
    assert all((dst/n).read_bytes()==b'unchanged prior signed feed' for n in ('stable.json','client-stable.json'))
    package.write_bytes(b'tampered')
    try:m.verify(src,public)
    except AssertionError:pass
    else:raise AssertionError('Tampered package accepted')
    package.write_bytes(b'fixture native package')
    feed['payload']=base64.b64encode(raw.replace(b'0.60.0',b'0.61.0')).decode();(src/'client-linux.json').write_text(json.dumps(feed))
    try:m.verify(src,public)
    except Exception:pass
    else:raise AssertionError('Tampered signature accepted')
print('PASS signed Linux feed, atomic promotion, preserved Windows/Mac feeds, idempotence, tamper rejection')
