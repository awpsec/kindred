# Automatic VM updates

Kindred updates packages inside the shared bot VM during downtime. This is enabled by default and can be turned off in **Settings > Bot Computer > Automatic updates**.

The coordinator waits for at least 15 minutes without queued or active tasks, manual screen control, screen recovery or workspace transfer. It also reserves all bot screens and the provider connection lock before starting. It does not start an offline computer for maintenance. The guest must have finished setup and been running for at least 15 minutes.

One package attempt is allowed every three days, including failures and uncertain dispatches. A confirmed startup deferral is not a package attempt. The guest also enforces this interval, so a server restart or repeated request cannot launch a duplicate update.

The dedicated Debian-family VM runs `apt-get update` followed by `apt-get --yes --with-new-pkgs upgrade`. Existing configuration files are retained. This installs updates and new dependencies without removing packages, changing the distribution release or rebooting. No AI provider is used for maintenance, and it does not update the server host or the person's desktop.

New tasks wait while packages install. Turning automatic updates off stops future attempts; it does not interrupt an installation. A systemd service owns the package process so an SSH disconnect or Kindred restart does not terminate dpkg. The server retains its reservation until the guest confirms the service has finished. If the VM went offline, **Start computer** restores the check; reboot and shutdown remain unavailable during an active update.

The status shows the latest successful update or a concise failure. A reboot recommendation remains until the guest confirms a new boot, including after a partial upgrade. Reboots are always left to the owner. Detailed package output stays inside the VM at `/var/lib/kindred/maintenance/packages.log` and is bounded to about 1 MB. The helper requires the normal Kindred guest installation and its passwordless sudo permission; missing prerequisites are reported without blocking ordinary tasks.

Maintenance state belongs to the VM and is excluded from workspace transfers. The operating guide tells bots not to create duplicate package-update routines. Task-specific dependency installation still follows the task's existing permissions.

If dispatch cannot be confirmed, Kindred reconciles the exact request ID under the guest's dispatch lock. Each closed request receives a small durable result in `/var/lib/kindred/maintenance/results`, including startup deferrals, low-disk failures and requests superseded by an already-running update. A delayed copy of a closed request cannot start after normal work resumes. Completed jobs are archived before later jobs replace them, and earlier cancellation records in `maintenance/cancelled` remain honored. A fresh request ID is required after a deferral; low-disk failures retain the three-day cooldown. An older completed job is never reported as the new attempt's success. Restarting Kindred also begins a fresh observed idle window before a new update may start.
