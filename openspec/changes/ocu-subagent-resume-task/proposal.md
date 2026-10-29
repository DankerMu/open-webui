## Why

(#677.) `sub_agent` with `resume_session_id` on the Claude Code runtime drops the caller's `task`. At OCU `origin/main` `78a1a0d`, the resume branch of `computer-use-server/mcp_tools.py` `sub_agent` (`:1034-1050`) always dispatches the same fixed prompt:

```
Continue working on the task. If needed, re-read /home/assistant/task_plan.md for full context.
```

The tool's contract does not say a resumed call ignores `task`. The `mcp_tools.py` docstring (`:856-865`) describes `task` as a required "Detailed description of the task for the sub-agent to accomplish", and `resume_session_id` only as "Session ID to resume a previous sub-agent session". The Open WebUI tool (`openwebui/tools/computer_use_tools.py:952-960`) says the same.

So a model that resumes a session to give a follow-up ("now add tests", "fix the failure you reported") has the follow-up silently discarded. This was observed on the acceptance host during #662's acceptance (2026-10-28, run R5), and the behaviour dates back to upstream `e5d2908`.

## What Changes

- **Resume on Claude Code.** The prompt becomes the caller's `task`, followed by one blank line and `If needed, re-read /home/assistant/task_plan.md for the original task.` Three things stay as they are:
  - the system prompt stays empty, because `claude --resume` restores it from the session;
  - the plan file is not rewritten, so it keeps the original task as the source of truth after compaction;
  - `--resume <id>` and every other argv element are unchanged.
- **New sessions, codex and opencode** (whose adapters ignore resume and start fresh with the full task and system prompt) behave exactly as before.
- **Docs.** The `resume_session_id` description in `mcp_tools.py` and in `openwebui/tools/computer_use_tools.py` says that on resume, `task` carries the follow-up instruction, and the original task stays in the plan file.

## Capabilities

### Modified Capabilities

- `ocu-terminal-claude-gateway` (which also holds the #662 sub_agent gateway requirements): a resumed sub-agent session receives the caller's task.

## Impact

- OCU:
  - `computer-use-server/mcp_tools.py`, `openwebui/tools/computer_use_tools.py` (docstring only);
  - `tests/orchestrator/test_subagent_gateway.py`.
- `tests/fixtures/cli/claude_v0.9.2.0_argv.json` is unchanged. It pins the adapter's argv for given inputs, and the adapter still passes `task` through as before.
- design.md is omitted at the compact level.
- Non-goals:
  - session resume for codex or opencode;
  - rewriting or appending to the plan file on resume;
  - the progress display.

## Fixture

```text
Issue type: bugfix
Fixture level: compact
Upstream suggested level: absent; compact: one prompt string on one branch of one tool; no schema, file, auth or concurrency change
Blast radius: resumed sub-agents lose the plan-file pointer; a new session or codex/opencode run changes its prompt
Selected risk packs: Public API / CLI / script entry (the sub_agent tool's resume contract and docstrings); Legacy compatibility (new sessions, codex/opencode, the adapter argv fixture unchanged)
Not selected: Auth / secrets (gateway token path untouched; the task is passed in argv as before); Schema, File IO, Concurrency, Resource limits, Release packaging (none)
Evidence floor: OCU unit command for tests/orchestrator/test_subagent_gateway.py, test_subagent_claude_compat.py and test_cli_adapters.py; the resume tests red on origin/main; docs-lint gates
design.md: omitted (compact)
```
