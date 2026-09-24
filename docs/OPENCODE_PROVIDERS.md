# OpenCode Go and Zen

Settings → Connections includes one OpenCode card with a Go / Zen plan selector. Each plan keeps its own key and billing route; existing saved keys are preserved. “Get API key” opens https://opencode.ai/auth; the owner signs in there and pastes the resulting API key into Kindred. This is OpenCode's documented connection flow, not an OAuth/device-code integration. Kindred displays “Key saved”; listing public models does not verify plan entitlement. Keys live in the existing protected profile credential store, never in browser persistence, model instructions or command arguments. Disconnect clears only that provider's key. Existing bots and usage history remain.

Go is subscription access for coding-agent traffic. Zen is pay-as-you-go. Kindred does not fall back between them. OpenCode's own account settings may separately allow Go overage to consume a Zen balance; Kindred does not change those settings.

Models are the intersection of the live `/zen[/go]/v1/models` catalogue and bundled transport metadata from Pi SDK 0.85.1. The snapshot in `harness/pi/opencode-models.json` comes from that dependency's `dist/providers/data/opencode{,-go}.json` (MIT). The three enabled transports are OpenAI chat completions, OpenAI Responses, and Anthropic Messages. Gemini/Google-native transport is omitted: this pinned Pi adapter does not expose the guarded fetch hook. Unsupported/new models require a reviewed metadata/harness update. No prefix-based guesses or API-format fallbacks are used.

Requests identify as `Kindred/1.0` with `x-opencode-session` derived from stable bot + chat IDs, including automatic compaction. Credentials and traffic stay on the selected official endpoint. Redirects and unrecognized URLs fail. Tool execution, approval, cancellation, context compaction and output remain on the existing Pi/Kindred bridge. Token receipts are recorded when supplied; prices are not presented as verified subscription charges.

Release requirement: ship matching server/UI and install Pi harness **0.44.3**, including `opencode-models.json`. The standalone Docker build and server packaging manifest include it. Do not reuse the 0.44.0 harness just because the upstream SDK version is unchanged. This source change does not publish or deploy a release.

Validation: frontend Go/Zen key saving, model selection and independent disconnect; Pi tool loops, endpoint/header validation for all three transports, quota-error propagation and no fallback; actual Pi compaction preserves Go headers and model. These use synthetic provider responses and do not verify a paid OpenCode account.

References: https://opencode.ai/docs/providers/#opencode-zen, https://opencode.ai/docs/go/, https://opencode.ai/docs/zen/.
