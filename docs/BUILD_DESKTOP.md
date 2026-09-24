# Building Kindred desktop

Build prerequisites: stable Rust, the OS Tauri build dependencies, and Tauri CLI 2.11.4. From `desktop`, run `tauri build --bundles deb,appimage -- --locked` on Linux, `cargo build --release --locked --target x86_64-pc-windows-msvc` on Windows, or `tauri build --bundles dmg -- --locked` on macOS. `desktop/standalone.zip` is a versioned, credential-free Linux server Docker context; its binary checksum is recorded inside. The workflow builds the Windows client binary, macOS DMG for Apple Silicon, Linux DEB and AppImage. The release operator signs the Windows ZIP and wraps that exact package with the compatible NSIS setup in desktop/installer; a generic Tauri NSIS installer does not use the signed updater layout. These packages require owner-supplied certificates for OS signing/notarization; the project-signed Windows update feed is separate.

The hosted web UI comes from the selected server. Local onboarding, updates, permissions and the macOS notch alert surface are bundled in this client.

Linux source builds also require Python 3, Git, CMake and a C++ compiler to bundle
the local Whisper CPU workers. These are build-time dependencies; dictation users
do not need them or Docker. See [dictation](DICTATION.md) for model downloads
and the distinction between released packages and current Linux support.

## Prepare the bundled server

The server bundle is generated, not checked into public Git history. Before building the desktop, build the matching server on Linux x64 from a clean checkout:

```sh
git clone https://github.com/awpsec/kindred-server.git
cd kindred-server
cargo build --release --locked
python3 scripts/release/package-server.py --binary target/release/kindred --output ../server-candidate
cp ../server-candidate/kindred-standalone-*.zip ../kindred/desktop/standalone.zip
```

Use matching desktop/server versions and shared UI sources. For macOS/Windows builds, copy this verified Linux bundle to `desktop/standalone.zip` before packaging. The manual packaging workflow downloads the prepared bundle from a private build-inputs draft, verifies its hash and embedded server commit, then packages those exact bytes. Windows dictation includes a pinned, licensed Whisper runtime; its source and Docker build recipe are in `desktop/dictation/`.
