## Design

Change surface:

- `scripts/dev-bg.sh`:
  - an ownership helper;
  - `stop_one`;
  - a port preflight in `start`;
  - `status`.
- `scripts/test-guardrails.sh`: a new numbered case.
- `AGENTS.md` `## Runtime Lifecycle`.

Must preserve:

- `start` / `stop` / `status` / `logs` / `stage` usage and exit codes for a harness-only machine.
- The pidfile process-group kill.
- Sweeping of owned re-spawned servers (`uv run`, `npx`) with escalation to SIGKILL.
- `stop` failing when an owned listener survives.
- `DATA_DIR` / `FRONTEND_BUILD_DIR` validation in `scripts/dev-env.sh`.
- Port overrides through `BACKEND_PORT` / `FRONTEND_PORT`.
- `make smoke` behaviour when the harness runs.

Must add/change: see proposal "What Changes".

Governing invariant: dev-bg signals only processes this checkout started, and never reports or uses as healthy a server it did not start.

Sibling surfaces:

- **Callers of `dev-bg.sh`:**
  - `make dev-bg`, `dev-stop`, `dev-status`, `logs`;
  - `make smoke` (`status || start`);
  - `scripts/dev-bg.sh stage`.
- **Other launchers:** the isolated UI verification launchers run their own ports and cleanup. Grep for other callers of `listeners` or `lsof … LISTEN` in `scripts/` and leave them unchanged unless they kill by port without ownership; if one does, report it.

Seams under test: `scripts/test-guardrails.sh` runs `scripts/dev-bg.sh` against free high ports chosen at run time through `BACKEND_PORT` / `FRONTEND_PORT`, never 8080 or 5173. It uses stand-in listeners:

- a **foreign** listener, e.g. `python3 -m http.server <port>` started with its working directory in a fresh `mktemp -d` outside the repository;
- an **owned** listener started with its working directory under `.run/` of this checkout, plus a child process, recorded in a pidfile copy the test points dev-bg at, or left as an orphan without a pidfile.

The test must not touch the developer's real `.run/backend.pid` / `.run/frontend.pid`.

- Either the pidfile paths become overridable for the test only, through an environment variable, defaulting to today's paths;
- or the test copies the checkout tree to a scratch location. That copy is the owned root, so the stand-ins run under it.

The implementer picks one and states it. The test kills only the stand-ins it started.

Required evidence:

- a. **Stop leaves a foreign listener.** With a foreign listener on the test's frontend port and no harness running, `dev-bg.sh stop`:
  - leaves it alive (`kill -0`);
  - prints a line naming the port, pid and command;
  - exits 0.

  Red on `main`: the foreign listener is killed.

- b. **Start refuses a foreign listener.** With a foreign listener on the test's backend port, `dev-bg.sh start`:
  - exits 1 with a message naming the port, pid and command;
  - starts no backend or frontend (no new pidfile, nothing new on the other port).

  Red on `main`: it does not refuse.

- c. **Owned orphan swept.** An owned listener without a pidfile is killed by `stop`, which exits 0 with the port free.
- d. **Owned process group stopped.** An owned process group recorded in the pidfile, with a child holding the port, is fully stopped (parent and child gone).
- e. **Status refuses a foreign backend.** A foreign listener on the test's backend port answering `/health` makes `status` exit 1 with `health: foreign listener …`.
- f. `make doc-gate` passes, and `bash -n scripts/dev-bg.sh` passes.

Non-goals: see proposal Impact.

Review focus:

- No code path signals a process without the ownership test passing.
- An unreadable working directory counts as foreign.
- `start` refuses before staging or starting anything.
- The test never uses 8080/5173 or the real pidfiles, and kills only what it started.
- It works on macOS and Linux: `lsof` cwd output, and `pwd -P` for `/private` symlinks.
