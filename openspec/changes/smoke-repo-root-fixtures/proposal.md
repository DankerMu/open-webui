## Why

`scripts/smoke.sh` sources `seed.sh` relative to the script but passes the unanchored `smoke/*.hurl` glob to Hurl together with the seeded-credentials secrets file (#454). Bash expands the glob in the caller's working directory, so `bash /abs/path/scripts/smoke.sh` from elsewhere can fail to find the repository fixtures or run a foreign directory's `smoke/*.hurl` with the harness credentials. `make smoke` runs from the repository root and is unaffected.

## What Changes

- `scripts/smoke.sh` derives the repository root from its own path (same idea as `scripts/smoke-stub.sh`), changes to it, and sources `seed.sh` from there, before any credential is resolved or Hurl runs. Hurl then receives only the checkout's top-level `smoke/*.hurl`, and every other relative Hurl input is repository-relative.
- Extend `backend/open_webui/test/test_harness_seed.py`: invoking the copied `smoke.sh` by absolute path from a foreign directory that has its own `smoke/*.hurl` runs only the checkout's fixtures (recorded Hurl argv/cwd), and credential transport stays private.

## Capabilities

### Modified Capabilities

- `harness-seed-transport`: smoke fixture selection is bound to the script's repository.

## Impact

`scripts/smoke.sh` and its seed-harness tests. No change to the Make target, seed/secret transport, Hurl request contracts or `scripts/smoke-stub.sh`.

## Triage

- Issue type: bugfix
- Fixture level: expanded — script entrypoint that hands harness credentials to Hurl.
- Upstream suggested level: absent
- Blast radius: smoke sends the seeded credentials to requests from a foreign fixture set, or `make smoke` stops finding its fixtures.
- Selected risk packs: Public API / CLI / script entry; Auth / permissions / secrets; File IO / path safety; Legacy compatibility
- Evidence floor: `make test-harness-seed` (new case red before, green after), `make smoke` against `make dev-bg`, `make lint-scoped`, `make doc-gate`
