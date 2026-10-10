## Existing boundaries

The root Dockerfile downloads one fixed linux-x64 tarball into `/usr/local`; npm comes from that distribution. The unchanged manifest requires node>=22.20.0/npm>=10.9.3 and installs declared dependencies globally and in `/home/node_modules`. Existing image tests exercise tsc/tsx, but runtime checking accepts anyv22 and does not prove Mermaid rendering or local PDF parsing.

Normal implementation planning is sufficient: one runtime pin and one existing verification seam. No architecture, migration or new dependency design is needed. Plan2's source/release separation and canonical image provenance remain intact; this issue's explicit full-image merge gate has no source-only waiver.

## Decision

Use the approved Node22.23.2 official linux-x64 URL and bundled npm10.9.8. Do not change the manifest, engine floors, package-resolution commands, platform or business dependencies. Record installed package versions as observations rather than treating range declarations as installed versions.

Consolidate the existing tsc/tsx behavioral checks with exact runtime, Mermaid and PDF checks in the current image test script, not a second harness. Preserve its existing default invocation and unrelated checks; no new scoped CLI mode is needed because the complete default harness is required after an image build. Existing draft PR83 has a separate relay mode; do not import its unverified code here.

Run selected tool probes as the existing assistant user in the actual immutable image. Use installed local packages and bundled Chromium only. Mermaid may use an explicit Puppeteer configuration pointing at the browser installed by the image's Python Playwright installer, with the container-required no-sandbox argument; record that invocation, not a claim about unconfigured browser discovery. Tool probes require no WAN. Bound probe execution and clean only owned disposable containers/files; preserve stderr and real exit status.

Assertions: exact node/npm and linux/x64; unchanged manifest engine floors satisfied; declared packages present with observed compatible engines; Mermaid emits valid SVG containing the expected graph labels/edge; tsx computes a typed fixture result; tsc emits executable JavaScript with the expected result and rejects an ill-typed fixture; local pdfjs-dist reads an actual one-page PDF and extracts expected text. Existing tsc/tsx probes migrate rather than duplicate or weaken.

## Evidence sequence and containment

1. Fixture review and strict validation. Preserve the owner-reported old-runtime mismatch and historical complete-build timeouts; do not rerun those failures merely to confirm them. No complete workspace baseline image is currently available locally. New image probes are authored before the pin changes; no fabricated executable RED is claimed when the old full image is unavailable.
2. Make the minimal pin/test changes, run shell syntax checks, and capture an exact tracked candidate tree. Export only that tree for the full `linux/amd64` build, excluding untracked `.run`, credentials and host node_modules. Record tree/source identity, command, build exit/log and final image configuration digest/platform.
3. Require complete build success and no runtime-incompatibility EBADENGINE in the complete install log. Execute the default `tests/test-docker-image.sh <immutable-image-id>` invocation; retain command, exit status and output showing both the consolidated runtime checks and existing unrelated checks. Inspect actual outputs, versions and installed-package observations. Bind final source head to the consumed Docker inputs if only non-image documentation changes afterward.
4. Update owning docs/changelog after proof; expanded correctness, test-evidence/spec-compliance and integration review; exact-head local CI, paired merge and archive. Full broader image certification remains with its existing owners.

Build failure or unavailable runtime proof blocks merge/closure, not a reason to weaken engines, skip probes or substitute host/partial-image output. npm timeout investigation remains outside this issue. Retain an honest draft/evidence blocker if necessary and continue independent queue work. Do not prune user images/cache or deploy anything.

Rollback reverts the pin/test change before release; no runtime data or installed deployment is mutated. A successfully built local candidate is an artifact, not authorization to deploy it or close unrelated image-acceptance issues.
