## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement

- [x] 2.1 Add `backend/open_webui/test/test_harness_script_root.py` first, following design.md Seams. It runs isolated tmp-checkout copies with recording stand-ins and covers this matrix:
  - each script: smoke-stub, verify-office, proxy-dev (with the relative `OCU_CHECKOUT=ocu` and with the default `OCU_CHECKOUT`);
  - each invocation form, at least once per script: Make form; absolute path from a foreign cwd; bare name from `scripts/`;
  - each caller environment: no `CDPATH`, `CDPATH=.`, foreign `CDPATH`, restricted `PATH` without `dirname`/`basename`;
  - each interpreter: `bash`, plus `/bin/bash` when distinct.
- [x] 2.2 Add the `test-harness-script-root` Makefile target (also listed in `.PHONY`). Apply the `smoke.sh` idiom to the preambles of `smoke-stub.sh`, `verify-office.sh` and `proxy-dev.sh`. In `proxy-dev.sh`, derive `config_base` / `config_abs` with builtins and `CDPATH='' cd --`.

## 3. Verify

- [x] 3.1 Run:
  - `make test-harness-script-root`, a new target (red before 2.2, green after);
  - `make smoke-stub`;
  - `make test-smoke-stub-cleanup`;
  - `make lint-scoped`;
  - `make doc-gate`, because the Makefile changes.

## Risk packs

Selected:

- Public API / CLI / script entry: 2.1 covers the Make form under every caller environment. It also covers the absolute-from-foreign-cwd form (proxy-dev's real caller contract) and the bare-name form.
- File IO / path safety: the invariant forbids anchoring at `/` or at a foreign directory; the restricted-`PATH` and foreign-`CDPATH` cases prove it.

Not selected:

- Concurrency, resource limits, schema, release/packaging, legacy compatibility, secrets, error handling: no such behavior changes. Existing named failures stay as they are.
- Documentation: script comments only.
- `generate-sbom.sh`: an upstream file; report only.
