# Design

## Context

The row key already uses `file_id`; its kind and constructor are local derived values. Parent compilation of the actual component with Svelte 5.56.0 emits a direct row constructor call in both development and production modes, not the dynamic wrapper inferred by one scout. This is source evidence, not a visible-failure claim. The pinned producer trace is independently executed; see proposal.md.

## Goals and boundaries

Governing invariant: after accepted metadata reconciliation, a file's visible row glyph represents its current canonical display kind while the row retains its file identity, selection and accessible name contract.

Preserve the existing kind mapping and MIME precedence, namespaced row keys, grouping/collapse/pagination, selected-file rendering, download identity, preference ownership and all generated/Office iframe authority. There is no broker, API, dependency, discovery, format or capability change.

Sibling surfaces: pinned broker matching and listing metadata; client validation; chat-keyed store and reconciliation; list row; selected-file icon/preview and parent download. The producer and selected surfaces are preservation references, not new implementation owners.

## Decisions

- First add one actual mounted component/controller regression. Use an explicitly controlled listing change, not a fetch-count or timer accident. Compare real SVG geometry against an unchanged known-kind row; assert the initial glyph differs, the refreshed glyph matches, the same selectable element survives and selection/name remain coherent. For an in-place rename with unchanged row position, preserve focused-row continuity.
- A semantic RED is required before a production edit. If the tracer passes, inspect the actual driver/realm and report that result; do not manufacture a failure or apply an unnecessary syntax change.
- For a reproduced static-constructor failure, use the existing explicit dynamic-component convention at the row icon. Adding kind to the row key is rejected because it destroys row identity and focus/tooltip continuity. Do not introduce a second icon map or constructor cache.
- Browser proof uses an owned scenario chat and a real `deleted` → `renamed` scenario transition, so revision/ETag change through the existing harness. Test-only type/MIME overrides may distinguish glyphs; keep actual served paths, URL/path equality, identity and envelope fields. This is consumer proof, not a claim that the stub executes the real broker rename.
- Interception parses only fetched 200 responses and passes 304/errors through unchanged. Do not strip ETags, disable polling, suppress console errors or depend on sleeps. Manual refresh need not always send a validator: a newer describe revision legitimately makes the next listing unconditional.

## Verification

1. Exact pinned FastAPI/broker trace: same bytes and file_id across an atomic cross-extension rename, revision +1, changed type/MIME/ETag, old-validator 200 and current-validator empty304; no Docker contact and owned data cleanup.
2. Component semantic RED/GREEN through existing reconciliation, rendered glyph reference and selection/name/element/focus assertions. Existing tree and preview regressions remain intact.
3. Actual browser before/after evidence for the same visible mismatch and repair, with a screenshot, real refreshed listing and same row/selection/name. Existing A-T01/A-T10 run under `make verify-ui`; no selected-icon, preview or folder implementation change.
4. `make test-frontend`, `make typecheck`, `make lint-scoped`, named-file coverage, docs/decisions/strict/scoped formatting and expanded review. Do not pin incidental SVG path strings or change source to satisfy a metadata-only assertion.

## Rollback and limits

One rendering cutover, no stored-state migration or compatibility path. Revert the issue commit for rollback. Local component/browser and pinned producer evidence do not certify LAN deployment. Focus across a genuine cross-folder move is not added to the contract; this change does not introduce such a move.
