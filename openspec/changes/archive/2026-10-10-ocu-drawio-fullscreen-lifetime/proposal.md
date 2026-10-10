# Proposal

## Why

Drawio fullscreen UI owns body-level nodes outside the Files preview stage. Retiring the stage disposes its child guards without closing that UI, so old diagram content can outlive the selected preview. [Issue 99](https://github.com/DankerMu/open-webui/issues/99) requires lifecycle closure through the mounted standalone SPA.

## What Changes

- Bind each returned local fullscreen UI to its owning preview lifetime.
- Share idempotent close completion with ordinary close/Escape and failure cleanup.
- Prove explicit selection and separate listing-driven retirement transitions, including repeated cycles, against the real local viewer.

## Capabilities

### Modified Capabilities

- `ocu-preview-spa`: standalone Drawio fullscreen lifetime follows preview ownership.

## Impact

OCU `computer-use-server/static/preview.js`, existing `tests/orchestrator/preview_embedding_browser.cjs`, central fixture and existing local-Drawio architecture decision. No asset/dependency upgrade, WebUI runtime change or embedded Drawio support.

## Triage

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded for shared lifetime ordering and body-owned UI cleanup.
Blast radius: standalone fullscreen close, selected-file reconciliation and renderer teardown.
Selected risk packs: Public API / CLI / script entry; Concurrency / shared state / ordering; Legacy compatibility / examples; Error handling / rollback / partial outputs; Documentation / migration notes.
Evidence floor: semantic browser RED/GREEN, full existing preview browser harness with screenshots and zero unexpected errors, owning preview regression tests, strict fixture/docs checks and expanded cross-review.
