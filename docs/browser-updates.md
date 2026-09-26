# Browser updates

Administrators can open **Update** beside their name, or **Server administration → Check for updates**, then choose **Update & restart**. The dialog tracks installation and reconnects automatically when the new server version is ready. Drafts and the selected conversation are retained. Other users cannot initiate a server update.

A stale interface is different from an old server: if the server already updated, the dialog offers **Load updated interface**. Browser UI versions come from the running server build, preventing a perpetual Update badge.

## One-time host setup

The web process cannot replace itself or manage Docker. Install the host supervisor outside the server/container so it survives restarts. It accepts only the latest stable release from `awpsec/kindred-server`; browsers cannot supply commands or download URLs. Native bundles are checked against GitHub's SHA-256 asset digest before execution.

On a systemd Linux host, install these files from the same reviewed checkout:

```sh
sudo install -d /usr/local/lib/kindred /etc/kindred
sudo install -m 755 deploy/server-updater.py /usr/local/lib/kindred/server-updater.py
sudo install -m 644 deploy/kindred-updater.service /etc/systemd/system/kindred-updater.service
```

Copy either `deploy/updater.native.example.json` or `deploy/updater.compose.example.json` to `/etc/kindred/updater.json`, then adjust its paths. Keep this configuration root-owned and not writable by other users. Ensure the `kindred` group exists. Do not overwrite an existing configuration when upgrading.

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now kindred-updater
```

For a native installation, the Kindred service user must belong to that group. The example uses the standard binary, service and data paths. The supervisor backs up the executable and all SQLite databases while the service is stopped; it restores them if startup fails. Native updates replace the server executable, not custom VM templates, Pi installations or host configuration. Deployments that require coordinated changes to those components should continue using their full deployment procedure.

For Docker Compose, keep `compose.updater.yaml` beside `compose.yaml`, set `KINDRED_UPDATER_GID` in `.env` to the host `kindred` group ID, and recreate the server once:

```sh
docker compose -f compose.yaml -f compose.updater.yaml up -d
```

Set `compose_directory` in the supervisor configuration to that project. List any additional compose files in `compose_files`, in their normal order. The supervisor respects the project's `.env` and refuses pinned or locally built images. It pulls the chosen release tag, snapshots the SQLite databases under `/data/server-update-backups`, and recreates only the server service. Volumes are retained. A failed container update needs host investigation; it does not automatically roll back a migrated database. The app never receives the Docker socket.

Host updates can interrupt active tasks and may restart computers if the service's stop procedure does so. Prefer an idle window. Keep your normal full backups; database snapshots do not duplicate VM disks.

Hosts without the supervisor show an explanation instead of a nonfunctional restart button. Existing installations need this setup and a server release containing the new endpoint before browser installation becomes available. Use `journalctl -u kindred-updater` for host diagnostics.
