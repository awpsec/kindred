# Third-party notices

Kindred's original source is MIT licensed; see LICENSE. Dependency licenses remain
their own. Cargo.lock in the server and desktop directories records exact Rust
dependency versions. Tauri is distributed under MIT or Apache-2.0 terms. The
official OpenAI Codex CLI is an external Apache-2.0 dependency and is not bundled
in the source or Windows download; its release includes its own notices.

Wall-clock schedules use chrono 0.4.45 and chrono-tz 0.10.4, with IANA time-zone
data compiled into the server. Their license texts and those of the seven added
Rust packages are retained in third-party/rust-scheduling-LICENSES.txt.

Plain-text notification previews use pulldown-cmark. Bot portraits use resvg,
usvg and tiny-skia. License texts and exact source links for their added Rust
dependencies are retained in third-party/rust-notifications-LICENSES.txt and
provided alongside the 0.48.21 binary release. These dependencies are unmodified.

The optional server-side Pi harness uses @earendil-works/pi-coding-agent and
@earendil-works/pi-ai 0.85.1 (MIT), plus their transitive dependencies. Exact
versions, integrity hashes and declared licenses are recorded in
harness/pi/package-lock.json. deploy/install-pi.sh installs these packages
separately with their included license files, together with Node.js 24.14.0.
Node.js is MIT licensed with third-party components identified in the installed
node/LICENSE. Neither Node.js nor the npm dependency tree is bundled in the
source ZIP or Windows package.

The Windows binary package includes Microsoft's WebView2Loader.dll, obtained from
the webview2-com-sys dependency. Microsoft WebView2 SDK license terms apply to that
component; see the included WebView2-LICENSE.txt. The installed WebView2 Runtime is
a separate Microsoft component. The desktop window uses that existing runtime.

Debian, Chromium, Openbox, Xvfb, OpenSSH, ImageMagick, and other guest packages are
installed separately through Debian repositories and retain their package licenses.
The VM image and Codex CLI are not included in the source ZIP or Windows package.
This preview has not undergone a complete release license audit.

The browser bundle includes noVNC 1.7.0 (MPL-2.0, with permissively licensed
components identified in its notices), DOMPurify 3.4.15 (Apache-2.0 or MPL-2.0),
and marked 18.0.11 (MIT). License texts are in third-party/. The complete unmodified
noVNC source used for this bundle, including bundled pako and its licenses, is
provided in third-party/novnc-1.7.0-source.tar.gz. Its MPL-covered files retain their
license; Kindred's separate original code is MIT. tools/frontend/build.mjs and its
lockfile reproduce the combined vendor bundle. ui/vendor.js.LEGAL.txt contains
additional retained notices. Source is also available from
https://registry.npmjs.org/@novnc/novnc/-/novnc-1.7.0.tgz.

The OpenAI Blossom marks in ui/openai-black.svg and ui/openai-white.svg are
unmodified assets from https://cdn.openai.com/brand/OpenAI-Logos-2025.zip,
used only to identify the OpenAI provider. The marks belong to OpenAI; see
https://openai.com/brand/ for its design guidelines and usage terms. They are
not part of Kindred's MIT artwork license and do not imply endorsement.

The connector marks bundled in ui/app.js are from Simple Icons (CC0 1.0 Universal),
retrieved from https://github.com/simple-icons/simple-icons on 2026-09-09.
The included license is ui/connector-icons-LICENSE.md. Brand marks identify their
respective services; trademark rights remain with their owners and no endorsement
is implied. Unknown services use an initial badge.

Local dictation bundles Kindred's resident worker linked with whisper.cpp/ggml
(MIT), pinned at commit 371b5a7561823ab2bb32142d2751e35e7534727b. Windows
includes Vulkan and CPU builds; macOS builds Metal and CPU workers; Linux x86_64
builds portable CPU and AVX2 workers. Khronos
Vulkan and SPIR-V header notices and MinGW/GCC runtime notices are retained
inside the Windows runtime archive and in third-party/. GCC runtime code is
distributed under its runtime library exception. The model weights are downloaded
only through the user's explicit + action, with exact sizes and SHA-256 checks.
Whisper model and whisper.cpp licenses are retained in third-party/whisper-LICENSE
and third-party/whisper-cpp-LICENSE. Build sources, pinned upstream revisions, and
the bundled runtime manifest are in desktop/dictation/.

Konsole and its dependencies are installed separately from Debian packages,
without recommended desktop packages. Their complete package license notices
remain under /usr/share/doc in the VM. Kindred's terminal profile and color
scheme are original configuration files and do not modify Konsole itself.

Chat artifact rendering bundles React and React DOM 19.2.4, their scheduler,
Babel standalone 7.28.5 (MIT), and highlight.js 11.11.1 (BSD-3-Clause).
Exact dependency versions are pinned in tools/frontend/package-lock.json.
Full licenses are retained in third-party/artifact-rendering-LICENSES.txt;
additional bundled notices are in ui/artifact-vendor.js.LEGAL.txt.

Additional connector marks retrieved on 2026-09-10: QuickBooks from Simple Icons 15.16.0 and Microsoft Outlook from Simple Icons 11.15.0 (CC0 1.0 Universal). Brand names and marks identify their connected services; they do not imply endorsement.

The monday.com identifier mark is adapted from its public website asset (retrieved 2026-09-10): https://cdn.prod.website-files.com/656da6fea306219773d04208/69f1f07236c38c800a45a687_monday-logo.svg . It is used to identify the connected service.

Additional service identifiers use Simple Icons (CC0), pinned to 15.16.0 or 11.15.0 for archived marks. Marks identify the connected services; their respective owners retain trademark rights.

- https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/googledocs.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/googlesheets.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/googleslides.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/googletasks.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/googlechat.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/googlemeet.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/googleforms.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/zoom.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/salesforce.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/11.15.0/icons/microsoftteams.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/notion.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/asana.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/trello.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/github.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/zendesk.svg

The UI bundles the Inter 4.1 variable font, regular and italic, under the SIL
Open Font License 1.1. The full license is ui/fonts/LICENSE.txt; the pinned
upstream revision, source URLs and SHA-256 hashes are in ui/fonts/SOURCE.json.

Local document previews bundle Mammoth (DOCX), ExcelJS and SSF (XLSX), fflate
(archive size checks), and Mozilla PDF.js (PDF). Renderers and workers are
packaged locally; no hosted document viewer receives file contents. Versions
and transitive dependencies are pinned in tools/frontend/package-lock.json.
Full dependency license texts are in third-party/document-preview-LICENSES.txt.

## Liberation Mono

The bundled Liberation Mono fonts are distributed under the SIL Open Font License
1.1. The license and source/hash receipts are in ui/fonts/Liberation-LICENSE.txt
and ui/fonts/Liberation-SOURCE.json.
