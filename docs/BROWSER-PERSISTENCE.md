# Browser persistence

The managed guest uses the same assigned browser profile for URL opening, desktop Browser/New window and startup restoration. Screen 1 retains `browser`; other assigned screens retain `browser-N`. A matching desktop session supplies the bus, runtime directory and desktop markers. Missing, ambiguous or inaccessible context is an access error; Kindred preserves the profile instead of resetting it or choosing another account.

Existing Chromium processes are reused. New launch requests cannot retrofit their startup flags or encryption backend, and Kindred does not force them to restart. Verified guest maintenance installs known managed launch scripts together with the runtime, checks their source hashes and retains rollback copies. Customized scripts are preserved. Manual runtime-only installs need matching deployment helpers for desktop/startup consistency. Running browsers, saved-login state and VM disks are not installation targets.

For an observed expired login, a bot verifies the destination/account and tries matching masked saved-login autofill before requesting human help. A missing desktop/profile must not be treated as a reason to recreate it or sign in again. Locked vaults, rejected logins and human verification remain distinct observed blockers; saved state cannot guarantee a site's acceptance.

The synthetic tests cover persistent/session HttpOnly cookies, localStorage, IndexedDB, restored tabs, normal close, crash recovery, a desktop/bus restart, separate screens, source-update rollback and real entrypoint command captures. They do not prove live Google/Venmo login retention, existing encrypted-keyring readability, a VM reboot or OS/package upgrade. No plaintext password-store override, keyring reset, new browser provider or challenge bypass is introduced.

This is source behavior pending integration and a separately selected release. No existing owner's browser has been restarted or migrated by this work.
