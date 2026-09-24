#!/usr/bin/env bash
# Wrap Tauri's already-signed app in a native DMG without a writable mount.
# This does not compile, re-sign, retry, publish, or change system security.
set -euo pipefail

target=${1:?Pass the native Rust target}
version=${2:?Pass the exact release version}
case "$target" in
  aarch64-apple-darwin) architecture=arm64 ;;
  x86_64-apple-darwin) architecture=x86_64 ;;
  *) echo 'Expected a Mac target' >&2; exit 2 ;;
esac
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ $(uname -s) == Darwin && $(uname -m) == "$architecture" ]]
source_root=${KINDRED_PACKAGE_SOURCE_ROOT:?Pass the application source root}
bundle="$source_root/desktop/target/$target/release/bundle"
app="$bundle/macos/Kindred.app"
image="$bundle/dmg/Kindred-$version-$target.dmg"
[[ -d "$app" && ! -e "$image" ]]
codesign --verify --deep --strict --verbose=2 "$app"

stage=$(mktemp -d "${TMPDIR:-/tmp}/kindred-dmg.XXXXXXXX")
trap 'rm -rf "$stage"' EXIT
ditto "$app" "$stage/Kindred.app"
codesign --verify --deep --strict --verbose=2 "$stage/Kindred.app"
ln -s /Applications "$stage/Applications"
mkdir -p "$bundle/dmg"
# Keep each native tool's output visible when packaging fails on a runner.
hdiutil create -verbose -volname Kindred -fs HFS+ -srcfolder "$stage" -format UDZO "$image"
hdiutil verify "$image"
