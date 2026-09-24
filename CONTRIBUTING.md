# Contributing

Kindred is split into [server](https://github.com/awpsec/kindred-server) and
[desktop](https://github.com/awpsec/kindred) repositories. The server owns
hosted chat, storage and bot execution; the desktop owns native integration.
Shared files in `ui/` must stay aligned across both repositories.

For a bug, include your OS, client/server versions, steps to reproduce and expected
behavior. Remove account details, tokens, email content and private documents from
logs and screenshots. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

Keep changes focused. Run the relevant Rust, Python or browser checks, describe
what you verified, and disclose platform checks you could not run. Do not use real
customer accounts or production data in fixtures. Provider integrations must use
supported interfaces and respect their authentication and licensing requirements.

See the [desktop build guide](docs/BUILD_DESKTOP.md) for source-build prerequisites and
[architecture](https://github.com/awpsec/kindred-server/blob/main/docs/ARCHITECTURE.md) for implementation context. Releases are
maintainer-approved; source pushes do not automatically publish packages.
