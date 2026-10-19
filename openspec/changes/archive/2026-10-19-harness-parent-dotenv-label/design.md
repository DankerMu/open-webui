## Context

Change surface: `scripts/dev-env.sh` (sourced by `scripts/dev-bg.sh`, `scripts/verify-ui-ocu.py` backend command, `scripts/smoke_proxy_resources.py` short-session command). Tests: `backend/open_webui/test/test_harness_environment.py` (`make test-harness-env`), whose `_import_environment(harness=True, parent_flag=…)` already sources `dev-env.sh` and captures stderr.

## Decisions

- Classification, before `export PYTHON_DOTENV_DISABLED=1`: unset → `unset`; exactly `false` → `false`; exactly `1` → `1`; anything else (including empty, `true`, `0`, mixed case) → `other`. Exact-string labels avoid re-implementing python-dotenv's truthiness table; `other` never echoes the value.
- Output: one line on stderr, `harness-env: parent PYTHON_DOTENV_DISABLED=<label>`. stderr keeps stdout-parsing consumers unaffected; receipts already keep stderr per entry.
- Label semantics: each sourcing labels the parent of the command that sources it — the environment `dev-env.sh` is constructing for that command. `status`/`stop`/`logs`/`stage` and `start` with a backend already running label their own invocation, not the parent of a backend started earlier; a make target that sources several times carries one line per sourcing.
- Consumer construction fixes some labels: `dev-bg.sh` reflects the orchestrator's real parent; `verify-ui-ocu.py` builds its service env without the flag, so it always reports `unset`; `smoke_proxy_resources.py` hard-sets `1`. A UI `unset` is a property of that runner, not proof of the orchestrator's environment.
- `verify-ui-ocu.py` relays `harness-env:` lines from its captured `dev-bg.sh stage` stderr to its own stderr (forwarding only; no Python re-implementation of the classification). Its backend's own sourcing line stays in the scratch backend log.
- AC2 mapping: the label is computed from the live inherited value by the same tracked step that constructs the child environment, so the tracked `dev-env.sh` plus the captured line is the env-construction evidence; no observer inference.
- No receipt schema or producer is added. Residual risk: receipts are assembled by ad hoc runners; the label reaches a receipt only if the runner keeps per-command stderr (the #419 entries do).

Must preserve: `verify-ui-ocu.py` behavior apart from the relayed line; the export of `PYTHON_DOTENV_DISABLED=1` and every other `dev-env.sh` export/guard unchanged; `dev-bg.sh` status/start/stop exit codes and stdout; consumers that capture `dev-env.sh` output keep working.

Governing invariant: the parent flag label is derived from the inherited value at the override point, before the override, and only from the allowlist.

Sibling surfaces: `scripts/verify-office.sh` and `scripts/db-reset.sh`/`db-verify.sh` also set the flag but are not harness-runtime receipt launchers in #452's scope (non-goal). Consumers to audit for stderr parsing / zero-stderr assertions: `scripts/dev-bg.sh` (including `status` used by `make dev-status`, `make smoke`), `scripts/verify-ui-ocu.py`, `scripts/smoke_proxy_resources.py`, `scripts/check-fast.sh`, `e2e/`, `backend/open_webui/test/`.

## Seams and Evidence

- `_import_environment(harness=True, parent_flag=None|'false'|'1'|'secret-ish')` (sources once; extend to return/inspect stderr): stderr contains exactly one `harness-env: parent PYTHON_DOTENV_DISABLED=` line with `unset` / `false` / `1` / `other`; the `other` case's raw value is absent from stdout and stderr; the probe still observes no dotenv load. Red before the change: no such line.
- Relay: a test in `backend/open_webui/test/test_harness_environment.py` (run by `make test-harness-env`) for `verify-ui-ocu.py`'s relay (unit-level, stubbed `run` result containing a `harness-env:` line plus other stderr) asserts only the label line is forwarded to stderr.
- Real launcher: `make dev-bg` with the parent flag unset, `make dev-stop`, then `PYTHON_DOTENV_DISABLED=false make dev-bg`, `make dev-stop`; each run's captured command stderr shows its own label (`unset`, `false`). `make dev-status` and `make smoke` still pass. (The label is not in `.run/backend.log`: `dev-env.sh` is sourced before `start_one` redirects output.)
- Commands: `make test-harness-env` (includes the relay test), `make smoke` (with dev-bg), `make lint-scoped`, `make doc-gate`.

Non-goals: backfilling or rerunning #419 evidence; a receipt schema/generator; other launchers; changing the policy.

Review focus: label derived before override and allowlisted only; no value leak; no consumer breaks from the extra stderr line; label distinct from child flag.
