# Connect a phone to a standalone workspace

Open **Server admin → Phone & remote access** on the computer running Kindred.
**My devices with Tailscale** is the recommended encrypted path. Check the setup
steps, then explicitly turn on phone access. Kindred keeps its local connection
and changes only its own confirmed Tailscale root share. Other shares remain.
A saved address is not evidence that it is ready: apply any pending change and
wait for **Ready to pair**.

For a local network, choose **Advanced: local network**, search the computer's
networks, and select the ones you want. No networks are selected automatically.
Kindred generates their private connection addresses and enables their exact
origins. Loopback at `http://127.0.0.1:9444` always remains available on the
computer. Save stages the choice; restart explicitly when bots have finished.
The confirmation names how many bots are working. Listening and errors are
reported for each address after the actual port plan is applied.

**All networks, including ones added later** requires confirmation. Choosing
specific networks afterward replaces the wildcard. If an interface disappears
or its address changes, the saved addresses stay unchanged until you explicitly
save again. Public HTTP origins are not enabled for browser access or phone pairing. Advanced listening can still accept signed-in app traffic; the restart confirmation explains that exposure. At most
eight connection origins may be enabled; reduce your selection or additional
addresses if the form reaches that limit.

The local port plan needs Docker Compose 2.24.4 or later to replace existing
ports safely. Updates and repairs retain the saved plan and the existing data
volume. If validation fails, inspect the message before retrying. Do not remove
accounts, server data or computer disks to change networks.

Use **Connect mobile app** to open this same account and workspace. Its address
picker keeps a confirmed, applied Tailscale HTTPS share first, even when Advanced
networks are selected, followed by listening private
IP addresses supported by the updated phone app. IPv6 addresses have brackets,
for example `http://[fd7a:115c::5]:9444`. HTTP MagicDNS addresses are for desktop
browsers only. A pending or failed address cannot be selected for pairing.

Private HTTP requires a new iOS app build. The app accepts only IP literals in
10/8, 172.16/12, 192.168/16, 100.64/10 and fd00::/8. It displays the exact address
and asks you to confirm the unencrypted connection before transmitting a
password or pairing code. HTTPS remains recommended. HTTP and HTTPS origins,
including their ports, retain separate account sessions. Existing saved HTTPS
accounts keep HTTPS. An installed older app cannot gain this support from a
server update alone.
