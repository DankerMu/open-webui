## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review and strict validation before implementation.

## 2. Implement

- [x] 2.1 Add failing cases to `test_harness_seed.py` first per design.md Seams: receiver records `cwd` on every row and Hurl's raw `args`; `launch()` takes `cwd`; foreign dir at `tmp_path/'foreign'` with `smoke/foreign.hurl`; absolute-path invocation from it, bare-name invocation from `<workspace>/scripts`, and Make-form invocation under `CDPATH=.` and `CDPATH=<foreign>` (fix pass 1); resolved fixture operands equal exactly the workspace `smoke/*.hurl` set, none under foreign; every curl/hurl row's cwd is the workspace; private credential inputs; clean scratch.
- [x] 2.2 Anchor `scripts/smoke.sh` to its repository root (derive from the script path, `cd`, source `scripts/seed.sh`) before `seed_begin`, with a comment naming the failure mode.

## 3. Verify

- [x] 3.1 `make test-harness-seed` (red before 2.2, green after; existing cases unchanged), `make dev-bg` + `make smoke` exit 0 + `make dev-stop`, `make lint-scoped`, `make doc-gate`.

## Risk packs

Selected:

- Public API / CLI / script entry: 2.1 absolute-path and bare-name invocations; 3.1 `make smoke`.
- Auth / permissions / secrets: 2.1 asserts credential inputs stay private and scratch is clean; foreign fixtures never receive the secrets file.
- File IO / path safety / overwrite: 2.1 proves fixture selection is bound to the script's repository against a foreign `smoke/` directory.
- Legacy compatibility / examples: existing seed/smoke transport cases unchanged; Make invocation unchanged.

Not selected:

- Config, schema, concurrency, resource limits, release/packaging, error handling (exit codes unchanged; `cd` failure exits nonzero before credentials), documentation (no user doc describes standalone smoke invocation).
