# Proposal

## Why

[Issue200](https://github.com/DankerMu/open-webui/issues/200) identifies a ZIP reader that follows workspace symlinks into server-readable files outside the requested chat. The existing hidden-entry filter does not enforce containment.

## What Changes

- Archive payloads come from the existing no-follow workspace reader, never an unchecked pathname reopened by ZIP creation.
- **BREAKING**: symlink content is not archived, including intentional in-tree links; unsafe candidates may fail the request closed.
- Preserve ordinary file names/bytes, hidden-entry exclusion, authorization, ZIP response headers and normal missing/empty errors.

## Capabilities

### Modified Capabilities

- `ocu-output-archives`: add symlink-safe reads and concurrent replacement containment.

## Impact

OCU archive route and its existing API tests; no upload publication, broker policy, workspace migration, dependency or WebUI runtime change. Central fixture and owning unified-workspace decision accompany the source PR.

## Risk classification

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded for a public filesystem reader/security boundary.
Blast radius: cross-chat or host-readable byte disclosure through authenticated ZIP download.
Selected risk packs: public API; file IO/path safety; auth/secrets; concurrency; legacy compatibility; errors/partial outputs; documentation.
Evidence floor: pre-fix semantic API failure with benign canaries; focused archive and nearest consumer regressions; independent real HTTP ZIP probe; three-seat review and approved local CI.
