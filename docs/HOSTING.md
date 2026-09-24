# Hosting Kindred

## Local server

Use `docker compose up -d` at the repository root, then visit
`http://127.0.0.1:9444`. The Compose default binds only to localhost. The first
account is the administrator; sign up before exposing a fresh server to a team.
Registration can then be closed and invitations issued from the profile menu.

The server is Linux x86_64. Other host architectures use Docker's amd64 emulation.
Docker Desktop must be running for standalone. Assign Docker enough memory for
at least one 6 GB computer plus server overhead. QEMU uses KVM when available,
otherwise TCG software emulation. On a Linux VPS, nested virtualization availability
is controlled by the hosting provider. Enable `/dev/kvm` with `compose.kvm.yaml`
and set `KINDRED_KVM_GID` to `stat -c %g /dev/kvm`.

## Team server with HTTPS

Point a domain at the server and allow inbound ports 80 and 443. Copy `.env.example`
to `.env` and set:

```dotenv
KINDRED_DOMAIN=kindred.example.com
KINDRED_PUBLIC_URL=https://kindred.example.com
```

Start the included HTTPS proxy with `docker compose --profile public up -d`.
For KVM, also supply `-f compose.yaml -f compose.kvm.yaml`. Caddy obtains and renews
the certificate. Keep the application port bound to localhost. Alternatively use
an existing HTTPS reverse proxy with WebSocket support and set the matching public
URL. Desktop clients accept HTTPS remote origins and loopback HTTP.

Every colleague installs the desktop app, enters that address and creates an account
(or uses the administrator's invitation). They connect their own provider. No SSH
account, host token, guest provisioning command or manually configured model ID is
needed. Use the same account to restore profiles on another device.

## Limits and persistence

`compose.yaml` exposes CPU, memory, disk, maximum-running-computer, user and profile
limits. CPU/memory/disk defaults are captured when each computer is first created;
changing these values affects new computers. QEMU rejects starts that exceed the
configured running-computer limit or available host/container memory. No other
profile's computer is automatically evicted. Stop an idle computer from its controls.

The `kindred-data` named volume contains the account registry, profile databases,
credentials, disks, guest keys and image cache. A normal `docker compose down`
followed by `up -d` preserves it. Do not use `down -v` to update. Container shutdown
stops scheduling and requests guest shutdown, with a bounded final QEMU disk flush.

To update, back up your data, then run:

```sh
docker compose pull
docker compose up -d
```

The default image is `ghcr.io/awpsec/kindred-server:latest`, updated with each stable release. Set `KINDRED_VERSION=0.75.0` in `.env` to pin a version. Keep the same project directory/name and named volume when updating. Do not use `down -v`. Existing source-build installations need the current `compose.yaml` once to switch to registry images. For development builds, use `docker compose -f compose.yaml -f compose.build.yaml up -d --build` instead. Desktop Standalone continues to use its bundled server and in-app update controls.

Existing
guest disks and accounts are retained. Software already installed inside existing
guest disks is retained too; this release does not silently rebuild those computers.
New computers use a software image matched to the current guest bundle. Older
images remain available while existing computers may still have them attached.
For an older guest that lacks the updated helper or guest sudo policy, its
administrator must run the current `install-guest.sh` inside that guest as root,
following [guest setup](https://github.com/awpsec/kindred-server/blob/main/docs/SETUP.md). Updating the server alone does not install
software or change permissions inside an existing disk.

## Backups and recovery

Stop the Compose project during a consistent full-volume backup. Back up the entire
named volume, not just SQLite files: provider credentials and guest files also live
there. Encrypt and restrict the backup as you would the server. Restore the volume
with the same Compose project name. Keep its ownership at UID/GID 1000 and preserve
private file modes. Never restore one profile's files into another profile directory.

First startup downloads a verified Debian cloud image; the software image includes
the server guest helper and verified official Codex CLI. Guest package installation
runs once. A slow setup can time out while the VM keeps its disk and continues
installing. Inspect the profile computer console, wait and retry the message; no
replacement disk is created. Failed model runs remain in chat history.

Inspect status with `docker compose ps` and server logs with `docker compose logs
--tail 100 server`. Profile console logs live under `profiles/<id>/computer` in the
volume. Do not paste registry files, credential files, session tokens or SSH private
keys into support messages.

## Migrating an existing native service

Existing personal installations may keep their original libvirt guest while enabling
`profiles.enabled = true`, `profiles.import_legacy = true` and an absolute profiles
directory. Install the managed VM helper, guest software bundle, QEMU and genisoimage;
set matching `KINDRED_PROFILES_DIR` and `KINDRED_GUEST_SOFTWARE` environment variables.
The service needs a writable profiles directory, KVM group access when available,
and a memory/CPU budget that includes its managed guests. Its old single-process
128 MB budget cannot contain a 6 GB QEMU computer.

The supplied `scripts/native-stop-computers.py` can be installed as a systemd
ExecStop helper with `$MAINPID` and a 90-second stop timeout. It stops the server
scheduler, requests managed guest shutdown and flushes remaining QEMU processes at
the deadline. It does not stop or modify the separately managed legacy libvirt VM.
Back up the existing config, binary, database and credential files before enabling
migration. Claim the owner account from an already authenticated device; old tokens
remain restricted to the original profile. New installations should use Compose.

## Change computer resources

In **Server administration → Bot computer resources**, administrators can change
CPU count, RAM and disk capacity for their current workspace. Shut down the
computer there, save the resources, then start it again. Stop active bot work and
return any controlled screens first. Existing disks and sign-ins are retained;
disks can grow but cannot shrink. The managed Debian guest uses
[cloud-init growth modules](https://docs.cloud-init.io/en/latest/reference/modules.html)
to expand its root filesystem on boot.

This works for managed computers on standalone and hosted installations. Compose
variables `KINDRED_VM_CPUS`, `KINDRED_VM_MEMORY_MB` and `KINDRED_VM_DISK_GB` are
defaults for **new** computers, not resize commands for existing ones. After
editing Compose or its `.env`, run `docker compose up -d` to apply the new
configuration; `docker compose restart` alone does not apply it. Docker Desktop
and the host must also have enough available RAM and disk space. Externally
managed VMs remain configurable through their host VM manager.

## Bot computers on a tailnet

Install and sign into Tailscale inside the bot computer to give that workspace
access to your tailnet. Its bots share that computer and its network access.
Tailnet permissions still control which services the computer can reach.

Kindred’s guest firewall permits traffic through `tailscale0`, including private
subnet routes, while retaining its private-address restrictions on other interfaces.
New computers receive this rule during setup. Existing managed computers receive
it through **Settings → Bot Computer → Update now** after upgrading the server.
The update preserves unrelated firewall rules and saves the rule for reboots; it
does not sign into Tailscale or change your tailnet permissions. Custom external
firewalls remain the operator’s responsibility.
