## Why

`scripts/smoke-stub.sh`, `scripts/verify-office.sh` and `scripts/proxy-dev.sh` derive their checkout root with `$(cd "$(dirname …)/.." && pwd)` (#536). This breaks in three ways:

- **Exported `CDPATH`.** A relative `cd` consults `CDPATH` and echoes the matched directory, so the captured root becomes a two-line path. `make smoke-stub` and direct `proxy-dev.sh` then fail on a nonexistent path. `make verify-office` reports a false "missing Office Python interpreter".
- **`dirname` fails.** The substitution is empty and the root silently resolves to `/`.
- **Path starts with `-`.** A path beginning with `-` is parsed as an option by an unguarded `cd`.

`proxy-dev.sh:55` derives `config_abs` the same way from `OCU_CHECKOUT`, which may be relative. `scripts/smoke.sh` already uses the fixed form (#454 / PR #535).

## What Changes

- Each of the three scripts derives its script directory with parameter expansion: `${BASH_SOURCE[0]%/*}`, or `.` when the path has no slash. It then resolves the root with `CDPATH='' cd -- "<dir>/.." && pwd` (or `<dir>` for `proxy-dev.sh`'s `script_dir`), the same idiom as `scripts/smoke.sh`.
- `proxy-dev.sh` derives the config directory and file name with builtins in both places: the `config_abs` line and the `config_base` line. That line uses `basename`, the same external-tool failure class.
- A new backend test module, `backend/open_webui/test/test_harness_script_root.py`, runs the real scripts as copies inside an isolated tmp checkout, with recording stand-ins. It is collected by `make test-backend` and CI layer2.

## Capabilities

### Modified Capabilities

- `harness-environment`: adds the requirement that the harness entry scripts resolve their own checkout root whatever the caller's `CDPATH` or `PATH`.

## Impact

Files changed:

- `scripts/smoke-stub.sh`
- `scripts/verify-office.sh`
- `scripts/proxy-dev.sh`
- the new `backend/open_webui/test/test_harness_script_root.py`
- `Makefile`, which gains the `test-harness-script-root` target

`proxy-dev.sh`'s `config_base` line (`basename`) is outside the issue's listed lines. It is in scope because a restricted `PATH` would otherwise fail there first.

Unchanged:

- `scripts/smoke.sh` (already fixed)
- `scripts/generate-sbom.sh`, an upstream file under the minimal-diff rule. Report only; it is not touched.
- scripts that use `git rev-parse --show-toplevel`
- Makefile invocations
- every behavior after the root is derived

## Triage

- Issue type: bugfix
- Fixture level: standard. This is a local harness-entry usability fix on three script preambles; there is no data, auth or production path.
- Upstream suggested level: absent
- Blast radius: local `make smoke-stub` / `make verify-office` / `proxy-dev.sh` failing, or anchoring at `/`, under a caller `CDPATH` or a broken `dirname`.
- Selected risk packs: Public API / CLI / script entry; File IO / path safety (root anchoring).
- Evidence floor:
  - `make test-harness-script-root` (a new target), red before the script change and green after;
  - `make smoke-stub` and `make test-smoke-stub-cleanup` unchanged without `CDPATH`;
  - `make lint-scoped`, `make doc-gate`.
