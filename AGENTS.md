# Development and releases

- Run appropriate checks, commit and push completed source changes. Keep shared UI files aligned between the desktop and server repositories.
- Source changes do not authorize a release. Obtain maintainer approval for the specific version before publishing packages, tags or update feeds.
- GitHub Actions is manual only. Obtain approval before paid builds; use cached, narrowly scoped builds and never retry automatically.
- A complete release includes Windows x64, Apple Silicon and Linux x64 (AppImage and DEB), plus the matching server. Verify macOS and Windows on their native platforms.
- Run scripts/release/verify-release.py and shared UI verification before publication. Preserve signing keys, immutable published assets, backups and rollback paths. Never commit credentials or runtime data.
- Approved releases include the matching managed server upgrade and signed update feed. Stage, back up and verify before switching; preserve configuration, accounts and VM disks.
- Write short, human release notes: a handful of user-visible changes in plain language. No internal hosts, personal names, task transcripts or build logs. Keep hashes and detailed verification in separate assets. State installation/signing limitations accurately in linked installation documentation.
