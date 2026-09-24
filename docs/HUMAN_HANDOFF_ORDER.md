# Human computer handoff polish

Human task cards are reconciled as independent, stable conversation entries.
Placement uses the request event's sequence when available, otherwise its
creation time, with the same run's final result and live worker as fallbacks.
Cards are deduplicated when shared-chat rendering exposes them in multiple
task sections. Later replies and work activity follow the existing handoff.

Take over and Open computer on a human task open the expanded computer pane.
Take over still acquires control through the existing exact-bot control path.

The core prompt now explicitly treats CAPTCHA, unusual-traffic challenges and
login walls as blocked states: request a human handoff, do not invent results,
and verify fresh evidence after handback. This is model guidance, not automatic
CAPTCHA detection or a guarantee about model perception.

Checks: Chromium and WebKit fixtures cover pending -> resumed/running ->
completed ordering, one card per task, and expanded exact-bot takeover.
Approval-receipt regression is also checked. Screens use simulated sessions;
no live CAPTCHA or native macOS session was operated.

Both shared UI copies are updated. The prompt change requires a server build
and takes effect for fresh tasks after deployment. Source pushes are unreleased.
