# Tasks

## 1. Fixture and semantic baseline

- [x] 1.1 Independent fixture review passes and `openspec validate ocu-archive-containment --strict --no-interactive` exits0 before source changes.
- [x] 1.2 Add one archive API regression with temporary external/sibling benign canaries; parent captures semantic byte-disclosure RED on unchanged production source before the implementer applies the fix. Preserve ordinary-file positive control.

## 2. Confined archive reads

- [x] 2.1 Reuse canonical no-follow reads and remove unchecked ZIP path reopening; focused regression turns GREEN without changing its assertions.
- [x] 2.2 Cover in-tree/ancestor links, pre-existing chat-root and outputs-root symlinks to sibling trees, and separate deterministic leaf/ancestor/chat-root/outputs-root replacement at the real read boundary; unsafe bytes never enter a successful ZIP. Decode successful responses to assert target canary absence. Retain all attempts and qualify the new race oracle with controlled unchecked reopening.
- [x] 2.3 Run `tests/test_files_headers.py`, `tests/test_upload_claim.py`, `tests/security/test_path_traversal_app.py`, `tests/test_auth_guard.py` and the owning confined-reader tests under Python3.12 with current requirements; report collection, passes, skips and exact exits. Run affected source static/documentation gates.

## 3. Independent acceptance and lifecycle

- [x] 3.1 Run the actual app on an owned loopback port with temporary benign trees; HTTP requests and decoded ZIP members prove ordinary content, external/sibling denial and no source mutation. Retain command, environment, source and oracle identities; stop owned service and remove only owned fixtures.
- [x] 3.2 Update the existing unified-workspace decision and source changelog; central doc-gate, decisions-verify and strict fixture validation pass.
- [ ] 3.3 Complete three-seat correctness, test-evidence/spec-compliance and security/invariant review; approved local CI on frozen heads; merge paired PRs, close the issue and archive the fixture.

## 4. Risk-pack map

- Selected — Public API: 1.2/2.3/3.1 preserve auth/status/ZIP contract.
- Not selected — Config/project setup: no changes.
- Selected — File IO/path safety/overwrite: 1.2/2.1/2.2/3.1 prove confinement and no source mutation.
- Not selected — Schema/columns/units/field names: no persisted schema or response-field change.
- Selected — Auth/permissions/secrets: 1.2/2.3/3.1 cover cross-chat canaries and existing authorization; no real secrets read.
- Selected — Concurrency/shared state/ordering: 2.2 rejects selection/open races; coherent content snapshots are a non-goal.
- Not selected — Resource limits/large input/discovery: preserve current in-memory archive capacity behavior; no new limits or performance claim.
- Selected — Legacy compatibility/examples: 2.3 preserves nested names, bytes, hidden filtering and upload collisions; symlink compatibility intentionally removed.
- Selected — Error handling/rollback/partial outputs: 2.1/2.2 require closed errors before response publication.
- Not selected — Release/packaging/dependency compatibility: no dependency/image changes; LAN deployment not certified.
- Selected — Documentation/migration notes: 3.2/3.3 own decision, changelog and canonical archive contract.
