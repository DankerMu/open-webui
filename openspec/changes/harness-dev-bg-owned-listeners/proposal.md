## Why

(#667.) On the owner's workstation (2026-10-27), `make dev-stop` killed another project's Vite dev server listening on 5173.

`scripts/dev-bg.sh` at `main` `97d96a6`:

- **`stop_one` (`:27-46`).**
  - It kills the pidfile's process group (`:30-33`) without checking that the recorded pid is still a harness process. A stale pidfile whose pid was reused would kill another group.
  - It then sweeps the port. `listeners` (`:25`, `lsof -tiTCP:$port -sTCP:LISTEN … || true`) returns every listener, and each one is killed, escalating to `kill -9` after 5 s (`:39-43`). Nothing checks ownership. The sweep exists because `uv run` / `npx` can re-spawn the real server outside the tracked process group (`:36-38`).
  - The `|| true` also makes a missing or failing `lsof` read as "port free".
- **`start` (`:50-67`).** It stages frontend assets (`:51`) and never checks who holds the ports.
  - A foreign server answering `/health` on `BACKEND_PORT` passes the readiness loop (`:54-59`) as "backend ready".
  - A foreign server answering on `FRONTEND_PORT` passes too: `:63` curls the port before the `alive` check at `:64`, so the command prints "frontend ready" and exits 0 even though Vite died on `--strictPort`.
- **`status` (`:69-73`).** It reports "health: OK" for any server on `BACKEND_PORT`. Three callers start the harness only when `status` fails, so each can run against a foreign server:
  - `make smoke` (`Makefile:156-157`);
  - `make verify-ui` (`Makefile:177`);
  - Playwright's `webServer` (`playwright.config.ts:22`, `reuseExistingServer: true`).

## What Changes

**Ownership test.**

- A process is **owned** when `git -C <cwd> rev-parse --show-toplevel` equals this checkout's `repo_root`. Its working directory comes from `lsof -a -p <pid> -d cwd -Fn`.
- Both sides are physical paths: `git rev-parse` already resolves symlinks such as `/private/tmp`.
- Every other process is **foreign**, including:
  - a server of another worktree, sibling or nested (`.claude/worktrees/*`, CI's `.run/open-computer-use` checkout);
  - a process whose working directory is not in a git repository or cannot be read.
- The harness's own processes pass:
  - uvicorn runs in `backend/` (`sh -c "cd backend && exec uv run …"`);
  - Vite runs in the repository root (`exec npx …`);
  - their re-spawned children inherit the working directory, and neither code base calls `chdir`.
- **Accepted false positive:** a developer's own `make dev` / `npm run dev` started from this checkout counts as owned and is stopped, as today.

**`lsof` is required.** If `command -v lsof` fails, dev-bg exits 2 naming `lsof`, before doing anything (AGENTS.md: misconfiguration fails loud).

**`stop`.**

- The pidfile's process group is killed only when the recorded pid passes the ownership test.
- A stale pidfile is removed with a message, and nothing is signalled.
- The port sweep kills only owned listeners, with the same escalation. It ends as soon as no owned listener remains, so a foreign holder does not cost a 10 s wait.
- Foreign listeners are left running. For each, stderr gets one line naming the port, pid and command (`ps -o command= -p <pid>`).
- `stop` exits 0 when no owned listener remains. As today, it fails when an owned listener survives the escalation.

**`start`.** Before staging or starting anything, it checks both ports.

- A port held by an owned listener whose pidfile is alive is the existing "already running" case.
- Any foreign listener refuses the start: exit 1, with a message naming the port, pid and command. Nothing is staged (no `.run/frontend-build`) and nothing is started.
- An owned orphan, with no live pidfile, is swept the way `stop` sweeps.

**`status`.** If either `BACKEND_PORT` or `FRONTEND_PORT` is held by a foreign listener, it reports `health: foreign listener on <port> (pid <pid>)` and exits 1. Its three callers then attempt `start`, and the preflight refuses.

**Docs.**

- `AGENTS.md` `## Runtime Lifecycle` gains one bullet: dev-bg stops and trusts only processes this checkout started, and a foreign listener on 8080 or 5173 makes `make dev-bg` refuse.
- `make doc-gate` passes.

## Capabilities

### Modified Capabilities

- `harness-environment`: one added requirement, for the development lifecycle touching only listeners this checkout owns.

## Impact

- `scripts/dev-bg.sh`.
- `scripts/test-guardrails.sh` gains a dev-bg ownership case (design evidence a–e).
- `AGENTS.md`.
- Callers:
  - `make dev-bg`, `dev-stop`, `dev-status`, `logs` (`Makefile:43-53`);
  - `make smoke` (`:156-157`) and `make verify-ui` (`:177`);
  - Playwright `webServer` (`playwright.config.ts:22`);
  - CI layer 3 `make dev-bg` / `make dev-stop` on Linux (`.github/workflows/ci.yml:124`, `:156`);
  - `scripts/verify-ui-ocu.py:517`, through `dev-bg.sh stage` with `workspace-ui-*` paths. Staging is unchanged.
- Sibling grep result: the only `lsof` user in `scripts/`, `Makefile`, `e2e/` and `.github/` is `dev-bg.sh:25`.
  - `smoke_proxy_support.kill_tree` (`scripts/smoke_proxy_support.py:213-228`) signals only its own process group.
  - `scripts/seed.sh:12-17` kills only its own child.
  - No other script kills by port.
- Non-goals:
  - changing ports;
  - the isolated UI verification stacks;
  - Windows.

## Fixture

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded: shared CLI entrypoint used by every agent; it kills processes
Blast radius: killing an unrelated process; refusing a healthy harness; smoke or UI tests running against a foreign server
Selected risk packs: Public API / CLI / script entry (dev-bg start/stop/status and its make, Playwright and CI callers); Concurrency / shared state / ordering (other worktrees and projects sharing ports; stale pidfiles); Error handling / rollback / partial outputs (refuse before staging; stop leaves foreign processes; missing lsof fails loud); Legacy compatibility (owned orphans still swept; CI dev-bg/dev-stop unchanged); Documentation (AGENTS.md Runtime Lifecycle)
Not selected: Auth / secrets (none); Schema (none); File IO (pidfile locations unchanged); Resource limits (none); Release packaging (harness only)
Evidence floor: make test-guardrails with the new dev-bg case (a, b, e red on main), locally and on Linux in PR CI (ci.yml guardrail-self-test); make doc-gate; bash -n scripts/dev-bg.sh
design.md: present
```
