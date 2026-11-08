## 1. Linear skill-mention scan

- [ ] 1.1 Write `backend/open_webui/test/utils/test_skill_mention_patterns.py` for every Required evidence item in design.md. The linear-scan and changed-behaviour cases must fail on `main` @ `e5da5be3b`. The must-preserve cases pass both before and after.
- [ ] 1.2 In `backend/open_webui/utils/middleware.py`, change the label class `[^>]*` to `[^<>]*` in `SKILL_MENTION_RE` (`:2271`) and `SKILL_MENTION_STRIP_RE` (`:2293`). Change nothing else in the file.
- [ ] 1.3 Run the new module, `backend/open_webui/test/utils/test_ocu_skill_mention_fallback.py`, `make lint-scoped`, `make fmt-check` and `make smoke`. Every one passes.

Risk packs:

- Resource limits / large input — selected: the quadratic scan of unclosed starts. Covered by the linear-scan tests in 1.1.
- Legacy compatibility — selected: the existing mention forms keep their extracted ids and stripped text. Covered by the must-preserve table in 1.1. The one intended change, a label containing `<`, is pinned by the changed-behaviour tests.
- Public API / CLI, Config, Schema, Auth/secrets, Concurrency, File IO, Error handling, Release, Documentation — not selected: the change touches no interface, config, schema, credential, ordering, file path, error path, packaging or user-facing doc.

Suggested fixture level: expanded
Minimal mergeable slice: atomic
