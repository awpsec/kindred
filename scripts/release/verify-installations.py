#!/usr/bin/env python3
"""Read-only acceptance gate for each installation, separate from publication.

A package build or another host's deployment never counts as an install.
Private host names and receipts stay outside release assets.
"""
import argparse
import datetime
import json
import re
from pathlib import Path

KINDS = {"desktop", "standalone", "hosted", "ios"}


def check(plan, root):
    version = plan["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Exact release version required")
    rows, seen = [], set()
    for item in plan["installations"]:
        identity = item["id"]
        if identity in seen or item["kind"] not in KINDS:
            raise ValueError("Duplicate installation or unknown installation kind")
        seen.add(identity)
        if not re.fullmatch(r"[a-f0-9]{40}", item["source_commit"]):
            raise ValueError("Exact candidate source required for each installation")
        issues, receipt = [], None
        if item.get("receipt"):
            receipt = json.loads((root / item["receipt"]).read_text())
        if receipt is None:
            issues.append("Install/test receipt pending")
        else:
            for key, expected in [("installation_id", identity), ("kind", item["kind"]),
                                  ("version", version), ("source_commit", item["source_commit"]),
                                  ("target", item["target"])]:
                if receipt.get(key) != expected:
                    issues.append(f"{key} mismatch")
            if not re.fullmatch(r"[a-f0-9]{64}", receipt.get("artifact_sha256", "")):
                issues.append("Installed artifact hash missing")
            for key in ["installed", "health_verified", "accounts_preserved", "tests_passed"]:
                if receipt.get(key) is not True:
                    issues.append(f"{key} not verified")
            if not receipt.get("test_receipts"):
                issues.append("Exact test receipts missing")
            if not receipt.get("checked_utc"):
                issues.append("Verification time missing")
            if item["kind"] in {"desktop", "ios"}:
                if receipt.get("native_verified") is not True:
                    issues.append("Native acceptance pending")
                if item["target"] in {"macos-aarch64", "ios"} and receipt.get("identity_preserved") is not True:
                    issues.append("Signing/bundle identity preservation unverified")
            else:
                for key in ["backup_verified", "vm_disks_preserved", "routes_preserved", "idle_before_switch"]:
                    if receipt.get(key) is not True:
                        issues.append(f"{key} not verified")
            if item.get("voice_required") and receipt.get("two_way_voice_verified") is not True:
                issues.append("Two-way voice acceptance pending")
        rows.append({"id": identity, "kind": item["kind"], "target": item["target"],
                     "accepted": not issues, "pending": issues})
    if not rows:
        raise ValueError("Installation inventory is empty")
    return {"version": version, "accepted": all(r["accepted"] for r in rows),
            "checked_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "installations": rows}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = check(json.loads(args.plan.read_text()), args.plan.parent)
    text = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.write_text(text)
    print(text, end="")
    raise SystemExit(0 if result["accepted"] else 1)
