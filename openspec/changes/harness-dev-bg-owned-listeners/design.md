## Design

Change surface:

- `scripts/dev-bg.sh`:
  - an ownership helper;
  - the `lsof` requirement;
  - `stop_one`, covering both the pidfile kill and the sweep;
  - a port preflight in `start`;
  - `status`.
- `scripts/test-guardrails.sh`: a new numbered case.
- `AGENTS.md` `## Runtime Lifecycle`.

Must preserve:

- `start` / `stop` / `status` / `logs` / `stage` usage and exit codes on a machine running only the harness.
- Killing the process group of a live, owned pidfile.
- Sweeping owned re-spawned servers (`uv run`, `npx`), with escalation to SIGKILL.
- `stop` failing when an owned listener survives.
- `scripts/dev-env.sh` validation.
- `BACKEND_PORT` / `FRONTEND_PORT` overrides.
- `make smoke`, `make verify-ui` and the Playwright `webServer` when the harness runs.
- CI layer 3 `make dev-bg` / `make dev-stop` on ubuntu (`ci.yml:124`, `:156`).
- `dev-bg.sh stage` for `scripts/verify-ui-ocu.py:517`.

Must add/change: see proposal "What Changes".

Governing invariant: dev-bg sends a signal only to a process whose working directory resolves to this checkout's repository root. It never reports or uses as healthy a server it did not start.

Sibling surfaces: the callers listed in proposal Impact. The grep result is stated there: no other script kills by port.

Seams under test: `scripts/test-guardrails.sh` already creates a detached worktree `$wt`, copies `scripts/` from the working tree into it and `cd`s there (`:8-30`). The new case runs inside it:

- `dev-bg.sh` resolves `repo_root=$wt`, and pidfiles land in `$wt/.run/`.
- Staging needs only the tracked `static/static`.
- The case unsets any inherited `DATA_DIR` / `FRONTEND_BUILD_DIR`, so `dev-env.sh` validates its defaults.
- It uses free high ports chosen at run time through `BACKEND_PORT` / `FRONTEND_PORT`, never 8080 or 5173.
- `dev-bg.sh` gains no test-only knob.

Stand-ins:

- **Foreign, outside a repository:** a Python HTTP server whose working directory is a sibling directory sharing a string prefix with `$wt`, e.g. `"$wt-foreign"`. That proves the match is not a string prefix. For evidence b and e it serves a directory that contains a file named `health`, so `/health` returns 200. In b this also lets `main` pass backend readiness quickly instead of syncing a real venv.
- **Foreign, in a nested repository:** the same server, with its working directory in `git init -q "$wt/.run/nested"`. This exercises the toplevel comparison.
- Every stand-in, foreign or owned, leads its own process group (`set -m` or `os.setsid()`), because a red run on `main` sends `kill -- -$pgid` to whatever pid a pidfile holds (evidence f).
- **Owned:** a Python HTTP server with its working directory under `$wt/.run/`. It leads its own process group (`set -m`, as `start_one` does, or `os.setsid()` in Python; macOS has no `setsid(1)`), so a group kill can never reach the test script. For evidence d it is recorded in `$wt/.run/frontend.pid`, with a child that holds the port.
- The case kills only the stand-ins it started, in a trap. A real `uv run` / `npx` that a red run on `main` starts inside `$wt` is bounded and cleaned up by the case.

Required evidence:

- a. **Stop leaves a foreign listener.** With a foreign listener on the test's frontend port and no harness running, `dev-bg.sh stop`:
  - leaves it alive (`kill -0`);
  - prints a line naming the port, pid and command;
  - exits 0 within a few seconds, with no 10 s wait.

  Red on `main`: the listener is killed.

- a2. **Stop leaves a nested-repository listener.** The same holds for the nested-repository stand-in. Red on `main`: it is killed.

- b. **Start refuses a foreign listener.** With a foreign listener on the test's backend port, `dev-bg.sh start`:
  - exits 1 naming the port, pid and command;
  - creates no `$wt/.run/backend.pid`, `frontend.pid` or `$wt/.run/frontend-build`.

  Red on `main`: it creates them and does not name the listener. `main` also exits 1, for other reasons, so the exit code alone is not the red signal.

- c. **Owned orphan swept.** An owned listener without a pidfile is killed by `stop`, which exits 0 with the port free.
- d. **Owned process group stopped.** An owned group recorded in the pidfile, with a child holding the port, is fully stopped: parent and child are gone.
- e. **Status refuses a foreign server.** A foreign listener answering 200 on `/health` on the test's backend port makes `status` exit 1 with `health: foreign listener …`. Red on `main`: it prints `health: OK` and exits 0. With a foreign listener on the frontend port alone, `status` prints `health: foreign listener on <frontend port>`. The backend is down in that case, so the exit code proves nothing; the message is the assertion.
- f. **Stale pidfile.** `$wt/.run/backend.pid` holds the pid of a live foreign stand-in. `stop` removes the pidfile, reports it as stale, and leaves the stand-in alive.
- g. **Missing `lsof`.** A temporary bin directory links only the tools `dev-bg.sh` needs (`git`, `ps`, `cat`, `mkdir`, `rm`, `cp`, `tr`, `seq`, `sleep`, `tail`, `curl` and whatever else it calls), with no `lsof`. With `PATH` set to that directory alone and bash invoked by absolute path:
  - `dev-bg.sh stop` exits 2 naming `lsof` and signals nothing;
  - `dev-bg.sh stage` still succeeds.
- h. `make doc-gate` passes, and `bash -n scripts/dev-bg.sh` passes.

Linux evidence comes from CI layer 3 on the PR (`ci.yml:124`, `:156`: a real `make dev-bg` / `make dev-stop` on ubuntu-latest) and from the `guardrail-self-test` job of `agents-md-liveness.yml:29-42`, dispatched on the PR branch. PR CI itself does not run `test-guardrails`.

Non-goals: see proposal Impact.

Review focus:

- No code path signals a process unless it passes the ownership test, including the pidfile kill.
- An unreadable working directory, or one outside a repository, counts as foreign. Nested and prefix-sharing worktrees count as foreign.
- `start` refuses before staging. `status` checks both ports.
- The test never uses 8080/5173 or the real pidfiles, puts stand-ins in their own groups, and kills only what it started.
- macOS and Linux behave the same (`lsof` cwd output, physical paths).
