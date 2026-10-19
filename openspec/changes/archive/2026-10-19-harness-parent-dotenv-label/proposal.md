## Why

Harness runtime receipts cannot show the parent `PYTHON_DOTENV_DISABLED` state a launcher run started from (#452). `scripts/dev-env.sh` exports `PYTHON_DOTENV_DISABLED=1` unconditionally, so the child flag an observer records is `1` for every parent value, and labels such as `dev=false` / `UI=unset` in the #419 evidence rest on the orchestrator's word, not on the receipt.

## What Changes

- Immediately before its override, `scripts/dev-env.sh` classifies the inherited value into an allowlisted label — `unset`, `false`, `1` or `other` — and writes one line to stderr: `harness-env: parent PYTHON_DOTENV_DISABLED=<label>`. The raw value is never echoed. Each sourcing reports the parent state of the command that sources it (one line per sourcing), produced at the point that constructs that command's environment and separately from the child's policy flag.
- `scripts/verify-ui-ocu.py` relays the `harness-env:` line from its captured `dev-bg.sh stage` run to its own stderr, so a receipt for `make verify-ui-ocu` carries the label without reading scratch logs.
- Extend `backend/open_webui/test/test_harness_environment.py` to assert the label for parent unset, `false` and `1`, plus a non-allowlisted value mapped to `other` without leaking it, while the child still receives the disabling policy.

## Capabilities

### Modified Capabilities

- `harness-environment`: the shared harness environment reports the parent flag state it overrides.

## Impact

`scripts/dev-env.sh`, a relay in `scripts/verify-ui-ocu.py`, and their tests. Every `source scripts/dev-env.sh` (dev-bg start/stop/status/logs, `verify-ui-ocu.py`, `smoke_proxy_resources.py`) gains one stderr line; consumers must be confirmed not to parse or forbid stderr. Historical `docs/evidence/issue-419/` is not touched, backfilled or rerun. No change to the policy itself, `env.py`, or any other launcher.

## Triage

- Issue type: bugfix (evidence provenance)
- Fixture level: expanded — shared launcher entrypoint sourced by several harness tools.
- Upstream suggested level: absent
- Home: `scripts/dev-env.sh:30` is the only tracked place where the parent state still exists before it is overwritten; no tracked receipt producer exists (receipts are composed from captured command output), so the launcher self-reports at the override point.
- Blast radius: a harness tool that parses or asserts on `dev-env.sh` stderr breaks; or a label that leaks a non-allowlisted value.
- Selected risk packs: Public API / CLI / script entry; Auth / permissions / secrets; Legacy compatibility; Documentation
- Evidence floor: `make test-harness-env` including the relay test (red before, green after); `make dev-bg` with the parent flag unset and then with `PYTHON_DOTENV_DISABLED=false` (`make dev-stop` between), each run's captured command stderr showing its own label; `make smoke`; `make lint-scoped`; `make doc-gate`
