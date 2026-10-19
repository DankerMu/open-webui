## Context

Change surface: `scripts/smoke.sh` (invoked by `make smoke` from the repository root). Tests: `backend/open_webui/test/test_harness_seed.py` (`make test-harness-seed`), whose `harness` fixture copies `Makefile`, `scripts/seed.sh`, `scripts/smoke.sh` and `smoke/` into a temporary workspace and replaces `curl`/`hurl` and helpers with a recording receiver.

## Decisions

- At the top of `smoke.sh`: derive the script directory with builtins (`case`/`${BASH_SOURCE[0]%/*}`, `.` for a bare name), then `CDPATH='' cd -- "$smoke_dir/.."` and `source scripts/seed.sh`. Builtins because an external `dirname` failing inside `$(…)` (PATH-restricted harness cases) silently yields `/`; `CDPATH=` because `scripts/..` is otherwise looked up through an exported CDPATH (printing into `$(…)` or binding to a foreign checkout); `--` for paths starting with `-`. One root serves both the seed source and the fixture glob, which also fixes the bare-name case.
- Not `git rev-parse --show-toplevel`: the seed-harness workspace is not a git checkout, and the script's own location is the authority for "the checkout's fixtures".
- Not repository-rooted fixture paths without `cd` (the issue's alternative): any other relative Hurl input would stay caller-relative.
- The `cd` happens before `seed_begin`, so credentials are never resolved while the cwd is foreign.

Must preserve: `make smoke` behavior; seed/smoke credential precedence, private 0600/0700 transport and cleanup (existing harness-seed-transport requirements and tests); Hurl arguments other than fixture selection; `scripts/smoke-stub.sh` untouched.

Governing invariant: smoke passes Hurl only the top-level `smoke/*.hurl` of the repository containing the invoked script, whatever the caller's working directory.

Sibling surfaces: `scripts/seed.sh` (sourced; resolves no fixtures), `scripts/smoke-stub.sh` (already anchored), `scripts/smoke-proxy.py` (separate harness, own root), Makefile `smoke` target (consumer).

## Seams and Evidence

- Test plumbing: the `_RECEIVER` hurl branch additionally records `cwd` (`os.getcwd()`) and the raw `args` (safe: the existing `exposed` check proves the password is absent from argv). `launch()` gains a `cwd` parameter defaulting to the workspace. Fixture operands = args that do not start with `--` and are not the value following `--variable`, `--secret`, `--variables-file` or `--secrets-file` (`--test` takes no value).
- Foreign case: foreign directory at `tmp_path/'foreign'` (outside the workspace and the `TMPDIR` scratch, so the scratch-cleanliness check is unaffected) containing `smoke/foreign.hurl`; run `bash <workspace>/scripts/smoke.sh` with cwd = foreign. Expected: exit 0; `{Path(recorded_cwd, op).resolve()}` equals `{p.resolve() for p in workspace.glob('smoke/*.hurl')}` (api, health, ocu-auth-anon) and nothing resolves under the foreign directory (compare resolved paths: logical `pwd` vs physical `getcwd` differ on macOS); credential inputs private; scratch clean. Red before: exit 0 but the operand resolves to `foreign/smoke/foreign.hurl` — the recorded operands/cwd are the red signal.
- CDPATH case: Make form (`bash scripts/smoke.sh`, cwd = workspace) with `CDPATH='.'` and with `CDPATH=<foreign>` where `<foreign>/scripts/` exists → exit 0, same expected selection.
- Every recorded curl/hurl row carries `cwd`, asserted equal to the resolved workspace (pins "before resolving credentials or starting Hurl").
- Bare-name case: cwd = `<workspace>/scripts`, `bash smoke.sh` → same expected selection. Red before for a different reason: `${BASH_SOURCE[0]%/*}` has no slash, sourcing `smoke.sh/seed.sh` fails and the script exits nonzero.
- Existing smoke/seed transport cases keep passing unchanged.
- Real: `make dev-bg`, `make smoke` exit 0 (3 files), `make dev-stop`. Commands: `make test-harness-seed`, `make lint-scoped`, `make doc-gate`.

Non-goals: changing the Make target, seed transport, Hurl contracts, smoke-stub.

Review focus: `cd` precedes credential resolution and Hurl; selection proven against a foreign `smoke/` dir; transport privacy and cleanup unchanged.
