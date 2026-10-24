## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-files-headers-ci --strict --no-interactive`.

## 2. Implement (in open-computer-use, from current `main`)

- [x] 2.1 `build.yml` `pytest-orchestrator` run step: add `python -m pytest tests/test_files_headers.py -v` on its own line after the existing selectors (no `|| true`, no `continue-on-error`; the step's default shell `bash -e {0}` propagates failure).
- [x] 2.2 Step-level evidence (approximates the hosted `ubuntu-latest` + `setup-python` runner; not a hosted run): extract the edited step's `run:` script from `build.yml` and run it unchanged with `bash -e` from the checkout root in `python:3.13` (`--init --user 1001:1001`) with the step's `env`. One recorded setup outside the script: a venv owned by that user and first on `PATH`, into which the job's three pip install lines are run unchanged (the image's `/usr/local` site-packages are root-owned, so a bare non-root pip would fall back to a user install off `PATH`). Record: the `tests/test_files_headers.py` invocation's executed test count and result, the other selectors' results, and that with the new line unchanged and one test in that module patched to fail in a scratch copy, the script exits non-zero. Record that the workflow is `disabled_manually`.
- [x] 2.3 Green: YAML parses (`python -c "import yaml; yaml.safe_load(open('.github/workflows/build.yml'))"` or `actionlint`); 2.2's run; `./tests/test-project-structure.sh`. The PR flags the CI-file change and the disabled workflow, and writes #255 as `DankerMu/open-webui#255`.

## Risk packs

Selected:

- **Config / project setup:** one CI selector line, 2.2, 2.3.

Not selected:

- **Release / dependency compatibility:** no dependency change; the job's existing installs are reused.
- **Public API, File IO, Documentation:** no production or operator-visible change.
