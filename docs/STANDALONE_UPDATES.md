# Update an existing standalone server

The installed desktop client and the standalone Docker server update separately.
The AppImage helper updates the client only. Its managed launcher deliberately
keeps the running standalone server unchanged until an explicit server update.

1. Let active bot tasks finish; the server and bot computers will restart.
2. Open **Accounts → Standalone → Update local server**. The installed desktop
   already contains the matching server bundle; no separate GitHub download or
   sign-in is needed.
3. Wait for the Docker build and server startup. The updater reuses the existing
   `kindred-standalone` Compose project and named data volume, retaining accounts,
   bots, conversations, credentials and computer disks.
4. Reopen your saved local account. In **Settings → General**, confirm that
   **Connected server** matches the installed **Client** version.

If necessary, the managed Linux launcher can open Accounts directly:

```bash
~/.local/share/kindred/bin/kindred --profiles
```

## 0.53.0 Accounts version-check defect

The published 0.53.0 native client reads a version constant from `/app.js` when
checking standalone status and update completion. That release's UI constant
was accidentally left at 0.52.0 even though its server executable is 0.53.0.
Consequently, Accounts can keep offering an update or report that Docker finished
but the server did not report the expected version after a successful upgrade.

**Settings → Connected server** uses the executable's API version. Check it before
repeating setup. The public, local `/identity/meta` endpoint also returns the real
server version without credentials:

```bash
python3 -c 'import json,urllib.request; print(json.load(urllib.request.urlopen("http://127.0.0.1:9444/identity/meta",timeout=5))["version"])'
```

If this reports 0.53.0, the server has upgraded even if Accounts displays the
stale label. Current native source checks `/identity/meta` first and falls back
to the UI constant for older servers without version metadata. This correction
requires a future approved desktop build; updating the server alone cannot fix
an installed client's version-check code.

## Failed setup

The setup details panel shows build/startup progress. Its persistent log is under
`~/.local/share/kindred/standalone/setup.log` on Linux (or the configured XDG data
directory). An actual failed build or unavailable endpoint still requires diagnosis;
the stale-label defect does not make every setup error harmless.

Preserve the existing Compose project and `/data` volume. Do not delete the
standalone directory, run `docker compose down -v`, or recreate computer disks
to retry an upgrade. Client-only Linux updates and runtime compatibility are
covered in [Linux client updates](LINUX_CLIENT_UPDATES.md).
