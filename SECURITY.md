# Security

Please do not post credentials, private documents, or exploitable details in public
issues. Use [GitHub private vulnerability reporting](https://github.com/awpsec/kindred-server/security/advisories/new)
for server issues, or the [desktop repository](https://github.com/awpsec/kindred/security/advisories/new)
for native-client issues. If private reporting is unavailable, open an issue asking
for a private contact without including the vulnerability details.

Include affected versions, a minimal reproduction, impact and suggested mitigation.
Use test accounts and synthetic data. The latest stable release is the supported
security target; older versions may require upgrading rather than a backport.

Kindred can operate browsers, connected accounts and files. Run it with accounts
and permissions appropriate to the work, retain approval controls, and back up
persistent server data. Never publish provider credentials, VM disks, database
backups or release signing keys.
