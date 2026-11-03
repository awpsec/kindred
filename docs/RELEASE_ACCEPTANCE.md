# Installation acceptance

Package publication and installation are separate milestones. A hosted-server
upgrade does not update another standalone server or install an iOS app.

For each approved release, keep a private installation plan outside Git. Each
entry has a stable `id`, `kind` (`desktop`, `standalone`, `hosted`, or `ios`),
`target`, exact 40-character `source_commit`, optional `receipt` path, and
`voice_required` when call acceptance is required. The plan has an exact
`version` and an `installations` array. Never substitute the source of another
platform or a newer checkout for the packaged source.

Run `python3 scripts/release/verify-installations.py /private/plan.json` after
updating the receipts. It returns failure while any installation lacks evidence.
A release can be published while installations remain pending; report both
states explicitly. This verifier checks recorded evidence, not remote machines.

Receipts record `installation_id`, `kind`, `target`, `source_commit`, `version`,
`artifact_sha256`, `checked_utc`, `test_receipts`, and true values for `installed`,
`health_verified`, `accounts_preserved`, and `tests_passed`. Native clients also
need `native_verified`; Apple installs need `identity_preserved`. Voice-required
installs need `two_way_voice_verified` from the actual device, not simulated PCM.
The test receipts must identify the exact cases and their source/build identity.

For each standalone or hosted backend, stage matching packages first. Verify a
restorable backup, persistent VM disks and network routes. Inspect active jobs
immediately before switching; defer while busy unless the owner explicitly
requests interruption. After switching, verify health, version, accounts, data,
VMs and routes. Record `backup_verified`, `vm_disks_preserved`,
`routes_preserved`, and `idle_before_switch`. Never mark idle verification true
merely because a timeout expired. Use the current host runbook and preserve its
rollback route. No new scheduler or automatic restart is introduced here.

Settings → Versions reports the connected backend and this client's version,
including the installed iOS version. A mismatch points to updating that specific
server or device. It does not authorize an upgrade or prove an install succeeded.
