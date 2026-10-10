## 1. Contract and executable gates

- [x] 1.1 Independent expanded fixture review and strict validation pass; retain owner-approved versions, historical mismatch evidence and the unproven timeout cause as distinct facts.
- [x] 1.2 Extend the existing image-test script before changing the Dockerfile pin: exact runtime/engine checks plus real mmdc, tsx, tsc and local pdfjs probes. Consolidate existing TypeScript checks, preserve the default invocation and unrelated checks, and pass shell syntax checks without claiming an unavailable old-image RED.

## 2. Full image and runtime proof

- [x] 2.1 Change only the approved fixed Node tarball version; prove manifests, locks, engine floors, business dependency ranges and unrelated image configuration remain unchanged. Export an exact tracked candidate tree, excluding untracked/secret inputs.
- [x] 2.2 Complete the full linux/amd64 Dockerfile build; retain command/tree/log/exit evidence, inspected immutable image ID and platform, and prove no runtime-incompatibility EBADENGINE in the complete dependency-install log. A timeout or partial image is not acceptance.
- [x] 2.3 Run the complete default `tests/test-docker-image.sh <immutable-image-id>` harness and retain command, exit status and output for both consolidated runtime checks and existing unrelated checks: Node22.23.2/npm10.9.8, compatible declared/installed engines, Mermaid SVG labels/edge, typed tsx result, executable tsc output plus rejected bad types, and local PDF page/text results. The new tool probes use bundled assets offline, propagate real failures and release only owned resources.

## 3. Documentation and delivery

- [x] 3.1 After image proof, update source changelog and owning image-delivery decision; bind final source head to actual consumed image inputs and observed installed versions, then pass central docs/decision/strict-spec/changed-format checks.
- [ ] 3.2 Expanded correctness, test-evidence/spec-compliance and integration cross-review close at the frozen source head; publish complete exact-image evidence and scoped local CI.
- [ ] 3.3 Merge paired source/fixture, close this issue and archive the capability delta only after every full-image/tool criterion passes; do not close unrelated release or relay acceptance.

## Risk packs

Selected: config/runtime pin — exact fixed distribution and bundled npm (2.1,2.3); release/packaging/dependency compatibility — full image, unchanged declarations and actual installed engines (2.1–2.3); public test CLI — unchanged default invocation with retained unrelated probes (1.2,2.3); file IO/resource ownership — meaningful tool artifacts and bounded owned container/temp cleanup (2.3); error handling — nonzero tool/build failures block acceptance with stderr retained (2.2–2.3); documentation/provenance — source tree, immutable image/platform/log and observed versions (3.1–3.3).

Not selected: auth/permissions/secrets, runtime business schema, data migration, UI state — unchanged. npm timeout diagnosis, business dependency upgrades, weaker engines, floating npm/runtime, LAN deployment and broad image certification remain outside scope. Build/cache artifacts may remain locally; user images/cache are not pruned.
