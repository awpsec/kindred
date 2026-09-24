# Provider integrations

Kindred is an independent client. An integration is not provider endorsement, and
Kindred's MIT license does not grant rights to provider services, plans or trademarks.
This implementation review was checked against the sources below on 2026-09-23.

| Route | How Kindred connects | Boundary |
| --- | --- | --- |
| Codex | Official `codex app-server` and its account/login protocol | Codex owns the sign-in and token lifecycle. Each user supplies their own account. |
| Claude Code | Unmodified official CLI, `claude -p` and its control protocol | CLI owns tokens and model traffic. No subscription-token import or direct inference proxy. |
| Kimi Code | Official CLI for execution and login; installed CLI library for account/usage status | The status bridge currently calls internal SDK helpers; compatibility and permitted non-coding use require review. |
| OpenRouter / API providers | User-provided API key and configured API endpoint | Provider billing, model access and usage policies apply. No shared project-funded inference account. |
| Composio | User-supplied project key and Composio Connect/OAuth flows | Connected-app consent, scopes, OAuth verification and downstream service rules still apply. |

## Claude Code and the Agent SDK

Kindred uses the unmodified official CLI's `claude -p` execution and SDK/control
protocol, with Kindred tools exposed over MCP. It does not read the CLI credential
file or reuse subscription tokens in a different inference client.

Anthropic's [Agent SDK plan guidance](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
currently says Agent SDK, `claude -p`, and third-party app usage continue to count
against the user's subscription limits. The separate-credit proposal described
further down that page was paused; it must not be presented as current billing.

The [legal guidance](https://code.claude.com/docs/en/legal-and-compliance) also
allows hosting the unmodified CLI with each user's own authentication, subject to
its terms. Kindred's convenience bridge starts the CLI's own login and relays its
URL and one-use return code; the CLI performs token exchange and owns credentials.
It is not a separate Kindred OAuth application. Keep the binary and its supported
authentication methods intact. Do not pool accounts, resell usage, extract tokens,
or describe a subscription as unlimited API access. Organization agreements and
usage limits still apply.

Provider logos remain trademarks even when an SVG's copyright license is MIT.
The provider names identify integrations; Kindred must not imply endorsement.
The Claude asterisk's trademark permission is not established by its LobeHub MIT
asset license and remains a branding review item, separate from SDK support.

## Codex

The [App Server documentation](https://learn.chatgpt.com/docs/app-server) explicitly
describes embedding Codex, including managed ChatGPT authentication and approvals.
Kindred uses this protocol rather than extracting ChatGPT tokens for a different
inference client. Account entitlements and terms still apply; protocol support is
not a promise of access to every model or permission for every use case.

## Kimi and other providers

The [Kimi Code documentation](https://www.kimi.com/code/docs/) describes the CLI and
coding-plan integrations. Do not assume a coding subscription permits unlimited
general-purpose personal automation. The current usage-status adapter imports
private CLI helpers and resolves credentials inside the CLI environment; it does
not export them to Kindred, but is not a stable public integration API. Treat this
as an unresolved public-launch review item, not an approved partnership.

## Connected apps

Composio supports [managed and custom authentication](https://docs.composio.dev/docs/authentication).
For a multi-user production OAuth application, review its
[custom auth guidance](https://docs.composio.dev/docs/auth-configuration/custom-auth-configs)
and each service's verification requirements. A project API key does not bypass
Google consent or app verification. Do not ask users to disable account protections
to make a blocked connector work. Disconnect, consent revocation and access scopes
must remain visible to the user.

## Before public launch

- Keep the official Claude authentication flow and resolve trademark permission for provider marks.
- Confirm Kimi's permitted use and replace internal status helpers with a documented interface where available.
- Keep provider credentials out of source, logs, screenshots and release archives.
- Do not imply endorsement or share a maintainer's subscription with users.

This is a technical/documentation review, not provider permission or a legal opinion.
