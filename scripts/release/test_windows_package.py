"""Verify signing-key continuity and exact native/source binding offline."""
import base64
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import zipfile
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

spec = importlib.util.spec_from_file_location("windows_package", Path(__file__).parents[1] / "package-release.py")
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class WindowsPackage(unittest.TestCase):
    def test_signing_continuity_tampered_native_and_mixed_source(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ["desktop/windows", "ui/fonts", "third-party", "docs", "build"]:
                (root / name).mkdir(parents=True)
            for name in ["LICENSE", "THIRD_PARTY_NOTICES.md", "third-party/WebView2-LICENSE.txt",
                         "ui/fonts/LICENSE.txt", "ui/fonts/SOURCE.json", "ui/fonts/Liberation-LICENSE.txt", "ui/fonts/Liberation-SOURCE.json", "ui/vendor.js.LEGAL.txt",
                         "ui/artifact-vendor.js.LEGAL.txt", "docs/PROVIDER_MARKS_LICENSE.txt", "desktop/windows/Launch.ps1"]:
                (root / name).write_text("Fixture notice or script")
            version, source = "1.2.3", "a" * 40
            (root / "desktop/tauri.conf.json").write_text(json.dumps({"version": version}))
            with zipfile.ZipFile(root / "desktop/standalone.zip", "w") as z:
                z.writestr("kindred", b"server")
                z.writestr("bundle.json", json.dumps({"version": version, "server_sha256": package.sha(b"server")}))
            crate = root / "loader.crate"
            with tarfile.open(crate, "w:gz") as tar:
                info = tarfile.TarInfo("webview2-com-sys-0.38.2/x64/WebView2Loader.dll")
                info.size = len(b"MZloader")
                tar.addfile(info, io.BytesIO(b"MZloader"))
            (root / "desktop/Cargo.lock").write_text('[[package]]\nname="webview2-com-sys"\nversion="0.38.2"\nchecksum="' + package.sha(crate.read_bytes()) + '"\n')
            native = root / "build/native.exe"
            native.write_bytes(b"MZnative")
            manifest_path = root / "build/build-x86_64-pc-windows-msvc.json"
            manifest = {"version": version, "source_commit": source, "target": "x86_64-pc-windows-msvc",
                        "assets": [{"kind": "native", "name": native.name, "bytes": native.stat().st_size, "sha256": package.sha(native.read_bytes())}]}
            manifest_path.write_text(json.dumps(manifest))
            key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            private = root / "private.pem"
            private.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
            public = ET.Element("RSAKeyValue")
            for label, n in [("Exponent", key.public_key().public_numbers().e), ("Modulus", key.public_key().public_numbers().n)]:
                ET.SubElement(public, label).text = base64.b64encode(n.to_bytes((n.bit_length()+7)//8, "big")).decode()
            (root / "desktop/update-public-key.xml").write_bytes(ET.tostring(public))
            git = lambda args, **kwargs: source if "rev-parse" in args else b""
            with patch.object(package, "ROOT", root), patch.object(package.subprocess, "check_output", side_effect=git):
                output = root / "signed"
                package.package(root / "build", private, output, crate)
                envelope = json.loads((output / "stable.json").read_text())
                payload = base64.b64decode(envelope["payload"])
                key.public_key().verify(base64.b64decode(envelope["signature"]), payload, padding.PKCS1v15(), hashes.SHA256())
                archive = output / "kindred-windows-1.2.3.zip"
                self.assertEqual(json.loads(payload)["sha256"], hashlib.sha256(archive.read_bytes()).hexdigest())
                with zipfile.ZipFile(archive) as z:
                    self.assertEqual(z.read("Kindred.exe"), b"MZnative")
                    self.assertEqual(z.read("WebView2Loader.dll"), b"MZloader")
                with self.assertRaisesRegex(ValueError, "immutable"):
                    package.package(root / "build", private, output, crate)
                native.write_bytes(b"MZtampered")
                with self.assertRaisesRegex(ValueError, "changed"):
                    package.package(root / "build", private, root / "rejected", crate)
                native.write_bytes(b"MZnative")
                manifest["source_commit"] = "b" * 40
                manifest_path.write_text(json.dumps(manifest))
                with self.assertRaisesRegex(ValueError, "source/version"):
                    package.package(root / "build", private, root / "rejected", crate)
                manifest["source_commit"] = source
                manifest_path.write_text(json.dumps(manifest))
                wrong = rsa.generate_private_key(public_exponent=65537, key_size=2048)
                private.write_bytes(wrong.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
                with self.assertRaisesRegex(ValueError, "installed Kindred"):
                    package.package(root / "build", private, root / "rejected", crate)
                self.assertFalse((root / "rejected").exists())


if __name__ == "__main__":
    unittest.main()
