## Context

Change surface: the root-derivation preambles of `scripts/smoke-stub.sh:5-6`, `scripts/verify-office.sh:4`, and `scripts/proxy-dev.sh:5-6`, plus the config path lines in `proxy-dev.sh`: the `config_base` line and `config_abs` at `:55`.

Reference idiom (`scripts/smoke.sh:10-11`):

```bash
case "${BASH_SOURCE[0]}" in */*) smoke_dir="${BASH_SOURCE[0]%/*}" ;; *) smoke_dir=. ;; esac
CDPATH='' cd -- "$smoke_dir/.." || exit $?
```

Consumers:

- `make smoke-stub` and `make verify-office` call the scripts by relative path.
- `scripts/smoke-proxy.py:766` and `scripts/verify-ui-ocu.py:458` call `proxy-dev.sh` by absolute path.
- A direct `bash scripts/proxy-dev.sh` call uses a relative path.

## Decisions

- **Use the same idiom in every script.** A shared helper file would itself need the root to be sourced, so each script carries one `case` line plus one `cd`/assignment line, matching `smoke.sh`.
- **`smoke-stub.sh`.** Replace lines 5–6 with the idiom: the `case`, then `CDPATH='' cd -- "$dir/.."`, then `repo_root="$PWD"`. `repo_root` is still used later, at `:19` and `:436`.
- **`verify-office.sh`.** Keep its structure: compute `root` before the prerequisite check, then `cd "$root"`. Use `root="$(CDPATH='' cd -- "$dir/.." && pwd)"`. A failing `cd` inside a plain assignment exits under `set -e`, and an empty `CDPATH` suppresses the echo. Make the later `cd "$root"` `CDPATH='' cd -- "$root"` as well. `$root` is absolute, so this only adds `--` for consistency.
- **`proxy-dev.sh`.**
  - `script_dir="$(CDPATH='' cd -- "$dir" && pwd)"`, then `repo_root="$(CDPATH='' cd -- "$script_dir/.." && pwd)"`. `script_dir` is used only to derive `repo_root`; keep the variable to minimize the diff.
  - `config` always contains a slash, because it is built as `$proxy_dir/...`. Use `config_dir="${config%/*}"` and `config_name="${config##*/}"`, then `config_base="$config_name"` and `config_abs="$(CDPATH='' cd -- "$config_dir" && pwd)/$config_name"`.
- **Rejected alternatives.**
  - `unset CDPATH` at the top. It does not fix the `dirname` failure or the `-` paths.
  - `git rev-parse --show-toplevel`. It is based on cwd, not on the script's location, and these scripts must anchor to their own checkout.
  - Touching `generate-sbom.sh`. It is an upstream file.

Must preserve:

- Every line after the root derivation.
- Exit codes and messages of the existing named failures: proxy-dev missing checkout, config or binary (exit 2); the verify-office missing interpreter (exit 1).
- `OFFICE_PYTHON` override.
- `OCU_CHECKOUT` default (`$repo_root/../open-computer-use`).
- Makefile targets.

Governing invariant: each listed script anchors to the checkout that contains it, as a single-line absolute path, regardless of the caller's cwd, exported `CDPATH`, or the availability of external `dirname` / `basename`. Otherwise it fails with a named non-zero exit; it never silently anchors at `/` or at a foreign directory.

## Seams and Evidence

**Module.** New module `backend/open_webui/test/test_harness_script_root.py`. It lives in the backend tree so `make test-backend` and CI layer2 collect it.

**Isolated checkout.** Each case builds an isolated tmp checkout (`tmp_path/checkout/scripts/`) holding a byte-copy of the real script under test. Real repo paths are never touched. Recording stand-ins go in a tmp `bin/` that comes first on `PATH`. The subprocess env is allowlisted (`PATH`, `HOME`, `LANG`) plus `LC_ALL=C` and per-case values. Stand-in shebangs use the absolute test interpreter (`#!{sys.executable}`, as in `test_harness_seed.py:202`), so a `python3` stand-in never resolves itself and works under a restricted `PATH`. Expected paths are compared after `.resolve()`, because macOS tmp paths are physical (`/private/var/...`) and `PWD` is not inherited.

**Observation per script.** Each stand-in records `os.getcwd()` and its argv to a tmp file, then exits. Assertions are made on the recorded file, never on the exit code alone. For example, the smoke-stub `python3` stand-in exits 1 by design.

