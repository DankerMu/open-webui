## 1. Safe skill cache

- [ ] 1.1 Write the tests in `tests/test_skill_manager.py` for every Required evidence item in design.md. The rejection cases (a)-(h) and the name cases must fail on `main` @ 499e048 and pass after the fix. The regression cases pass both before and after.
- [ ] 1.2 In `ensure_skill_cached`, check the raw entry names before prefix stripping. Reject unsafe entries and enforce the 2000-entry / 200 MB limits (declared sizes first, then bytes as read). Clean the temp directory on rejection, and never reach the delete-contents or rename step.
- [ ] 1.3 In `_parse_api_skills`, drop and log every registry entry whose name fails `re.fullmatch` or contains `..`.
- [ ] 1.4 Run the OCU unit command from `../open-computer-use/AGENTS.md`; all tests pass.

Risk packs:

- File IO / path safety / overwrite — selected: ZIP entries and skill names reach filesystem paths; tests 1.1 (traversal, absolute, all-prefix, backslash, symlink, names).
- Resource limits / large input — selected: decompression bomb and entry count; tests 1.1 (2001 entries, declared size >200 MB); the bytes-read counter is defence in depth with no red test (design.md).
- Error handling / rollback / partial outputs — selected: rejection must remove the temp dir and keep cache and manifest; asserted in every rejection test.
- Legacy compatibility — selected: valid flat and wrapped ZIPs keep working; regression tests 1.1.
- Public API / CLI, Config, Schema, Auth/secrets, Concurrency, Release, Documentation — not selected: no interface, config, schema, credential, ordering, packaging or user-facing doc change.
