## Why

#629. In `open-computer-use`, `tests/test_files_headers.py` (GET/HEAD metadata parity, isolation headers for generated content, descriptor confinement against path swaps and links, archive streaming and ZIP64 bounds, hidden-path and unsupported-name exclusion from archives) is in no CI selector: the `pytest-orchestrator` job in `.github/workflows/build.yml:229-254` runs `tests/orchestrator/`, `test_auth_guard.py`, `test_upload_claim.py`, `test_tools.py` and `tests/deploy` only. Regressions in these security-relevant contracts are caught only by hand.

The workflow itself is not running: `gh workflow list -R DankerMu/open-computer-use --all` shows "Build and Push Docker Images" (`build.yml`) as `disabled_manually`, its last run a cancelled probe on 2026-09-21. So this change makes the selector correct and locally proven; hosted execution starts only when the owner re-enables the workflow.

## What Changes

In `open-computer-use`, `.github/workflows/build.yml` only: the `pytest-orchestrator` run step gains a separate line `python -m pytest tests/test_files_headers.py -v` (`python -m` because the module imports `tests.file_route_module_ownership` before any `sys.path` change; a separate line because mixing root and orchestrator selections breaks collection, #255), using the job's installed dependencies and env.

Must preserve: the existing selectors and their order, the integration job, test semantics and production code.

Non-goals: re-enabling the workflow (an owner action; it also runs the image build and push jobs with `packages: write`); the sibling root modules without a selector (`test_file_response.py`, `test_descriptor_io.py`, `test_file_route_module_ownership.py` and others listed in #629); switching CI to the full unit command.

## Capabilities

### Modified Capabilities

- `ocu-pytest-discovery`: ADDED requirement "Main CI runs the file-serving contract tests".

## Impact

Once the owner re-enables the workflow, the `/files` and archive HTTP contract tests run on every PR to and push on `main`, and a failure fails the job. Until then the evidence is the edited step executed locally. The PR flags the CI-file change. #629 is not auto-closed by the PR (`intended-closing-issues: []`); after merge it is closed by hand with a comment stating that its hosted-run criteria wait on the owner re-enabling the workflow, which the final report also lists.

## Triage

```text
Issue type: test
Fixture level: compact
Upstream suggested level: absent (issue says S); compact: one CI selector line, no runtime behaviour
Blast radius: CI job duration and pass/fail of pytest-orchestrator
Selected risk packs: Config (CI selector)
Evidence floor: the edited `pytest-orchestrator` `run:` script extracted from build.yml and executed with `bash -e` in a python:3.13 container as non-root with exactly the job's pip installs and step env: the new invocation executes the module (executed count, not collect-only) and the other selectors still pass; a deliberately failing copy of that line fails the script; YAML parses; ./tests/test-project-structure.sh. Local step execution is not described as a hosted Ubuntu run.
design.md: omitted at compact level
```
