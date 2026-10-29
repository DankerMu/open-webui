## Why

(#677.) On the Claude Code runtime, `sub_agent` with `resume_session_id` drops the caller's `task`. At OCU `origin/main` `78a1a0d`, the resume branch of `computer-use-server/mcp_tools.py` `sub_agent` (`:1034-1050`) always dispatches the same prompt:

```
Continue working on the task. If needed, re-read /home/assistant/task_plan.md for full context.
```

The tool contract never says a resumed call ignores `task`:

- The Claude docstring (`:856-865`) describes `task` as a required "Detailed description of the task for the sub-agent to accomplish", and `resume_session_id` only as "Session ID to resume a previous sub-agent session". The Open WebUI tool says the same (`openwebui/tools/computer_use_tools.py:952-960`).
- The sub-agent skill already tells the model to pass a follow-up task on resume: `skills/public/sub-agent/SKILL.md:170-176`, with the example "Continue the refactor. Previous progress: ...".

So a follow-up such as "now add tests" or "fix the failure you reported" is silently discarded. This was observed on the acceptance host during #662's acceptance (2026-10-28, run R5), and the code has behaved this way since upstream `e5d2908`.

## What Changes

**Resume on Claude Code.** The prompt always starts with fixed text, never with caller text:

```
Follow-up instruction for this resumed session:

<task>

If needed, re-read /home/assistant/task_plan.md for the original task.
```

- It must start with fixed text because `cli_adapters/claude.py:77-83` passes the prompt as the argument after `-p`. A prompt that starts with `-`, such as a markdown bullet list, would be parsed as an option (`error: unknown option`). A prompt equal to a subcommand name would be dispatched as that command.
- If `task` is empty or whitespace only, the prompt stays exactly today's fixed "Continue working…" text, so a caller with nothing new to say still resumes.
- These stay as they are:
  - the system prompt is empty, because `claude --resume` restores it;
  - the plan file is not rewritten, so it keeps the original task;
  - the adapter and its argv are unchanged.

**New sessions, codex and opencode** behave exactly as before. codex and opencode ignore resume, start fresh, rewrite the plan file with the caller's task and send the full system prompt.

**Docs.** On resume, `task` carries the follow-up instruction, and the original task stays in the plan file. This is stated in three places:

- the Claude docstring's `resume_session_id` line (`mcp_tools.py:865`);
- `openwebui/tools/computer_use_tools.py:960`;
- `skills/public/sub-agent/SKILL.md:138`.

The codex (`:935`) and opencode (`:900`) docstring copies stay, because those runtimes ignore resume.

## Capabilities

### Modified Capabilities

- `ocu-terminal-claude-gateway`, which also holds the #662 sub_agent gateway requirements: a resumed sub-agent session receives the caller's task.

## Impact

- OCU:
  - `computer-use-server/mcp_tools.py`;
  - `openwebui/tools/computer_use_tools.py` and `skills/public/sub-agent/SKILL.md` (wording only);
  - `tests/orchestrator/test_subagent_gateway.py`.
- `tests/fixtures/cli/claude_v0.9.2.0_argv.json` is unchanged. It pins the adapter's argv for given inputs. Its `resume.inputs.task` and its `metadata.source` reference to the old `mcp_tools` prompt no longer describe what `mcp_tools` sends; the PR notes this.
- Non-goals:
  - session resume for codex or opencode;
  - a `--` terminator in the adapter;
  - appending to the plan file;
  - progress display.

## Fixture

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded: public tool contract change (what `task` means on resume, docstrings and the skill the model reads) and new caller text in a CLI argv
Blast radius: a resumed run that Claude Code rejects as an unknown option or dispatches as a subcommand; new sessions or codex/opencode runs changing their prompt; a model that stops passing follow-ups because the docs mislead it
Selected risk packs: Public API / CLI / script entry (resume contract, argv safety); Error handling (empty or whitespace task); Legacy compatibility (new sessions, codex/opencode resume, adapter fixture); Documentation (two docstrings and the skill)
Not selected: Auth / secrets (gateway token path untouched; the task is passed in argv as before); Config (no setting); Schema, File IO, Concurrency, Resource limits, Release packaging (none)
Evidence floor: OCU unit command for tests/orchestrator/test_subagent_gateway.py, test_subagent_claude_compat.py, test_cli_adapters.py and tests/test_subagent_docstring.py; the resume tests red on origin/main; docs-lint gates
design.md: present
```
