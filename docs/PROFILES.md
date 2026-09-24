# Profiles and accounts

Each account owns one or more profiles. Each profile contains its own bots, chats,
settings, routines, provider accounts, credentials and shared bot VM. The server
selects the profile from an authenticated session; client-supplied database paths,
VM paths or another account's profile IDs cannot select a different tenant.

The first signup becomes administrator in a transaction. Administrators can close
registration, create one-use 24-hour invitations and disable other accounts. Disabling
revokes account sessions and device links, cancels outstanding runs, pauses schedules,
closes viewers and requests managed-guest shutdown. It preserves data for re-enabling.
The administrator cannot disable their own account through this control.

Creating an account or changing its password requires at least four characters.
There are no uppercase, number or symbol requirements; simple passwords such as
`aaaa` or `1234` are accepted.
Passwords use PBKDF2-HMAC-SHA256 with a separate random salt and 600,000 iterations.
Sign-in is rate-limited and expensive verification is bounded. Session tokens are
random and stored hashed in the registry; they expire after 90 days. Switching
rotates only the current device's session. Password changes revoke all previous
sessions and device links. Device-pairing codes are one-use and expire after ten minutes.

Unread counts derive from persisted conversation read cursors, so opening a chat
on one device clears its unread activity on another. The desktop remembers the last
profile and server. Windows saved sessions use the current user's DPAPI protection;
Unix session files have mode 600. Local-access workspaces, permissions and operation
journals are scoped by server origin plus profile ID. Profile changes cancel local
operations and refuse to complete until the worker releases them.

Other server addresses sync as account bookmarks. Authentication and provider data
remain on their own servers. Server owners are trusted operators: this is isolation
between users/profiles, not encryption against the server administrator.

## Accounts in the app

Choose **Add account**, then **Sign in** or **Create account**. Registration asks
for a username, display name and password, and creates one private workspace.
The optional Server control chooses another Kindred server. No separate profile
creation step is offered. **Manage accounts** lists saved sign-ins, including
different accounts on the same server. Each server/account appears once.

**Manage accounts** opens inside the main app using the Settings dialog layout,
with Accounts and Standalone pages. Its saved-connection actions run in a bundled
native view; the hosted page cannot forget accounts or start standalone setup.
Close or Escape dismisses the dialog. Before a server is connected, the desktop
still uses its standalone onboarding window. Older desktop builds show saved-account
switching and Add account inside the dialog, with an update link for full management.

Older accounts may own several workspaces. Those remain accessible under
**Account settings → Existing workspaces**, and in saved-account options. They
share their account password; no data or account ownership is migrated or merged.
The internal profile IDs and server APIs remain compatible with existing clients.

Forgetting an account requires confirmation and removes its saved connections
only from this computer. Bots, chats and files remain on the server. Launch-on-sign-in
is in **Settings → General → This computer**.

Desktop windows remember position, size and maximized state across account changes,
restarts and updates. Placement is device-wide, separate from accounts. If a display
is removed or its scaling changes, the restored window is fitted to an available
display's work area. Minimized windows never replace the normal saved bounds.

## Moving a workspace

In the desktop app, choose **Account settings → Move to another server**. Enter the
new server and sign in to your account there, or create an account. Kindred imports
into a new profile; it never overwrites an existing workspace on the destination.
Both servers must support the same workspace format. Transfers are limited to 256 MB.

Bots and their identities, roles, memories, chats, uploaded files, screenshot
attachments, skills, questions, task history, usage receipts, preferences, custom
provider definitions and routines move together. Provider credentials, account
passwords, saved browser sessions, local-access grants, and VM disks are not included.
Files created only inside the old VM and installed software remain there. Sign in to
providers on the new server and copy any needed computer files separately.

Finish active tasks before moving. During transfer the source workspace is paused.
After a successful transfer it remains on the old server as a read-only backup;
the desktop switches to the new server. Moved routines are paused until you review
and enable them. This prevents the same routine from running on both servers.
Local desktop access starts off in the destination profile.

The saved transfer ID makes retries reuse the same destination profile and import.
A failed transfer leaves the original workspace intact. Open Account settings to
resume it, or cancel a pending transfer to let the original workspace run again.
Any partial destination copy remains paused. Transfer state survives server restart.

## Existing personal installations

A server may explicitly enable `profiles.enabled` with `profiles.import_legacy`.
Its existing token must be presented to claim the first owner account. The setup
form explicitly explains this and requires confirmation that the account will own
the existing workspace. Claiming
retains the original database, bots, provider accounts and guest computer. Existing
token devices retain access to that original profile only; they never gain account
administration or access to newly created profiles. Their native local workspace
remains in its original directory. New profiles use separate directories and VMs.

## Claude Code and subscriptions

Connect Claude under **Settings > Connections > Claude Code > Sign in**. The
Claude authorization page opens in your browser. If it shows a return code, paste
that code into Kindred and choose **Finish sign-in**. Kindred checks the official
CLI's status and marks the connection ready only after verification. You do not
need to open a bot desktop or sign in separately for each bot in this profile.

The first connection requires your consent. Subsequent Claude-backed bots in the
same profile reuse the saved CLI connection. Other profiles and servers keep their
own connections. Pending sign-in can be resumed by choosing Sign in again, or
cancelled; links expire after ten minutes. Signing out cancels pending sign-in.

Kindred's Claude subscription adapter invokes the installed, unmodified official
Claude Code CLI with `claude -p`, using its own interactive login and official
credential store inside that profile's VM. It exposes Kindred's tools over MCP;
it does not extract Claude OAuth/session tokens to call Anthropic's API directly.
Kimi remains on its official CLI Wire path. OpenRouter/custom API-key endpoints
use the separate Pi integration.

Anthropic's current legal page expressly describes hosting its unmodified Claude
Code binary, provided each user completes Anthropic's own authentication flow and
usage is billed directly under that user's agreement. It prohibits third-party
collection or intermediation of Claude account credentials/session tokens. Kindred
leaves those credentials in the official CLI's guest-side store and accepts its
public signed-in status, including its own supported non-subscription login methods.

The June 15 update on Anthropic's June 16 support page pauses the proposed separate
Agent SDK billing change: `claude -p` and Agent SDK usage still draw from subscription
limits. Kindred is not endorsed by Anthropic. Company-plan use remains governed by
your organization's agreement and permitted usage; a separate profile prevents
personal credentials and history from being mixed with work data.

References checked for this release:
- https://code.claude.com/docs/en/legal-and-compliance
- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan

The automated release tests use local provider fixtures and do not validate a
real Claude account's subscription entitlement or spend company-plan quota.
