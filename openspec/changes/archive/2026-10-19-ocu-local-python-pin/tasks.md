## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Capture red without the pin, in a clean `git archive origin/main` export: `python --version` from the documented `uv run` shows 3.14.x, and `test_mcp_discovery.py` shows 3 failed.
- [x] 2.2 Add repo-root `.python-version` containing `3.13`.
- [x] 2.3 Add the rationale note to `tests/README.md` "Python selected unit tests": it matches CI, avoids the 3.14.0–3.14.8 regression, is overridden by `--python` / `UV_PYTHON`, and offline machines run `uv python install 3.13` first.

## 3. Verify

- [x] 3.1 Green, in a clean `git archive` export of the committed head: `python --version` shows 3.13.x, `test_mcp_discovery.py` shows 55 passed with the interpreter in the pytest header, and the full documented unit command exits 0 with 0 failed (counts recorded; any failure stops the issue). `./tests/test-project-structure.sh` passes and the commit hooks pass.

Deviation recorded at archive: a `git archive` export has no `.git`, so the full run there failed only the two `git ls-files` tests (`test_prepare_fonts.py::test_release_font_binaries_are_not_tracked`, `test_sandbox_path_references.py::test_tracked_files_do_not_name_legacy_sandbox_paths`): 2 failed, 4048 passed, 5 skipped. Those modules plus `test_mcp_discovery.py` gave 62 passed on Python 3.13.3 in a clean `git clone` of the merged head, and the working-tree full run gave 4050 passed, 5 skipped. Future clean-checkout evidence should use a clean clone rather than an export.

## Risk packs

Selected:

- Config / project setup: interpreter selection for local `uv` runs. The image, CI and production code stay unchanged.

Not selected:

- Concurrency, schema, file IO, secrets, release/packaging and auth: none of these change. The test oracle is unchanged.
