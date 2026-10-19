## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review and strict validation before implementation.

## 2. Implement

- [x] 2.1 Unit tests for `refreshSessionUser` first (red), then `src/lib/utils/session-refresh.ts`.
- [x] 2.2 Component tests for Account and UserMenu per design.md Seams (real `getSessionUser` over stubbed fetch; jsdom stubs/mocks listed there; Account asserts `saveHandler` once + rendered variable rows; null keeps user; returned user replaces; Account thrown 401 unchanged) red against current components, then switch the three call sites to the helper with minimal upstream diffs.
- [x] 2.3 Playwright case in `e2e/auth-bootstrap.e2e.ts` per design.md Seams: route abort installed after the Account tab renders; both save requests 200; post-save lookup aborted ≥1; no `/auth` URL; user shown; token unchanged; saved profile after unroute; `allowAuthFailure(…, ['transport'])`.
- [x] 2.4 Grep other `getSessionUser` → `user.set` call sites; list them in the report (non-goal).

## 3. Verify

- [x] 3.1 Targeted vitest files and `make test-frontend`; `make typecheck`; `make lint-scoped`; `make dev-bg` + `make e2e-auth-bootstrap` + `make verify-ui` + `make dev-stop`.

## Risk packs

Selected:

- Auth / permissions / secrets: 2.2/2.3 keep a valid session on transport failure; thrown HTTP errors and 401 confirmation unchanged (component thrown case; existing auth-bootstrap e2e still green).
- Concurrency / shared state / ordering: shared `user` store only written with a server-returned user (2.1/2.2); post-save result ownership/lease is an explicit non-goal (design.md residual risk 2).
- Error handling / rollback / partial outputs: save result stands when the refresh fails (2.2 handler returns `true`, variables applied; 2.3 saved profile after recovery).
- Legacy compatibility / examples: `getSessionUser` and root bootstrap untouched; upstream components changed only at call sites.

Not selected:

- File IO, schema, resource limits, release/packaging, config, documentation (no user-facing doc covers this flow).
