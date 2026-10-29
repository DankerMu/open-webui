## 1. Fixture

- [x] 1.1 Proposal, tasks, spec delta; fixture review; `openspec validate ocu-subagent-resume-task --strict --no-interactive`.

## 2. Risk packs

- **Public API / CLI / script entry** — selected: the resume contract and docstrings. Evidence:
  - the two resume tests in `test_subagent_gateway.py` (`:285`, `:295` on `origin/main`) assert `-p "<task>\n\nIf needed, re-read /home/assistant/task_plan.md for the original task."`, red on `origin/main`;
  - a test asserts that no plan-file write exec runs on resume.
- **Legacy compatibility** — selected:
  - the new-session tests and the codex/opencode tests in `test_subagent_gateway.py` keep their exact argv;
  - `test_subagent_claude_compat.py` and `test_cli_adapters.py` pass unchanged.
- **Auth / secrets, Schema, File IO, Concurrency, Resource limits, Release packaging** — not selected; reasons are in the proposal Fixture block.

## 3. Implement OCU

- [ ] 3.1 Tests first (risk-pack evidence); record which fail on `origin/main`.
- [ ] 3.2 `mcp_tools.py` resume prompt; both docstrings.
- [ ] 3.3 Green:
  - OCU unit command for `test_subagent_gateway.py`, `test_subagent_claude_compat.py`, `test_cli_adapters.py` and any other test that greps `Continue working`;
  - docs-lint gates;
  - `./tests/test-project-structure.sh`.
