## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review; `openspec validate harness-dev-bg-owned-listeners --strict --no-interactive`.

## 2. Risk packs

- **Public API / CLI / script entry** — selected: `dev-bg.sh` start/stop/status and its make, Playwright and CI callers. Evidence a, b, e, g.
- **Concurrency / shared state / ordering** — selected: other projects and worktrees sharing ports; stale pidfiles. Evidence a, b, f.
- **Error handling / rollback / partial outputs** — selected: refuse before staging; stop leaves foreign processes; a missing lsof fails loud. Evidence a, b, g.
- **Legacy compatibility** — selected: owned orphans swept; owned process groups stopped; CI layer 3 dev-bg/dev-stop. Evidence c, d, and the CI run.
- **Documentation** — selected: AGENTS.md Runtime Lifecycle bullet; doc-gate. Evidence h.
- **Auth / secrets, Schema, File IO, Resource limits, Release packaging** — not selected: none touched.

## 3. Implement

- [ ] 3.1 Test first: the dev-bg case in `scripts/test-guardrails.sh` for evidence a–g, inside the existing `$wt` worktree. Record a, b, e, f and g red on `main`.
- [ ] 3.2 `scripts/dev-bg.sh`: ownership helper (git toplevel of the listener's cwd), lsof requirement, owned-only pidfile kill and sweep, start preflight before staging, status check of both ports.
- [ ] 3.3 `AGENTS.md` Runtime Lifecycle bullet.
- [ ] 3.4 Green:
  - `make test-guardrails`;
  - `make doc-gate`;
  - `bash -n scripts/dev-bg.sh`;
  - `make lint-scoped` if it covers shell;
  - a real `make dev-bg` / `make dev-status` / `make dev-stop` round trip on the default ports, by the orchestrator only, when no other harness of this checkout is running.
