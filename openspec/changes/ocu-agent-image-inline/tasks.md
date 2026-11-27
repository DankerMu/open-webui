## 1. OCU (DankerMu/open-computer-use)

- [ ] 1.1 Listing helper (paged, bounded, internal token, failure → None) beside `_imported_attachment_ids`.
- [ ] 1.2 Before/after diff around the MCP call of `bash_tool`, `str_replace`, `create_file`, `sub_agent`; append `New image:` lines (max 10 plus an overflow line).
- [ ] 1.3 Tests for every OCU "Required evidence" line in `design.md`, red before 1.2. Add an `/api/outputs/{chat_id}` route with switchable modes (like the existing `imports_mode`) to the fake orchestrator in `tests/test_tools.py`.

## 2. WebUI (DankerMu/open-webui, after #937)

- [ ] 2.1 `buildOutputDisplayItems(output, {chatId, origin})`: `New image:` lines of the four OCU tools → #937 `image` item anchored at the call; dedup only against resolved, decoded markdown image embeds.
- [ ] 2.2 Extract the segment encoder and path rule from `workspaceFileUrl` into one shared function; `StructuredOutputRenderer.svelte` passes `chatId` and `origin`.
- [ ] 2.3 Tests for every WebUI "Required evidence" line, red before 2.1.

## 3. Verification

- [ ] 3.1 OCU: `pytest tests/test_tools.py tests/test_upload_claim.py`.
- [ ] 3.2 WebUI: `make test-frontend`, `make typecheck`, `make lint-scoped`, `make coverage-gate PART=frontend`, `make verify-ui-ocu`.
- [ ] 3.3 Eval stack on 27 (with the browser gateway): the temperature-chart prompt shows the chart inline after its tool call; screenshot.

## Risk packs

- Public API / CLI / script entry: selected. Tool result text gains lines the model reads; tests pin the format (1.3).
- File IO / path safety / overwrite: selected. Rendered URLs come from tool text; path-rule tests (2.3).
- Resource limits / large input / discovery: selected. Two listings per call, bounded pages and line count; tests (1.3).
- Error handling / rollback / partial outputs: selected. Listing failures add nothing; tests (1.3).
- Concurrency / shared state / ordering: selected. Before/after window; sync-before-listing test (1.3); concurrent uploads accepted in `design.md`.
- Legacy compatibility / examples: selected. `view`/`generate_speech` untouched; old messages without `New image:` lines unchanged (2.3).
- Config / project setup: not selected. No setting.
- Auth / permissions / secrets: not selected. Same internal token the wrapper already uses; rendered URLs go through the existing issuer-auth file route.
- Schema / columns / units / field names: not selected beyond the line format (Public API).
- Release / packaging / dependency compatibility: not selected.
- Documentation / migration notes: not selected. No user doc describes chart display.