- `smoke-stub.sh`: a `python3` stand-in records cwd and exits 1. The script's first `python3` call (the port probe) follows the `cd`, so the recorded cwd is the derived root.
- `verify-office.sh`: a fake `<checkout>/.venv/bin/python` records argv and cwd and exits 0. Expected: argv `[<checkout>/.venv/bin/python, <checkout>/scripts/verify-office.py]`, cwd `<checkout>`.
- `proxy-dev.sh`:
  - `OCU_CHECKOUT=ocu`, a relative path without a `.`/`..` prefix, points at `<checkout>/ocu/deploy/proxy/nginx.conf`, with the checkout as cwd. bash never consults `CDPATH` for `.`/`..`-prefixed paths, so `../ocu` would not exercise the `config_abs` line. The foreign `CDPATH` directory also holds an `ocu/deploy/proxy/nginx.conf`, so a fix that repairs only the preamble still records `-c <foreign>/ocu/...` or a two-line path.
  - An `nginx` stand-in records argv; no `caddy` is on `PATH`.
  - Expected: `-c <checkout>/ocu/deploy/proxy/nginx.conf`.
  - A second case leaves `OCU_CHECKOUT` unset, with the sibling `<tmp>/open-computer-use/deploy/proxy/nginx.conf`, to prove `repo_root`.

**Matrix per script.**

- Invocation forms, each run at least once per script, mirroring `test_harness_seed.py:482-490`:
  - Make form: `bash scripts/<name>.sh`, cwd = checkout. This form runs the full caller-environment matrix.
  - Absolute form from a foreign cwd: `bash <checkout>/scripts/<name>.sh`, cwd = a tmp directory outside the checkout. This is proxy-dev's real caller contract (`smoke-proxy.py:766`, `verify-ui-ocu.py:458`). For proxy-dev this form uses the default `OCU_CHECKOUT`.
  - Bare-name form: `bash <name>.sh` with cwd = `<checkout>/scripts`. It exercises the `*) dir=. ;;` branch. For proxy-dev this form also uses the default `OCU_CHECKOUT`.
- Caller environment, one of:
  - no `CDPATH` (the baseline, green before and after);
  - `CDPATH=.`;
  - `CDPATH=<foreign dir that contains scripts/ and a complete copy of the stand-in targets>`.
- Restricted `PATH`: a bin dir holding symlinks only to what the script needs. It omits `dirname` and `basename`, and includes `bash`, `env`, `python3`/`nginx` stand-ins, and `command`-reachable tools. Expected: the correct root.
  - Pre-fix, smoke-stub and verify-office resolve `cd "/.."` to `/`: smoke-stub records cwd `/`, and verify-office reports the false missing-interpreter error. proxy-dev's outer `cd ""` stays in cwd on bash 3.2, which makes `repo_root` the checkout's parent and leads to exit 2 (missing OCU checkout) or 127 at `basename`. On bash 5 it fails with "null directory". All of these are red.
  - If a script needs other external tools before the observation point, include them; derive the minimal set from the script.

**Interpreters.** Run under `bash` from `PATH` and under `/bin/bash` when it is a distinct interpreter. macOS ships bash 3.2 there; on Linux CI the two are the same, so deduplicate by `realpath`.

**Expected results.**

- Pre-fix: the `CDPATH` cases are red for every script, with a two-line path / wrong cwd, or the false missing-interpreter message. The restricted-`PATH` cases are red.
- Post-fix: all cases are green.

**Dash-prefixed path (optional).** A checkout directory named `-co` invoked as `bash -- -co/scripts/<name>.sh` from its parent exercises `--`. Include it if it is simple; otherwise rely on `--` being present in the diff.

**Commands.**

- `make test-harness-script-root`, a new Makefile target added to `.PHONY` next to `test-harness-seed` that runs the module. It must be red before the script change and green after.
- `make smoke-stub` (exit 0, behavior unchanged).
- `make test-smoke-stub-cleanup`.
- `make lint-scoped`.
- `make doc-gate`.

**Non-goals.** `smoke.sh`; `generate-sbom.sh` (report only); `rev-parse`-based scripts; actually running nginx, caddy, DocumentServer or the Office pipeline.

**Review focus.**

- Is every relative `cd` in the three preambles guarded?
- Is the `set -e` behavior on a failed `cd` preserved?
- Do the stand-ins observe the real derived root rather than a test artefact?
- Are the existing exit-2 named failures in `proxy-dev.sh` unchanged?
