## 1. Constant-time service key comparison

- [ ] 1.1 Write the cases (a)-(e) from design.md. (a) and (b) must fail on OCU `main` @ `d81be4e`; (c)-(e) pass before and after, except that a 500 in (e) on `main` also counts as red.
- [ ] 1.2 Route both comparisons in `computer-use-server/app.py` through `auth_guard._credential_matches`.
- [ ] 1.3 Run the OCU unit command; it passes.

Risk packs:

- Auth / secrets — selected: the change touches how two service keys are compared. Covered by cases (a)-(e).
- Legacy compatibility — selected: status codes, details, headers and the unset-key behaviour are unchanged. Covered by cases (c) and (d).
- Public API / CLI, Config, Schema, Concurrency, File IO, Resource limits, Error handling, Release, Documentation — not selected: the change adds no interface, config, schema, ordering, file, limit or doc change.

Suggested fixture level: standard
Minimal mergeable slice: atomic
