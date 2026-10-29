## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review; `openspec validate ocu-subagent-resume-task --strict --no-interactive`.

## 2. Risk packs

- **Public API / CLI / script entry** — selected: the resume contract, and argv safety for caller text. Evidence a, b.
- **Error handling** — selected: an empty or whitespace task falls back to the old prompt. Evidence c.
- **Legacy compatibility** — selected: new sessions, codex/opencode resume, the adapter and its fixture. Evidence d, e.
- **Documentation** — selected: the Claude docstring, the Open WebUI tool docstring and the skill. Task 3.2; evidence e for the docstring test.
- **Auth / secrets, Config, Schema, File IO, Concurrency, Resource limits, Release packaging** — not selected; reasons are in the proposal Fixture block.

## 3. Implement OCU

- [ ] 3.1 Tests first for evidence a–d; record which fail on `origin/main`.
- [ ] 3.2 `mcp_tools.py` resume prompt and the Claude docstring; `computer_use_tools.py:960`; `SKILL.md:138`.
- [ ] 3.3 Green:
  - `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/orchestrator/test_subagent_gateway.py tests/orchestrator/test_subagent_claude_compat.py tests/orchestrator/test_cli_adapters.py tests/test_subagent_docstring.py -q --import-mode=importlib`;
  - any other test that greps `Continue working`;
  - docs-lint gates;
  - `./tests/test-project-structure.sh`.
