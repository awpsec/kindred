# Team workflow acceptance — 2026-09-20

Source under test: server `d54fd0e`, desktop `f59e015` (0.56.0 source plus unreleased changes). This is a development audit, not validation of installed 0.56.0 packages or the owner's live accounts. No external client messages, cloud writes, production changes, paid model requests or releases were performed.

## Intended workflow

1. PM receives the task, retrieves relevant project records and delegates bounded work to the pentester and admin using actual teammate tools.
2. Helpers run authorized commands as managed background jobs, preserve full logs under their workspace, and save a continuation plan. The requester waits for helper results rather than guessing completion.
3. Helpers return evidence and explicit partial failures. The PM reconciles results against current project sources.
4. The report is attached to chat using `share_file` for preview and download. Draft the client message separately; retain approval for the final recipient, text and attachment before sending.
5. Saved routines or Gmail inbox monitors trigger follow-up work. A conversational promise or bot role does not itself schedule monitoring.

## Executed checks

- Actual Pi SDK: 21 tests passed. Tool/result pairing, human wait, cancellation, provider failure, compaction, pinned account/model, large output and output-budget handling use synthetic HTTP peers; no paid inference.
- Actual Linux managed-process module compiled into a temporary thin test driver: real 65-second shell, duplicate launch suppression, cancellation, nonzero exit, deadline and bounded output tails passed. This tests the production worker code, not the complete guest RPC or native macOS bridge. No real one-hour process was run.
- WebKit app fixtures: group command waits, group message sequences, slash commands, Gmail monitors, quiet routines, skill import, connector editing, task recovery/download and Office/PDF document previews passed.
- Connector review fixture passed: edited drafts do not send, duplicate approval submits once, uncertain outcomes remain visible, and typed records retain safe source links.
- Full backend suite: **374 passed, 0 failed, 0 ignored** in 139.19 seconds. This includes the real Pi fanout/decision/failing-helper scenario across restart, simulated two-hour delegated-command recovery, connector HTTP retrieval and reviewed dispatch, durable memory receipts, routine deduplication, inbox cursor recovery, task continuation idempotency and authenticated report delivery. External peers are synthetic.

The three corrected suites also passed in Chromium (13 passing browser-suite runs total). Three existing browser tests had stale assumptions. They now follow compact connector disclosures (three calls stay separate; four stack), preserve review and single-submit assertions, and exercise the dedicated `/runs/:id/continue` route rather than the former chat-message continuation path. Production behavior was not changed by this audit.

Logs and browser artifacts: `/tmp/kindred-workflows-20260920/`; final backend test log: `/tmp/kindred-workflow-backend-tests-final-20260920.log`; build log: `/tmp/kindred-workflow-rust-lowmem-20260920.log`. These are local development receipts, not committed artifacts.

## Readiness limits and configuration

- **Connector source matters.** Codex-account connections deliberately require individual review and cannot save standing grants because linked service account identity is not independently established. Use suitable Kindred connections and explicitly configured permissions for unattended work; inspect each action's returned policy. Authentication alone grants no permission to act.
- **Review before sending must be configured.** Keep outgoing mail in its ask/review policy and review the actual payload. The app's email draft review is not a universal version-bound approval system for arbitrary shell uploads or every external connector operation. A broad standing grant is not the same as per-report approval.
- **Context is retrieved, not omniscient.** Bots query connected services, load skills, use supplied history and maintain their own durable memory. They do not automatically stay synchronized with every external project record. Use source IDs/links and dated observations in handoffs, and re-read changing facts before reporting.
- **Long tasks need the managed path.** Managed waits release the model turn and survive persisted-state recovery. Foreground command and provider-turn limits are distinct. Managed commands default to one day, maximum seven days; output receipts keep only the last 32 KiB. Save complete evidence in files. An offline desktop cannot deliver results or receive a stop request until it reconnects.
- **Monitoring needs a saved trigger.** Gmail has an inbox-monitor implementation; other periodic checks require routines. This is not a general filesystem watcher or an event subscription for every connected service.
- **External document delivery remains unverified here.** Local report previews and authenticated downloads passed. Actual Google Drive upload, uploaded-file readback, mailbox retrieval and client delivery were not exercised against the owner's accounts.
- **Native acceptance remains open.** Arcadian local-access recovery and macOS runtime behavior need on-device verification. Server/browser tests cannot close that issue.

## Next live acceptance scenario

Use a designated internal test project, mailbox and review folder. Retrieve one known Confluence page and Monday item and compare their IDs/content with the originals. Have the PM delegate a benign long command plus an independent admin check. Verify one PM continuation after both helpers finish, including a deliberate helper failure. Generate and preview a DOCX/PDF report, upload it to the review folder, and verify the returned file ID, content and permissions. Prepare an internal test email, edit it in the review UI, then send only when explicitly authorized and verify one delivery. Exercise reconnect/restart during a saved wait and one new-mail notification followed by an unchanged quiet check. These steps remain outstanding; fixture success is not a claim that they happened.

## Reproducing the backend run on a constrained builder

The ordinary debug-symbol build was stopped after severe swapping. The successful build reused dependencies and disabled debug symbols for the test binary:

```sh
cargo rustc --locked -j1 --bin kindred --profile test -- -C debuginfo=0
KINDRED_PI_TEST_NODE="$(command -v node)" target/debug/deps/kindred-84d74efccdd19041 --test-threads=1
```

The executable hash is build-specific; use the test executable produced by the build. The initial run used a nonexistent `/usr/bin/node` and was stopped; the final complete passing run used `/usr/local/bin/node`. Browser fixture dependencies were installed with the checked-in frontend lockfile (`npm ci --ignore-scripts`). No production dependencies or runtime source changed.
