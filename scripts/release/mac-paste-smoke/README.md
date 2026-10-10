# Disposable real-browser Paste destination

This test-only package provides an actual Chromium textarea behind a local RFB3.8 endpoint. The packaged app must use its production noVNC class, production Paste handler and real native clipboard command. The adapter is not an installed guest VNC server or production VM test.

Install from this directory with `npm ci --ignore-scripts`, then install the matching Chromium with `npx playwright install chromium`. The lock pins Playwright1.63.0, ws8.18.3 and pngjs7.0.0. Browser setup time on macos-26 arm64 within the existing15-minute build cap is unverified. Keep installation logs; do not silently skip the destination or replace it with an invoke/key-count mock.

Builder owns native-smoke-server.cjs, test-macos-package.py and workflow wiring. Dev owns only these six files. Attach after the existing fixture server starts listening. Source HEAD must equal sourceCommit; receipts bind that commit, app/vendor hashes, adapter hash and dependency-lock hash:

```js
const {attach}=require('./mac-paste-smoke/rfb-browser.cjs');
const destination=await attach(server,{
  output: evidenceFolder,
  token: 'native-test-token-only',
  source: exactPinnedSourceDirectory,
  sourceCommit: exactPinnedSourceCommit,
  executablePath: exactInstalledChromiumPath // optional if Playwright cache is set
});
```

`attach` requires an exact127.0.0.1 listening server, wraps `/api/status`, `/api/takeover`, `/api/computer/session`, serves `/fixture/mac-paste/destination` and accepts `/vnc` upgrades only with its random ticket and exact Origin. Original fixture request handlers remain responsible for other routes. The synthetic control APIs still require the synthetic bearer token. They authorize this local destination only. The initial status is not controlling; use the real visible Take control action. No product code or RFB object is replaced.

The destination starts empty and focused once. A real RFB handshake and raw framebuffer use actual browser screenshots. Received down/up key events become actual Chromium input events in order. Unicode and Return/Tab derive only from those packets. Expected text is never supplied to the adapter. No focus is restored per key. Disconnected or control-revoked queued events are cancelled before browser dispatch; outcomes and connection IDs are recorded.

Methods:

- `snapshot(label)`: drains the queue before and after three quiet50ms intervals, then checks received/processed key and pointer sequences around the DOM read and PNG capture under one3-second deadline. A late event restarts observation; a pending/outcome-null event or timed-out DOM/PNG operation cannot produce a receipt. Throws on transport/input errors. Saves actual destination PNG and JSON with text, input/Enter/submission counts, complete received/processed event sequence, connection IDs and browser version. Browser key dispatch has its own5-second deadline. An operation timeout is failure, never success.
- `clear()`: test setup only. Clears the textarea/counters and focuses it before the next action; does not type expected text.
- `disconnect()`: closes all current destination sockets. Use real UI Reconnect to acquire another actual RFB connection.
- `close()`: closes only this adapter's sockets/browser and restores original server listeners. Always call from the existing fixture cleanup boundary.

The runner must independently compare exact DOM text and submission count after one visible Paste activation. Observe the real invoke without replacing its result and require one clipboard command, zero browser clipboard fallback, no manual text dialog/second menu. Internal newlines are expected Return events; a trailing extra Return or submission is forbidden. The oracle should compare actual Enter-down count to the number of internal newlines, not require zero for multiline input. Save both native application and destination screenshots plus app/package/source/toolchain/adapter/dependency identities.

Compile `clipboard-fixture.swift` with the native Mac Swift compiler. On the disposable hosted runner only, call `text` with synthetic UTF-8 on stdin, `empty`, or `nontext`. It writes NSPasteboard and never reads/logs a prior clipboard. It must never run on an owner computer or persistent human clipboard. AppKit runtime/signatures remain unverified on Linux.

Negatives in the selected native smoke: real empty/nontext clipboard; visible no-control refusal before read; old/new connection ID refusal and no replay; control loss; account-session error. A JavaScript barrier after real native completion tests UI cancellation only. Do not stall the production main thread or label it pending-native security proof. Source generation fencing and any actual native security unit test stay separate from ordinary clipboard smoke.

Local transport verification:

```sh
KINDRED_PASTE_CHROMIUM=/exact/chromium \
KINDRED_PASTE_SMOKE_OUTPUT=/disposable/proof \
node test-rfb-browser.cjs
```

It uses the pinned production vendor.js noVNC class, verifies Aé中😀 plus internal newlineZ through actual browser input,12down/up events,6input events, one intended Return, no submit, stale-disconnect refusal, distinct fresh connection and wrong-ticket rejection. `KINDRED_PASTE_UNFOCUSED=1` deliberately blurs the initial destination; the same exact-text assertion must fail with empty actual text. That negative proves the oracle does not fabricate or auto-fill the expected result. The test also extracts the actual snapshot implementation and injects late held inputs during the final sleep, DOM read and screenshot; each must drain and re-observe the actual resulting text before returning. A held DOM read must time out; extracted pointer dispatch must refuse after control loss/disconnect and dispatch once while still controlled. Source-commit mismatch must reject before browser launch. Local transport proof is not native clipboard or packaged application proof.
