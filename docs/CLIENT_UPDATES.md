# Client and server updates

The client is the installed native app. The server hosts the conversation UI and
bot computers. Updating a server refreshes that UI; it does not replace the client
binary. Settings → General shows **Client** and **Server** separately, including
when their versions differ. The Accounts screen reports the installed client.

With the server updater introduced after 0.51.0, **Update** beside your username
means a newer signed client is available. Click it to download the package from
your connected Kindred server, verify it, install it and restart. Mac chooses the
package for the running app's architecture. Linux uses the AppImage installer;
Windows retains its existing installed updater. No GitHub sign-in is involved in
these server downloads. A newer server version alone never triggers installation.

Mac and Linux clients through 0.51.0 need one manual installation of a newer
client to acquire this native updater. The hosted UI can show available releases
but cannot add native installer code to an already installed app. Older clients
get an explicit **Download update** action for the matching package hosted by
their connected server, rather than a private GitHub release page. Linux also retains **Install downloaded
AppImage…** and the independent update helper.

Mac and Linux availability checks use only the signed `client-stable.json` feed.
A missing, invalid or current native feed cannot fall back to the Windows feed
and offer an unrelated download. Their in-app update action uses a current-window
navigation intercepted by the desktop, avoiding WebKit popup restrictions after
draft saving. These UI routing corrections are in current source, after 0.53.0;
the native Mac installer itself has been included since 0.52.0.

Mac updates require Kindred installed in a writable Applications folder, not
running from a mounted DMG or an App Translocation location. They retain the
previous app as `.Kindred-previous-<id>.app` beside Kindred and record its path in
`~/Library/Application Support/Kindred/mac-client-update.json`. A failed bundle
replacement restores the previous copy. If the new process fails to start, the
old window remains available and the retained bundle can be restored manually.
No Gatekeeper settings or quarantine flags are changed by the updater.

Client updates preserve accounts, local preferences and standalone server data.
The updater restart deliberately leaves the installed standalone server version
alone. Existing Linux installation modes and rollback behavior are documented in
[Linux client updates](LINUX_CLIENT_UPDATES.md).

Server administrators must stage the signed manifests and matching packages;
a server executable or version number is not an update package. See
[the release procedure](RELEASING.md). Downloads use the connected server only,
without account tokens, and reject redirects, wrong signatures, mismatched
sizes/hashes and unexpected package names.

From 0.52.0, published desktop packages support Windows x64, Linux x64 and Apple Silicon Macs. Intel Mac builds are retired.
