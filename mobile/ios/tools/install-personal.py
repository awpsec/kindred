#!/usr/bin/env python3
"""Build/install the clean, pushed checkout; signing stays in Local.xcconfig."""
import argparse
import datetime
import json
from pathlib import Path
import plistlib
import subprocess
import sys


def run(args, cwd, capture=False):
    return subprocess.run(args, cwd=cwd, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None).stdout


def pushed_revision(repo, fetch=True):
    def git(*args):
        return run(["git", *args], repo, capture=True).strip()

    if git("status", "--porcelain", "--untracked-files=all"):
        raise RuntimeError("Commit and push all source changes before installing.")
    branch = git("symbolic-ref", "--quiet", "--short", "HEAD")
    remote = git("config", "--get", f"branch.{branch}.remote")
    if remote == ".":
        raise RuntimeError("The branch must track a remote branch.")
    if fetch:
        run(["git", "fetch", remote], repo)
    revision = git("rev-parse", "HEAD")
    if revision != git("rev-parse", "@{upstream}"):
        raise RuntimeError("Local HEAD differs from the remote branch. Sync and push before installing.")
    return revision


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", required=True, help="Physical iPhone identifier from xcrun devicectl list devices")
    parser.add_argument("--check", action="store_true", help="Verify source parity without building/installing")
    args = parser.parse_args()
    ios = Path(__file__).resolve().parents[1]
    repo = ios.parents[1]
    revision = pushed_revision(repo)
    print(f"GitHub source revision: {revision}", flush=True)
    if args.check:
        return
    derived = ios / "DerivedData" / "PersonalDevice"
    run(["xcodegen", "generate"], ios)
    run(["xcodebuild", "-project", "KindredCompanion.xcodeproj",
         "-scheme", "KindredPersonal", "-configuration", "Personal",
         "-destination", f"platform=iOS,id={args.device}",
         "-derivedDataPath", str(derived), "-allowProvisioningUpdates",
         "-allowProvisioningDeviceRegistration", f"KINDRED_SOURCE_REVISION={revision}", "build"], ios)
    app = derived / "Build" / "Products" / "Personal-iphoneos" / "Kindred.app"
    with (app / "Info.plist").open("rb") as source:
        info = plistlib.load(source)
    if info.get("KindredSourceRevision") != revision or info.get("KindredAPNsEnvironment"):
        raise RuntimeError("The product does not match the requested Personal build.")
    run(["codesign", "--verify", "--deep", "--strict", str(app)], ios)
    # A second fetch/check prevents installing after source changes or a remote
    # update during the build. Keep generated products and local signing ignored.
    if pushed_revision(repo) != revision:
        raise RuntimeError("The source revision changed during the build; rebuild before installing.")
    run(["xcrun", "devicectl", "device", "install", "app", "--device", args.device, str(app)], ios)
    receipt = {"revision": revision, "version": info["CFBundleShortVersionString"],
               "build": info["CFBundleVersion"], "bundleIdentifier": info["CFBundleIdentifier"],
               "installedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (derived / "installation.json").write_text(json.dumps(receipt, indent=2) + "\n")
    run(["xcrun", "devicectl", "device", "process", "launch", "--device", args.device,
         info["CFBundleIdentifier"]], ios)
    print(f"Installed {receipt['version']} ({receipt['build']}) from {revision}")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
