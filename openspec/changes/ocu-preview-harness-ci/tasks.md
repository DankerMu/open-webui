## 1. Fixture

- [x] 1.1 Proposal, tasks, spec delta; fixture review; `openspec validate ocu-preview-harness-ci --strict --no-interactive`.

## 2. Risk packs

- **Config / project setup** — selected: new `preview-harness.yml` with pinned actions, Python 3.12, Node 22, `contents: read`, and the Draw.io prepare step. Evidence: the workflow run on the OCU PR head, its log showing the prepare step succeeding.
- **Release / packaging / dependency compatibility** — selected: Playwright exactly 1.62.1 and its Chromium, installed without the full `package.json`. Evidence: the workflow log shows `playwright@1.62.1`.
- **Resource limits** — selected: `timeout-minutes: 30` on the job; failure artifacts are uploaded. Evidence: the workflow file.
- **Documentation** — selected: README notes the workflow. Task 3.3.
- **Public API, Auth / secrets, Error handling, Legacy compatibility, Concurrency, File IO, Schema** — not selected: no runtime change; no secrets used.

## 3. Implement OCU

- [ ] 3.1 `test_preview_prefix.py`: drop the personal fallback; a missing node fails naming `OCU_TEST_NODE`.
  - Show it red first: on `main`, with node hidden from PATH and `OCU_TEST_NODE` unset, the tests do not fail with that message.
  - Then show it green: they fail with that message.
  - Show the normal run passes with node present.
- [ ] 3.2 `.github/workflows/preview-harness.yml` as in the proposal. Run the harness locally on the branch head with the same Playwright version and Python 3.12 venv, and record the result.
  - Prove a clean tree first: move `computer-use-server/static/drawio/` aside, run `prepare_drawio.py`, then run the harness.
  - Show that the harness fails without the prepare step, so the step is necessary.
  - Restore the original directory afterwards.
- [ ] 3.3 `computer-use-server/README.md:507-509`: name the workflow.
- [ ] 3.4 `git grep -n '/Users/' tests` is empty; `./tests/test-project-structure.sh`; the scripts/docs-lint gates. After the PR opens, the `preview-harness` run on the PR head passes. This last item belongs to the orchestrator.
