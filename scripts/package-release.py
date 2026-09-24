"""Build the compatible Windows update ZIP and sign it with the existing project key.

Requires the verified Windows build manifest and its exact native executable.
The private key stays local; no credentials are uploaded and no release is published.
"""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tomllib
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

ROOT = Path(__file__).resolve().parents[1]
sha = lambda b: hashlib.sha256(b).hexdigest()


def read_key(path):
    data = path.read_bytes()
    if data.lstrip().startswith(b"<"):
        xml = ET.fromstring(data)
        number = lambda n: int.from_bytes(base64.b64decode(xml.findtext(n), validate=True), "big")
        return rsa.RSAPrivateNumbers(number("P"), number("Q"), number("D"), number("DP"),
                                     number("DQ"), number("InverseQ"),
                                     rsa.RSAPublicNumbers(number("Exponent"), number("Modulus"))).private_key()
    return serialization.load_pem_private_key(data, password=None)


def package(build, key_path, output, crate_path=None):
    source = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()
    if subprocess.check_output(["git", "-C", str(ROOT), "status", "--porcelain"]).strip():
        raise ValueError("Use the clean, committed desktop source from the platform build")
    version = json.loads((ROOT / "desktop/tauri.conf.json").read_text())["version"]
    manifest = json.loads((build / "build-x86_64-pc-windows-msvc.json").read_text())
    if (manifest["version"], manifest["source_commit"], manifest["target"]) != (version, source, "x86_64-pc-windows-msvc"):
        raise ValueError("Windows build does not match this source/version")
    native, = [a for a in manifest["assets"] if a["kind"] == "native"]
    if Path(native["name"]).name != native["name"]:
        raise ValueError("Invalid native filename")
    binary = (build / native["name"]).read_bytes()
    if sha(binary) != native["sha256"] or len(binary) != native["bytes"] or binary[:2] != b"MZ":
        raise ValueError("Windows native build changed")
    key = read_key(key_path)
    public = ET.parse(ROOT / "desktop/update-public-key.xml").getroot()
    number = lambda n: int.from_bytes(base64.b64decode(public.findtext(n), validate=True), "big")
    expected = rsa.RSAPublicNumbers(number("Exponent"), number("Modulus"))
    if not isinstance(key, rsa.RSAPrivateKey) or key.public_key().public_numbers() != expected:
        raise ValueError("The private key does not match installed Kindred clients")
    dependency, = [p for p in tomllib.loads((ROOT / "desktop/Cargo.lock").read_text())["package"] if p["name"] == "webview2-com-sys"]
    crate_name = "webview2-com-sys-" + dependency["version"]
    if crate_path:
        crate = crate_path.read_bytes()
    else:
        with urllib.request.urlopen("https://static.crates.io/crates/webview2-com-sys/" + crate_name + ".crate", timeout=60) as response:
            crate = response.read(32 * 1024 * 1024)
    if sha(crate) != dependency["checksum"]:
        raise ValueError("WebView2 loader crate differs from Cargo.lock")
    with tarfile.open(fileobj=io.BytesIO(crate), mode="r:gz") as tar:
        loader = tar.extractfile(crate_name + "/x64/WebView2Loader.dll").read()
    files = {p.name: p.read_bytes() for p in sorted((ROOT / "desktop/windows").iterdir()) if p.is_file()}
    files.update({"Kindred.exe": binary, "WebView2Loader.dll": loader,
                  "standalone.zip": (ROOT / "desktop/standalone.zip").read_bytes(),
                  "update-public-key.xml": (ROOT / "desktop/update-public-key.xml").read_bytes(),
                  "WebView2-LICENSE.txt": (ROOT / "third-party/WebView2-LICENSE.txt").read_bytes(),
                  "release.json": (json.dumps({"version": version}) + "\n").encode()})
    with zipfile.ZipFile(io.BytesIO(files["standalone.zip"])) as z:
        bundled = json.loads(z.read("bundle.json"))
        if bundled["version"] != version or sha(z.read("kindred")) != bundled["server_sha256"]:
            raise ValueError("The embedded server does not match this release")
    for name in ["LICENSE", "THIRD_PARTY_NOTICES.md"]:
        files[name] = (ROOT / name).read_bytes()
    notices = [p for p in sorted((ROOT / "third-party").iterdir()) if p.is_file() and p.suffix != ".gz"]
    notices += [ROOT / "ui/fonts/LICENSE.txt", ROOT / "ui/fonts/SOURCE.json", ROOT / "ui/fonts/Liberation-LICENSE.txt", ROOT / "ui/fonts/Liberation-SOURCE.json", ROOT / "ui/vendor.js.LEGAL.txt", ROOT / "ui/artifact-vendor.js.LEGAL.txt", ROOT / "docs/PROVIDER_MARKS_LICENSE.txt"]
    files["THIRD-PARTY-LICENSES.txt"] = b"\n\n".join(str(p.relative_to(ROOT)).encode() + b"\n" + p.read_bytes() for p in notices)
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f"kindred-windows-{version}.zip"
    stable = output / "stable.json"
    if archive.exists() or stable.exists():
        raise ValueError("Choose a fresh candidate; existing signed packages are immutable")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2026, 9, 14, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    if archive.stat().st_size > 67108864:
        archive.unlink()
        raise ValueError("Windows update exceeds the installed updater's 64 MiB limit")
    release = {"version": version, "platform": "windows-x86_64", "channel": "stable",
               "size": archive.stat().st_size, "sha256": sha(archive.read_bytes())}
    payload = json.dumps(release, separators=(",", ":")).encode()
    signature = key.sign(payload, padding.PKCS1v15(), hashes.SHA256())
    expected.public_key().verify(signature, payload, padding.PKCS1v15(), hashes.SHA256())
    stable.write_text(json.dumps({"payload": base64.b64encode(payload).decode(),
                                 "signature": base64.b64encode(signature).decode()}, indent=2) + "\n")
    print(json.dumps({**release, "source_commit": source, "signature_verified": True}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", type=Path, required=True)
    parser.add_argument("--private-key", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--webview-crate", type=Path, help="Optional offline crate matching Cargo.lock")
    args = parser.parse_args()
    package(args.build, args.private_key, args.output, args.webview_crate)
