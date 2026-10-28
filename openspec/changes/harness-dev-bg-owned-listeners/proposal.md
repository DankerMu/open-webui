## Why

(#667.) On the owner's workstation (2026-10-27), `make dev-stop` killed another project's Vite dev server that listened on 5173.

`scripts/dev-bg.sh` at `main` `97d96a6`:

- **`stop_one` (`:27-46`).** After killing the pidfile's process group, it sweeps the port. `listeners` (`:25`, `lsof -tiTCP:$port -sTCP:LISTEN`) returns every listener, and they are killed, escalating to `kill -9` after 5 s. Nothing checks that a listener belongs to this checkout's harness. The sweep exists because `uv run` / `npx` can re-spawn the real server outside the tracked process group (`:35-37`).
- **`start` (`:50-67`).** It never checks who holds the ports.
  - If a foreign server on `BACKEND_PORT` answers `/health`, the readiness loop (`:54-58`) reports "backend ready" against it.
  - Vite runs with `--strictPort`, so a held `FRONTEND_PORT` fails with an exit, but only after the backend has started.
- **`status` (`:69-73`).** It reports "health: OK" for any server answering on `BACKEND_PORT`. `make smoke` runs `dev-bg.sh status || dev-bg.sh start` (`Makefile:156-157`), so it can smoke-test a foreign server.

## What Changes

**Ownership test.**

- A listener is **owned** when its working directory, read with `lsof -a -p <pid> -d cwd -Fn` and resolved with `pwd -P`, is this checkout's `repo_root` or lies below it. The harness backend runs in `backend/` and Vite in the repository root, and their re-spawned children inherit that.
- Every other listener is **foreign**, including a dev server of another worktree of this repository.
- An unreadable working directory counts as foreign: never kill what cannot be attributed.

**`stop`.**

- It still kills the pidfile's process group, as today.
- The port sweep kills only owned listeners, with the same escalation.
- Foreign listeners are left running. For each, stderr gets one line naming the port, pid and command (`ps -o command= -p <pid>`).
- `stop` succeeds (exit 0) when no owned listener remains, even if a foreign one does.
- It fails, as today, when an owned listener survives the escalation.

**`start`.** Before staging or starting anything, it checks both ports.

- An owned listener whose pidfile is alive is the existing "already running" case.
- Any foreign listener refuses the start: exit 1, with a message naming the port, pid and command, and nothing started.
- An owned orphan, with no live pidfile, is swept the way `stop` sweeps.

**`status`.**

- If `BACKEND_PORT` is held by a foreign listener, it reports `health: foreign listener on <port> (pid <pid>)` and exits 1, so `make smoke` starts nothing against it.
- If the port is free, it then fails to start the harness on its own, as today.

**Docs.**

- `AGENTS.md` `## Runtime Lifecycle` gains one bullet: dev-bg stops and trusts only processes this checkout started, and a foreign listener on 8080 or 5173 makes `make dev-bg` refuse.
- `make doc-gate` passes.

## Capabilities

### Modified Capabilities

- `harness-environment`: one added requirement, for the harness lifecycle touching only listeners this checkout owns.

## Impact

- `scripts/dev-bg.sh`.
- `scripts/test-guardrails.sh` gains a dev-bg ownership case (design evidence a–e).
- `AGENTS.md`.
- Callers:
  - `make dev-bg`, `dev-stop`, `dev-status`, `smoke` (`Makefile:43-53`, `:156-157`);
  - `scripts/dev-bg.sh stage`, unchanged.
- Non-goals:
  - changing ports;
  - the isolated UI verification stacks (`verify-ui-ocu*` use their own launchers and ports);
  - Windows.

## Fixture

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded: shared CLI entrypoint used by every agent; it kills processes
Blast radius: killing an unrelated process; refusing a healthy harness; smoke testing a foreign server
Selected risk packs: Public API / CLI / script entry (dev-bg start/stop/status and make targets); Concurrency / shared state / ordering (other worktrees and projects sharing ports); Error handling / rollback / partial outputs (refuse before starting anything; stop leaves foreign processes); Legacy compatibility (owned orphans still swept; stop/start of the harness unchanged); Documentation (AGENTS.md Runtime Lifecycle)
Not selected: Auth / secrets (none); Schema (none); File IO (pidfiles unchanged); Resource limits (none); Release packaging (harness only)
Evidence floor: make test-guardrails with the new dev-bg case (red on main for a and b); make doc-gate; bash -n scripts/dev-bg.sh
design.md: present
```
