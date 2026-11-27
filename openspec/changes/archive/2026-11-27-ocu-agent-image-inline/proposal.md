## Why

When the agent draws a chart in the sandbox (for example matplotlib writing `chart.png` from temperature data), the chart often shows only as a file in the workspace sidebar or as a link, not in the reply (#938).

Traced at WebUI `2097c2b`, OCU `2de3c72`:

- Inline display relies on the model alone: the OCU system prompt asks it to write `![desc]({file_base_url}/chart.png)` (`computer-use-server/system_prompt.py:264-266`). No code turns an image file the agent wrote into an image in the reply.
- Failure modes without a code fallback: the model writes a sandbox path or a plain link; the "do not embed generated images again" rule (`system_prompt.py:269`) spills over onto charts.

Owner decision (#938): add a code fallback, not a prompt-only fix.

## What Changes

- **OCU wrapper** (`openwebui/tools/computer_use_tools.py`): around the MCP call of `bash_tool`, `str_replace`, `create_file` and `sub_agent`, list the chat's outputs before and after (internal `GET /api/outputs/<chat>`), and append one line per image file (`mime` `image/*`) that the call created or whose `hash` changed: `New image: /mnt/user-data/files/<path>`. The line also tells the model the file's path.
- **WebUI** (`structuredOutput.ts`, `StructuredOutputRenderer.svelte`): a tool result with `New image:` lines yields an `image` display item right after that call (the item from #937), rendered from `/ocu/files/<chat>/<path>?call=<call identity>`; skipped when a message in the same output already embeds that file.

## Capabilities

### New Capabilities

- `ocu-agent-image-inline`: images the agent writes during an OCU tool call render in the reply after that call.

### Modified Capabilities

None.

## Impact

- OCU: `openwebui/tools/computer_use_tools.py`, `tests/test_tools.py` (one PR).
- WebUI: `src/lib/components/chat/Messages/structuredOutput.ts`, `StructuredOutputRenderer.svelte`, tests (one PR, after #937).

## Triage

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent
Blast radius: every OCU tool call gains two listing requests; a wrong diff shows unrelated images or misses charts; a malformed path could render an unintended URL
Selected risk packs: Public API / CLI / script entry; File IO / path safety / overwrite; Resource limits / large input / discovery; Error handling / rollback / partial outputs; Concurrency / shared state / ordering; Legacy compatibility / examples
Evidence floor: OCU tests red before / green after; WebUI unit tests red before / green after; make test-frontend, typecheck, lint-scoped, verify-ui-ocu; eval stack on 27 with the temperature-chart prompt
```
