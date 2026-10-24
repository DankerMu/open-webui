## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-unsupported-output-name --strict --no-interactive`.

## 2. OCU (open-computer-use, from `main` `e3535af` or later)

- [x] 2.1 Tests first (design evidence plan, OCU part); record which go red on `e3535af` and which are skipped on macOS.
- [x] 2.2 Broker: `_unsupported` and the structural check (D1, D3), scan (D2), symmetric validator and `_write_index` (D3); update the three tests named in D3.
- [x] 2.3 `app.py`: listing shape and `too_large` derivation (D4), archive skip while building the list (D5).
- [x] 2.4 Office admission refusal 422 `unsupported_name` in `_create_session` and `static/office-editor.js` `REFUSALS` (D5).
- [x] 2.5 OCU SPA: `autoSelectable`, preview fallback and toolbar download without anchors for unsupported entries (D5).
- [x] 2.6 `computer-use-server/README.md`: behaviour, how to find such files, oversized-paragraph corrections, archive change, one-way index note with tombstones, and that the one-way note covers restore onto an older release (proposal, D3, D5); `deploy/BACKUP-RESTORE.md:108-110` no longer lists unsupported names as a first-listing failure.
- [x] 2.7 Green: touched test modules on macOS, then `tests/orchestrator` and `tests/deploy` in the CI-shaped container (`python:3.13`, non-root, `--init`); `./tests/test-project-structure.sh`.

## 3. WebUI fork (after the OCU PR merges)

- [x] 3.1 Tests first (design evidence plan, fork part).
- [x] 3.2 `src/lib/apis/ocu/index.ts` type, validator, URL rule (D6).
- [x] 3.3 Sidebar row marker, action exclusions, fallback branch (D6); i18n via `npm run i18n:parse`.
- [x] 3.4 `scripts/ocu-stub.py` scenario and stub test; Playwright case.
- [x] 3.5 Decision record `docs/decisions/implemented/architecture/2026-10-23-ocu-unsupported-output-name.md` (D1–D6, the rejected options from #617: skip-and-report, keep fail-loud, reject at write time); note that `ocu-workspace-oversized-file`'s "files not marked too_large … behave as before" yields to the `ocu-workspace-files` exceptions for unsupported entries.
- [x] 3.6 Green: `make test-frontend`, `make typecheck`, `make lint-scoped`, `make verify-ui-ocu`, `make decisions-verify`, `make doc-gate`.

## Risk packs

Selected:

- **Invariant / state:** one predicate, index validity, identity rules for supported paths unchanged, one-way index, 2.2.
- **File IO:** real non-UTF-8 names, never read, 2.1, 2.2.
- **Public API:** listing fields, `url: null`, 422 `unsupported_name`, 2.3, 2.4, 3.2.
- **Security:** no new served path; confinement and symlink rules unchanged, 2.2, 2.3.
- **Documentation:** README, decision record, 2.6, 3.5.

Not selected:

- **Concurrency:** the broker's lock and atomic index publication are unchanged.
- **Migration:** `SCHEMA_VERSION` unchanged; old indexes load.
