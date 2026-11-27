## 1. Implementation

- [x] 1.1 `structuredOutput.ts`: `image` display item for `generate_image` / `edit_image` outputs, and the helper returning the in-order images' `id` and `url` keys (`getOrderedImageKeys`).
- [x] 1.2 `StructuredOutputRenderer.svelte`: render the `image` item with the existing `Image` component.
- [x] 1.3 `ResponseMessage.svelte` and `channel/Messages/Message.svelte`: skip files-row images whose `id` or `url` is shown in order.
- [x] 1.4 Tests for every "Required evidence" line in `design.md`, red before 1.1 / 1.3.

## 2. Verification

- [x] 2.1 `make test-frontend`, `make typecheck`, `make lint-scoped`, `make coverage-gate PART=frontend`.
- [x] 2.2 `make verify-ui-ocu` with the stub model's `generate_image` call (`scripts/ocu_stub_model.py:26-50`): exactly one `[data-cy="image"]` in the reply (`toHaveCount(1)`), placed after the tool row, none in the top row; `e2e/ocu-image-placeholder.e2e.ts` still passes. A two-image screenshot may be omitted (the stub makes one call per turn); say so.
- [x] 2.3 CI green.

## Risk packs

- Schema / columns / units / field names: selected. Parses the tool result `images` shape; malformed-result tests (1.4).
- Legacy compatibility / examples: selected. Messages with no `output`, or with no usable `images`, keep the top row; stored native-calling messages move their images into the body by design. A test for each case (1.4).
- Concurrency / shared state / ordering: selected. Render order and the streaming transient; ordering tests (1.4); transient accepted in `design.md`.
- Error handling / rollback / partial outputs: selected. Non-JSON or partial results render nothing extra; test (1.4).
- Public API / CLI / script entry: not selected. No route.
- Config / project setup: not selected. No setting.
- Auth / permissions / secrets: not selected. Same image URLs as today.
- File IO / path safety / overwrite: not selected. No files.
- Resource limits / large input / discovery: not selected. Same images, different position.
- Release / packaging / dependency compatibility: not selected.
- Documentation / migration notes: not selected. No user doc describes image placement.

## Evidence (2026-11-28)

- Shipped in PR #941 (merge `1665582`); unit tests red then green, `make verify-ui-ocu` and CI passed per that PR. One-image stub screenshot only (the stub makes one call per turn).
