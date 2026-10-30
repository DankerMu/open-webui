## Why

(#680.) The workspace terminal starts in `/home/assistant`. The files the chat produces, the ones the sidebar's Files tab lists, live in `/mnt/user-data/files`. A person typing in the terminal has to know that path.

Claude Code in the sandbox already knows it: `/home/assistant/.claude/CLAUDE.md`, written by the workspace entrypoint, names `/mnt/user-data/files` as the place for user-facing files. The missing piece is a visible entry for the human.

The start directory stays `/home/assistant`. Claude Code keys sessions by start directory, and both the terminal's "Previous sessions" list (OCU `computer-use-server/app.py:1315`, which reads `~/.claude/projects/-home-assistant/`) and `sub_agent`'s default `working_directory` (`mcp_tools.py:965`) depend on it.

## What Changes

At OCU `origin/main` `89327b6`:

- A new constant, `TERMINAL_FILES_LINK = "ln -sT /mnt/user-data/files /home/assistant/files >/dev/null 2>&1; "`, in `computer-use-server/app.py`. `ln -sT` without `-f` is one `symlinkat` call: it creates the link only when nothing exists at `/home/assistant/files`, a dangling symlink included, and otherwise fails without touching the existing entry or creating anything inside it. It prints nothing either way, so it cannot change the exec's output.
- The snippet runs at the start of the first exec of every terminal start request, joined with `;` so the rest of that exec runs whatever the snippet's result. No exec is added.
  - Gateway mode: it prefixes `_terminal_reuse_probe`, so a reused terminal also gets the link.
  - Non-gateway mode: it prefixes the `pgrep` check in `start_ttyd`.
- `_ttyd_start_command`, the readiness probe, the stop command, the fingerprint and the start answers are unchanged.

Why not the alternatives:

- **The workspace entrypoint** would need a workspace image rebuild, and running sandboxes on the current image would not get the link until they are recreated.
- **`_ttyd_start_command` alone** would skip reused terminals. After an upgrade, a user reopening an existing chat with the same login and model gets a reused terminal and would see no link until the terminal restarts.

## Capabilities

### Modified Capabilities

- `ocu-terminal-claude-gateway`: a terminal start leaves a `files` link in the sandbox home; the gateway-off start now runs the link snippet before its existing check.

## Impact

- OCU: `computer-use-server/app.py`, `tests/orchestrator/test_terminal_gateway.py`.
- Downstream consumers of `/home/assistant` and the backups are listed in `design.md`.
- Non-goals: the workspace image and entrypoint; the CLAUDE.md text (its lost headings are #681); exporting chat context to the terminal.

## Fixture

```text
Issue type: feature
Fixture level: expanded
Upstream suggested level: absent; expanded: a write into the persisted, backed-up workspace volume (file IO, persisted state) from the first exec of every start path (legacy compatibility)
Blast radius: a terminal start that fails or turns every reuse into a restart; an existing user file or directory named files replaced, or an entry created inside the chat's files directory
Selected risk packs: File IO / path safety / overwrite; Legacy compatibility; Error handling (a failing link stays silent)
Not selected: Concurrency (one atomic symlinkat; two racing starts create at most one link and the loser fails silently); Public API, Config, Schema, Auth / secrets, Resource limits, Release packaging, Documentation (no answer, setting, format, token, limit, packaging or documented-procedure change)
Evidence floor: OCU unit command for test_terminal_gateway.py with the new tests red on origin/main; a real-bash run of the snippet as the sandbox user in the sandbox image; scripts/docs-lint gates
design.md: present
```
