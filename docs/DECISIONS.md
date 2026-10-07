# Decisions browser worker

The OpenAI Decisions API selects a current action from Kindred's observed browser choices. Kindred supplies the action arguments and executes them through its existing browser profile and approvals. The bot's selected parent model and subscription sign-in stay unchanged. Only Codex bots use this optional worker; other providers retain their tools.

## API key in Codex Connectors

Open Settings → Connections → Codex → Browser helper. Paste an OpenAI API key and choose Save key. Saving explicitly enables this API-billed helper for your account’s workspaces without changing Codex subscription sign-in or its parent model. Blank Save does not delete a key; Disconnect requires confirmation. Save/replace takes effect on the next choice, and changing/removing the key revokes any action selected with the previous key before input. Failed saves preserve the previous credential.

Kindred stores the key using its existing private atomic credential-file convention (0600 on Unix), with the account derived from the authenticated workspace. Status never returns key bytes. No key goes in browser storage, logs or source. “Key saved” does not prove API access; status reports a plain last-use failure when available. A failed API call selects no new input and preserves earlier receipts.

## Legacy server environment

For the legacy workspace only, an operator may explicitly enable an environment key. Tenant workspaces never inherit it. A saved key takes precedence; Disconnect writes a removal marker so the environment key cannot silently return. Restarting or deploying is a separate operator action. Do not put the key in TOML, chat, screenshots or logs.

```toml
[decisions]
enabled = true
api_key_env = "KINDRED_DECISIONS_API_KEY"
```

The current supported Kindred Decisions integration uses an OpenAI API key. The inspected subscription client exposes no Decisions route; this is not a global claim that every OAuth token is rejected by the service. Kindred does not read or forward Codex/ChatGPT subscription OAuth credentials and does not convert accounts. The transport uses the fixed `https://api.openai.com/v1/decisions` endpoint and `gpt-6-luna`; there is no endpoint/model override or redirect following. An absent/invalid key leaves the worker unadvertised and ordinary tools available. A configured key is not proof that the API grants access: HTTP auth/rate-limit failures return a safe fallback with no new input, rather than retry or change billing credentials.

Managed browser restoration and new URL launches enable a random-port debugging endpoint on guest loopback for the existing per-display profile. Restoration requires installation of the updated guest start-desktop script (new provisioning includes it); the runtime-binary updater does not install that script. This applies when a browser process starts using that installed script; upgrading the guest runtime or saving a key does not add an endpoint to an already-running browser. Kindred does not kill, restart or migrate that browser to obtain attachment. It continues with ordinary computer tools until the matching launch script is installed and a deliberate normal browser restart occurs. API authentication and browser attachment are separate requirements.

Open the desired site with ordinary computer tools first. The observer attaches only to the exact managed profile, browser parent and its owned loopback socket on the selected X11 display. It never starts/restarts the browser. Existing browsers without a supported endpoint remain on ordinary tools. Copied endpoint metadata, different profiles/displays, stale snapshots, covered elements, unsupported frames and visible password/OTP views refuse safely.

The official request contains text evidence and an inline PNG data URL, plus one named choice question. Responses must bind the question name/type, selected ID and complete finite probability distribution to this observation. The API does not generate arbitrary tool arguments. Page evidence is untrusted. Supplied values and screenshots are sent to OpenAI only on this enabled path; never supply secrets.

The worker allows at most 64 input actions plus a final observation/decision, and at most 120 seconds total. Observation/input operations are bounded to 30 seconds; Decisions to 15 seconds (HTTP transport 14). Cancellation, human-control, existing approvals, task budget, run/bot identity and desktop leases remain in force. After a human returns control, a fresh whole-desktop screenshot remains required. A dispatched input with a lost response is uncertain, blocks automatic replay, and never retries through another executor. Confirmed earlier actions remain in receipts if later API access fails.

`reported_finished` means the selector thinks the observed goal is satisfied. It is not independent confirmation of submission or remote success. The parent must inspect the final observation and preserve all action receipts.

## Verification

`tools/test-browser-worker.py` tests the real CDP driver on an isolated form, including copied-profile refusal. `tools/test-decisions-worker.py` uses the production Rust chooser/worker/driver with a disposable local form. Default mode uses a **mock** local Decisions server to check schema, fields and one confirmation effect. Its `--live` mode uses the official fixed transport, refuses missing keys, and records actual choice latency/count/outcomes. Mock results do not prove live API access, model quality or speed. Review the task delivery report for the exact live evidence and outstanding limits. No owner accounts or websites are used.

Official guide: https://developers.openai.com/api/docs/guides/decisions

`tools/test-browser-restoration.py` (server repository) reads the production restoration argv and checks real headed attachment, form effects, foreign profile/socket/display refusal and a synthetic cookie across a graceful restart. It uses disposable local profiles and no Decisions API.
