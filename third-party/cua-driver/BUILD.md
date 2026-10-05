# Kindred Linux driver policy build

The source pin is MIT Cua Driver 0.33.4 at
`ba0033a661101669c60ce05f1fe5753bf8bad748`. This is a modified Linux
payload. The published upstream archive and executable are baseline evidence,
not the production payload. The patch disables automatic browser endpoint
setup and automatic consent input, including consent during read-side reconnect.
It leaves normal explicitly requested browser input and exact identity checks.

Build in an isolated checkout at that pin. Apply
`kindred-no-automatic-browser-input.patch` from this directory with `git apply
--check`, then `git apply`. Use the pinned Cargo.lock without updating it. The
selected compiler is Rust 1.98.1 on Debian trixie x86_64; the delivery receipt
records compiler identity, lock and patch hashes, commands, actual runtime library
requirements and output hashes. Native libraries needed to build include X11,
XTest, Xi and pkg-config. Optional perception/Spaces/portal extensions are not
selected. Driver telemetry and update checks are disabled by the guest bridge.

Run the two named policy regressions with:

```sh
cargo +1.98.1 test --locked -p platform-linux kindred_automatic -- --nocapture
cargo +1.98.1 build --locked --release -p cua-driver
```

Kindred runs heavy commands through the project build lock with one Cargo job.
Use a writable private Cargo home/target directory if the default cache is read
only. Do not overwrite the baseline binary. Keep the new payload and its
candidate tar.gz outside Git. Record its archive SHA256 and executable SHA256
separately from the published upstream archive. The manifest selects exact bytes;
a different build result needs explicit provenance and verification before it
can replace those bytes. Bit-identical reproduction across hosts is not claimed.

The release packaging helper requires both the selected candidate archive and
its matching executable. Container builds require the validated payload at
`deploy/vendor/cua-driver`; they do not download a substitute. The installer
verifies before atomic replacement and retains `.previous` for rollback. Existing
profiles and browser processes are preserved. An optional missing/dead/incompatible driver preserves native methods in a
compatible running Kindred guest. The selected driver requires glibc 2.39;
current source guest/container images use Trixie. This does not prove a newly
built Kindred executable works on older distributions, and no distribution
migration is performed. Author Rust test executables also require glibc 2.39. Any
possibly dispatched input with a lost receipt remains uncertain and is never
replayed through another route.
