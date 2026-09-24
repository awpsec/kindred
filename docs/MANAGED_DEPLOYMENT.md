# Managed deployments

Deployment-specific hosts, account details and rollback receipts are private operational records, kept outside the repository.

For each explicitly approved release, follow [releasing](RELEASING.md) and the current repository instructions. Source pushes alone do not authorize deployment.

Stage and verify the exact package, retain a consistent rollback backup, and preserve configuration, credentials, profile data and VM disks. Verify service health, authentication, bot connectivity and signed update hashes after switching. Never regenerate an existing updater signing key. Published release assets and the existing release checkpoints remain immutable.
