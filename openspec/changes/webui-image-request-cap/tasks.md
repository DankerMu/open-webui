## 1. Implementation

- [ ] 1.1 `backend/open_webui/utils/image_budget.py`: the cap over `messages`, copy-on-write (never mutates its input), per `design.md`.
- [ ] 1.2 `config.py`: `CHAT_MAX_IMAGES_PER_REQUEST` (default 30, fail loud), with an inline comment naming the failure mode it prevents (the upstream's 32-image limit).
- [ ] 1.3 `utils/middleware.py` `normalize_messages_for_model`: one call to the cap after the two existing steps.
- [ ] 1.4 Tests (new `backend/open_webui/test/utils/test_image_budget.py`) for every "Required evidence" line; the `normalize_messages_for_model` 33-image case is red before 1.3.
- [ ] 1.5 Decision record `docs/decisions/implemented/bug-fix/2026-11-27-image-request-cap.md` (spine touch, alternatives: OCU filter `request` hook, compaction; records the path-naming deviation from #936 and the passthrough/stateful non-goals, noting that production's connection `provider` was not checked).

## 2. Verification

- [ ] 2.1 `pytest backend/open_webui/test/utils/test_image_budget.py`, `make lint-scoped`, `make coverage-gate PART=backend`, `make smoke`, `make decisions-verify`, `make doc-gate`.
- [ ] 2.2 CI green.

## Risk packs

- Config / project setup: selected. New env var; tests for default, valid and invalid values (1.4).
- Schema / columns / units / field names: selected. Content part shapes `image_url` / `input_image` and their text replacements; tests (1.4).
- Resource limits / large input / discovery: selected. The point of the change; 40+3 image test (1.4).
- Legacy compatibility / examples: selected. At or under N is unchanged; test (1.4).
- Error handling / rollback / partial outputs: selected. Invalid config fails startup instead of silently uncapping; test (1.4).
- Documentation / migration notes: selected. Decision record (1.5); the env var is documented in the record and the config comment.
- Public API / CLI / script entry: selected. External callers of `/api/chat/completions` and the converted `/api/v1/messages` see placeholders above N: intended; covered by the normalize-level tests (1.4) and stated in the decision record (1.5).
- Auth / permissions / secrets: not selected. No access decision.
- File IO / path safety / overwrite: not selected. No files.
- Concurrency / shared state / ordering: not selected. Pure function on a per-request payload.
- Release / packaging / dependency compatibility: not selected. No dependency.
