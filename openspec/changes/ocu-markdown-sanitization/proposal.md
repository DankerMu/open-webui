# Proposal

## Why

Sandbox-authored Markdown reaches the trusted standalone preview DOM through raw marked output. The owner-approved policy in [issue 85](https://github.com/DankerMu/open-webui/issues/85) retains safe HTML while rejecting executable content before insertion.

## What Changes

- Sanitize parsed Markdown with the pinned local sanitizer and a Markdown-specific per-call policy.
- Preserve safe formatting, navigation, images and controlled post-processing; fail visibly without raw fallback when sanitization is unavailable.
- Exercise the real browser boundary and adjacent Office/Drawio ownership.

## Capabilities

### Modified Capabilities

- `ocu-preview-spa`: safe standalone Markdown rendering.

## Impact

OCU `computer-use-server/static/preview.js` and `tests/orchestrator/preview_embedding_browser.cjs`; central fixture and owning architecture decision. No dependency, public API or embedded-format expansion.

## Triage

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded because this is a parser-to-trusted-DOM security boundary.
Blast radius: standalone preview execution, navigation and shared sanitizer ownership.
Selected risk packs: Public API / CLI / script entry; File IO / path safety / overwrite; Auth / permissions / secrets; Concurrency / shared state / ordering; Legacy compatibility / examples; Error handling / rollback / partial outputs; Release / packaging / dependency compatibility; Documentation / migration notes.
Evidence floor: semantic browser RED/GREEN, full existing preview browser harness with screenshots and zero unexpected errors, owning preview/security pytest modules, strict fixture validation and docs gates.
