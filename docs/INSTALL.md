# Install Kindred

Choose one installer from the [desktop releases](https://github.com/awpsec/kindred/releases).

- **Windows x64:** run Windows Setup. The Update ZIP is for the signed updater, not first installation. Packages are not Authenticode signed.
- **Apple Silicon:** open the DMG and drag Kindred into Applications. Current bundles use ad-hoc signatures and are not notarized. If macOS blocks the first launch, use System Settings → Privacy & Security → Open Anyway.
- **Linux x64:** launch the AppImage, or install the DEB with `sudo apt install ./Kindred-VERSION-Linux-x64.deb`. See [Linux setup](LINUX_SETUP.md) and [client updates](LINUX_CLIENT_UPDATES.md).

Choose Standalone with Docker running, or connect to a hosted Kindred server.

The public repositories start with a clean source history. Downloads will appear with the first public release. Earlier private builds may need one manual client upgrade to adopt the public update channel; preserve your existing profile and server data.
