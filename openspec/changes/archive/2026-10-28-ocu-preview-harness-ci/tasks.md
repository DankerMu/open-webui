## 1. Fixture

- [x] 1.1 Proposal, tasks, spec delta; fixture review; `openspec validate ocu-preview-harness-ci --strict --no-interactive`.

## 2. Risk packs

- **Config / project setup** — selected: new `preview-harness.yml` with pinned actions, Python 3.12, Node 22, `contents: read`, and the Draw.io prepare step. Evidence: the workflow run on the OCU PR head, its log showing the prepare step succeeding.
- **Release / packaging / dependency compatibility** — selected: Playwright exactly 1.62.1 and its Chromium, installed without the full `package.json`. Evidence: the workflow log shows `playwright@1.62.1`.
- **Resource limits** — selected: `timeout-minutes: 30` on the job; failure artifacts are uploaded. Evidence: the workflow file.
- **Documentation** — selected: README notes the workflow. Task 3.3.
- **Public API, Auth / secrets, Error handling, Legacy compatibility, Concurrency, File IO, Schema** — not selected: no runtime change; no secrets used.

## 3. Implement OCU

- [x] 3.1 `test_preview_prefix.py`: drop the personal fallback; a missing node fails naming `OCU_TEST_NODE`. Evidence: node hidden, `main` 99 passed silently; branch 17 failed naming `OCU_TEST_NODE`; node present 99 passed. Fix pass 1 guards `test_office_editor.py` the same way (212 `TypeError` → 212 named failures; 212 passed with node).
  - Show it red first: on `main`, with node hidden from PATH and `OCU_TEST_NODE` unset, the tests do not fail with that message.
  - Then show it green: they fail with that message.
  - Show the normal run passes with node present.
- [x] 3.2 `.github/workflows/preview-harness.yml` as in the proposal, plus a `concurrency` group cancelling superseded runs. Run the harness locally on the branch head with the same Playwright version and Python 3.12 venv, and record the result. Evidence: without prepare, `viewer-static.min.js` 500 then `TimeoutError`; after `prepare_drawio.py`, harness exit 0 `result ok`; prepared tree sha256-identical to the original, original restored.
  - Prove a clean tree first: move `computer-use-server/static/drawio/` aside, run `prepare_drawio.py`, then run the harness.
  - Show that the harness fails without the prepare step, so the step is necessary.
  - Restore the original directory afterwards.
- [x] 3.3 `computer-use-server/README.md:507-509`: name the workflow. Evidence: merged as `a1ac5b4`.
- [x] 3.4 `git grep -n '/Users/' tests` is empty; `./tests/test-project-structure.sh`; the scripts/docs-lint gates. After the PR opens, the `preview-harness` run on the PR head passes. This last item belongs to the orchestrator. Evidence: grep empty; structure 24 passed; docs-lint six gates exit 0. PR-head run: **not available** — GitHub Actions created no run in the OCU repository after 2026-10-25; the owner waived it on 2026-10-28 and the first runner result is a follow-up recorded on (#666).
