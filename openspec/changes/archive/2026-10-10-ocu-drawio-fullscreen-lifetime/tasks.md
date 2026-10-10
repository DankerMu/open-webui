# Tasks

## 1. Contract and failing boundary

- [x] 1.1 Complete independent fixture review and strict OpenSpec validation before production edits.
- [x] 1.2 Add one real-SPA fullscreen-retirement tracer to the existing browser harness; parent records semantic RED with the old modal still present after a real selector transition, not merely a blocked pointer click.

## 2. Ownership and consumer proof

- [x] 2.1 Bind the returned fullscreen UI to its child lifetime with idempotent closure; parent browser GREEN proves explicit A-to-B selection closes the old body-owned UI while B renders and accepts interaction.
- [x] 2.2 Exercise listing-driven new-file auto-selection, same-file_id rename, revision refresh, removal with fallback, and empty listing as separate mounted-SPA cases; each must remove the old fullscreen UI and show the correct reconciled state.
- [x] 2.3 Verify normal close, Escape, repeated open/retire/reopen, and retirement during deferred attachment; assert restored scrolling state, no stale modal nodes, usable newer UI and zero unexpected browser errors.

## 3. Acceptance

- [x] 3.1 Parent runs the complete `tests/orchestrator/preview_embedding_browser.cjs` in the active Python3.12 requirements environment with installed Playwright/Chromium; retain real screenshots, exact tool/source identities, RED/GREEN and existing Office/Markdown/Drawio controls.
- [x] 3.2 Parent runs the owning preview regression modules through the source repository's pytest command, source commit hooks and scoped gitleaks; explicitly identify any unchanged-input evidence reuse.
- [x] 3.3 Update the existing local-Drawio architecture decision, remove its resolved issue-99 pending note, and pass central `make doc-gate decisions-verify`, changed-document formatting and strict validation. Separate WebUI UI smoke is not a substitute for the modified source browser proof.
- [x] 3.4 Complete expanded cross-review and exact-head user-approved local CI, normal paired merges and fixture archive; preserve all required outcomes and disclose pointer-access/host-platform limits.

## Risk packs

| Pack                                           | Selection and evidence                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| Public API / CLI / script entry                | Selected: real standalone SPA and browser-harness entry, 1.2–3.1.                       |
| Config / project setup                         | Not selected: no settings/setup change.                                                 |
| File IO / path safety / overwrite              | Not selected: no file writes or URL-policy change.                                      |
| Schema / columns / units / field names         | Not selected: no schema/protocol change.                                                |
| Auth / permissions / secrets                   | Not selected: policies unchanged; existing browser security controls remain in 3.1.     |
| Concurrency / shared state / ordering          | Selected: child lifetime, recursive/duplicate destroy, pending attachment, 2.1–2.3.     |
| Resource limits / large input / discovery      | Not selected: no new discovery/limits; ordinary tracker lifecycle remains out of scope. |
| Legacy compatibility / examples                | Selected: close/Escape/scrolling and existing viewer/adjacent renderers, 2.3–3.1.       |
| Error handling / rollback / partial outputs    | Selected: render-failure closure and retirement cleanup preserve usable SPA, 2.3–3.1.   |
| Release / packaging / dependency compatibility | Not selected: pinned vendor materials unchanged; no image/deploy certification.         |
| Documentation / migration notes                | Selected: owning decision/fixture and gates, 3.3.                                       |
