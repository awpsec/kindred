# Native desktop UI release check

Runs the current source in the real Windows WebView2 or Mac WKWebView, using a fresh temporary account and local synthetic API/RFB fixtures. It checks long-job focus and text selection, Library workbook decoding/paint, native mouse drag/click, and computer popout placement/return. No real account or VM is opened.

The fixture is carried forward from the verified 0.87.10 release tooling (`e622b735292b17f22b30882c85f36cb3df83796a`), including its versioned workbook response and settled-pane correction. Current source identity is required by exact Git commit and byte comparisons; release version comes from that source. No old hard-coded product hash is used as a substitute for current validation.

Use the manual desktop build workflow. Passing this check does not publish a release or replace the package integrity, installer, native network, clipboard, microphone or iOS checks.
