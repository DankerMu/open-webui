## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate messages-unsigned-thinking --strict --no-interactive`.

## 2. Implement

- [x] 2.1 Tests first: `backend/open_webui/test/utils/test_anthropic_conversion.py` covering design evidence a–i (f1, f2); run on unmodified source and record which fail (a, b, e, f2, h, i expected red; c, d, f1, g green).
- [x] 2.2 Apply upstream `75b183632294106d0f45be49918677ae6835c126` to `backend/open_webui/utils/anthropic.py`: hunk 2 verbatim, hunk 1 as the line-neutral single condition (proposal.md); file stays 981 lines; no other edits to that file.
- [x] 2.3 Decision record `docs/decisions/implemented/bug-fix/2026-10-27-messages-unsigned-thinking.md` per `docs/decisions/README.md` (problem, measured evidence, upstream commit and release, rebase note).
- [x] 2.4 Green: the pytest module, `make lint-scoped`, `make coverage-gate` naming the test module, `make anti-drift`, `make smoke`, `make doc-gate`, `make decisions-verify`.

## 3. After merge (orchestrator)

- [ ] 3.1 Deploy and re-run the Claude Code probe (Write + Bash task through `/api/v1/messages`) with `deepseek-flash-guan` and `qwen3.8-27b`; record on #653.

## Risk packs

Selected:

- **Public API / CLI / script entry:** `/api/v1/messages` request conversion; evidence a, b, e, f2, h, i (2.1).
- **Schema / field names:** Chat Completions content part types and the assistant `content` field; evidence a, b, e (2.1).
- **Legacy compatibility:** signed/redacted thinking, cache_control, empty user messages, thinking-free requests unchanged; evidence c, d, f1, g (2.1); intended assistant-empty change pinned by i; `make smoke` only shows the app still starts (no smoke request reaches `/api/v1/messages`).

Not selected:

- **Auth / permissions / secrets:** no auth or route change.
- **Config / project setup:** no config.
- **File IO / path safety:** none.
- **Concurrency / shared state:** pure function.
- **Resource limits:** none.
- **Error handling / rollback:** no new error path; providers' errors pass through as today.
- **Release / packaging:** no dependency change.
- **Documentation / migration notes:** decision record (2.3) only; no user-facing doc covers `/api/v1/messages`.
