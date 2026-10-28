## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review; `openspec validate harness-dev-bg-owned-listeners --strict --no-interactive`.

## 2. Risk packs

- **Public API / CLI / script entry** — selected: `dev-bg.sh` start/stop/status and the make targets. Evidence a, b, e.
- **Concurrency / shared state / ordering** — selected: other projects and worktrees sharing ports. Evidence a, b.
- **Error handling / rollback / partial outputs** — selected: refuse before starting anything; stop leaves foreign processes. Evidence a, b.
- **Legacy compatibility** — selected: owned orphans swept; owned process groups stopped. Evidence c, d.
- **Documentation** — selected: AGENTS.md Runtime Lifecycle bullet; doc-gate. Evidence f.
- **Auth / secrets, Schema, File IO, Resource limits, Release packaging** — not selected: none touched.

## 3. Implement

- [ ] 3.1 Test first: the dev-bg case in `scripts/test-guardrails.sh` for evidence a–e. Record a and b red on `main`.
- [ ] 3.2 `scripts/dev-bg.sh`: ownership helper, owned-only sweep, start preflight, status check.
- [ ] 3.3 `AGENTS.md` Runtime Lifecycle bullet.
- [ ] 3.4 Green:
  - `make test-guardrails`;
  - `make doc-gate`;
  - `bash -n scripts/dev-bg.sh`;
  - `make lint-scoped` if it covers shell;
  - a real `make dev-bg` / `make dev-status` / `make dev-stop` round trip on the default ports, by the orchestrator only, when no other harness of this checkout is running.
