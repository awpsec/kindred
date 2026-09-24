# Updates from GitHub Releases

Desktop releases live in [awpsec/kindred](https://github.com/awpsec/kindred/releases).
The updater uses the latest **stable** release, not prereleases. This source change
requires an updated client/server package before it reaches installed users.

| Platform | Signed package |
| --- | --- |
| Windows x64 | `Kindred-VERSION-Windows-Update.zip` (Setup EXE for first installation) |
| macOS Apple Silicon | `Kindred-VERSION-macOS-Apple-Silicon.dmg` |
| Linux x64 | `Kindred-VERSION-Linux-x64.AppImage` |

The release must also include `stable.json` (Windows) and `client-stable.json`
(Mac/Linux) as top-level assets. The publication preparation script now stages
both automatically after the complete-platform gate passes. Uploading installers
alone does not create a working update channel. Existing published assets remain
immutable; the next approved release introduces these feed assets.

Native Mac/Linux and Windows update downloads use GitHub directly. Mac/Linux can
fall back to the legacy server feed when GitHub is unavailable; a successful but
invalidly signed GitHub response is rejected. The server's `/updates/` endpoint
also relays the same public GitHub assets for update notifications and older
clients, with a local staged-feed fallback. No GitHub or Kindred login credentials
are sent to GitHub. Private repositories cannot serve anonymous public updates.

Manifests use the existing pinned RSA key. Packages must match the signed size and
SHA-256 before installation. Only HTTPS GitHub/release-storage redirects are
followed. Package URLs are built from validated versions and known filenames,
never arbitrary URLs supplied by a manifest. Cancellation and rollback remain in
the existing native installers.

Linux DEB installations are still package-managed: install the new DEB rather
than silently replacing a system package with an AppImage. Intel Macs are not a
current release target. Updates never mean that every architecture is supported.

Desktop updates and server administration are separate. Hosted administrators
upgrade their server explicitly; standalone users update their bundled/local
server through the existing server administration flow. An old installation may
need one manual upgrade (or a staged legacy feed) to gain GitHub update support.

Release publication still requires approval. Do not make a partial-platform
release GitHub's latest stable release. Validate the signatures, platform packages,
source provenance and update installation on native operating systems before
publishing. GitHub update plumbing does not substitute for OS signing/notarization.

## Public repository transition

New packages and signed manifests are published in `awpsec/kindred`; server packages live in `awpsec/kindred-server`. Old private release assets and history are not copied here. Until the first approved public release, this repository has no downloadable update. Older installed clients may need a manual upgrade to change their built-in repository URL; the existing signed server-feed fallback remains supported. Do not remove a working legacy feed during migration.
