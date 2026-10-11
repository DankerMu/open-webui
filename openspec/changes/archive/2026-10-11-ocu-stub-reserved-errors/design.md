# Design

## Context

The stub supplies an occupied-name callback to `OfficeStore`; uploads and Office deduplication share that source. `_store_upload` holds the existing lock and allocates a name before publishing bytes and listing metadata. File retrieval intentionally checks uploads before synthetic errors.

## Governing invariant

Accepting an upload cannot replace a reserved fixture response, and every accepted upload remains retrievable under its returned name in the same chat.

## Decision

Add the two exact names to the existing occupied-name source, retaining the existing numbered-name allocator. This also avoids a divergent Office name inventory. Do not reorder GET dispatch: that alternative can strand accepted bytes behind an error response. No generic reserved-name registry or new helper is needed.

## Must preserve

- First upload of each bare name returns `backend403 (2)` or `backend409 (2)`; later collisions continue the existing numbering.
- Bare GET status/body stay 403/`backend 403` and 409/`backend 409`.
- Uploaded GET returns status200 and exact binary bytes; outputs lists its returned path, not a hidden bare-name upload.
- `backend-html403.html` retains existing reserved behavior and its synthetic HTML403 response.
- Existing chat isolation, concurrency lock, ETag/revision, ordinary collision, Office fixtures and `partial_after` later-page503 behavior remain intact.

## Evidence and ownership

Implementer first adds a bounded scenario to the existing real-HTTP smoke without production edits. Parent runs `make smoke-stub` and preserves the semantic allocation failure before the implementation change. The same unchanged smoke must then pass, including the existing Office scenarios. Scoped lint, docs and applicable harness checks cover the final diff. Parent controls all executions and acceptance; no leaf runs checks.

## Non-goals and rollback

No production auth/security fix, malformed-name validation, UI work, route reordering or partial-page repair. Revert the focused commit if the fixture contract regresses; there is no persisted migration. Review names/state ownership, error-body precedence and meaningful pre-fix evidence.
