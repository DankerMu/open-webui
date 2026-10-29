## Design

Change surface:

- `mcp_tools.py` `sub_agent`, the resume branch (`:1034-1050`): the prompt string only.
- The Claude docstring line `:865`.
- `computer_use_tools.py:960`.
- `SKILL.md:138`.

Governing invariant: whatever the caller's text, the resumed Claude Code argv is `["claude", "-p", <prompt that starts with fixed text>, "--resume", <id>, …]`, so caller text can never become an option or a subcommand.

Must preserve:

- `cli_adapters/claude.py` and `tests/fixtures/cli/claude_v0.9.2.0_argv.json` are byte-identical.
- New Claude sessions: the plan write (`base64 -d`), the full system prompt and the prompt `Read and execute your task plan from /home/assistant/task_plan.md` are unchanged.
- codex and opencode with `resume_session_id`, today:
  - the plan file is rewritten with the caller's task;
  - the full system prompt is sent;
  - the prompt is the "Read and execute…" text.
- The gateway exec environment and the token checks from #662 are unchanged.

Sibling surfaces:

- `cli_adapters/claude.py:77-83`, which places the prompt after `-p`;
- `docs/multi-cli.md:107` and `system_prompt.py:173`, both left as they are;
- the codex and opencode docstring copies (`:900`, `:935`), unchanged.

Required evidence (`tests/orchestrator/test_subagent_gateway.py` unless stated):

- a. **Resume, gateway on** (`:285`) and **gateway off** (`:295`). Task `write and run hello.py`. The argv is `claude -p "Follow-up instruction for this resumed session:\n\nwrite and run hello.py\n\nIf needed, re-read /home/assistant/task_plan.md for the original task." --resume s-1 …`, red on `origin/main`.
  - No `base64 -d` exec runs. That is asserted at `:286` already; add the same check to the gateway-off test.
- b. **Task starting with `-`.** The task `- add tests\n- fix lint` gives an argv whose element after `-p` starts with `Follow-up instruction`. No argv element starts with `- add`.
- c. **Empty and whitespace task.** `""` and `"  \n"` give exactly the old prompt `Continue working on the task. If needed, re-read /home/assistant/task_plan.md for full context.`
- d. **codex with `resume_session_id`.**
  - The `base64 -d` plan write runs with the caller's task.
  - The full system prompt is sent.
  - The prompt is `Read and execute your task plan from /home/assistant/task_plan.md`.
  - This passes on `origin/main` too: it is a preservation check.
- e. **Unchanged suites.** New-session tests, `test_subagent_claude_compat.py`, `test_cli_adapters.py` and `tests/test_subagent_docstring.py` pass unchanged, unless the docstring test pins the changed line, in which case it is updated to the new text.

Review focus:

- The argv can never start the prompt with caller text.
- The empty-task fallback.
- No change outside the resume branch.
- The three wording changes agree with each other.
