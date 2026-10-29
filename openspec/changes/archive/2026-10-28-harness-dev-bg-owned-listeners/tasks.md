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

- [x] 3.1 Test first: the dev-bg case in `scripts/test-guardrails.sh` for evidence a, a2 and b–g, plus i–k after review round 1, inside the existing `$wt` worktree. Record a, a2, b, e, f and g red on `main`. Evidence: `main`'s script 23 passed / 7 failed (10a, 10a2, 10b, 10e ×2, 10f, 10g); 10i, 10j, 10k red on the round-1 script (30/3). Accepted gap: no guardrail case fails if readiness drops the owned-listener check; it is covered by review and CI layer 3.
- [x] 3.2 `scripts/dev-bg.sh`: ownership helper (git toplevel of the listener's cwd), lsof requirement, owned-only pidfile kill and sweep, start preflight before staging, status check of both ports; owned-listener requirement for health and readiness; leader-only group kill; worse-of-two stop exit (review round 1).
- [x] 3.3 `AGENTS.md` Runtime Lifecycle bullet.
- [x] 3.4 Green:
  - `make test-guardrails`;
  - `make doc-gate`;
  - `bash -n scripts/dev-bg.sh`;
  - `make lint-scoped` if it covers shell;
  - a real `make dev-bg` / `make dev-status` / `make dev-stop` round trip on the default ports, by the orchestrator only, when no other harness of this checkout is running.

  Evidence: `make test-guardrails` 33/0 locally (through an uncommitted lsof shim that excludes wedged foreign `bfs` processes from port scans) and 31/0 on Linux (Guardrail self-test on the PR); `make doc-gate` exit 0; `bash -n` and `shellcheck -x` clean; `make lint-scoped` does not cover shell. Round trip: on the default ports `make dev-bg` refused naming the foreign vite on 5173 (pid 35934), `dev-status` exited 1 naming it, `dev-stop` left it running; on free ports start, status (`health: OK`) and stop all succeeded with no pidfile or listener left. CI layer 3 runs the real `make dev-bg` / `make dev-stop` on ubuntu-latest.
