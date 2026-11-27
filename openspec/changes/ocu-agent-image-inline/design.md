## Design

Change surface: OCU `Tools.bash_tool`, `str_replace`, `create_file`, `sub_agent` (through `_run_tool` or a helper beside it) and a listing helper next to `_imported_attachment_ids`; WebUI `buildOutputDisplayItems` (`structuredOutput.ts`) and `StructuredOutputRenderer.svelte`.

Transport: plain text lines in the tool result, `New image: /mnt/user-data/files/<path>` (one per image, after the command output, like the existing `Synced image:` notes). Chosen over an event or `files` on the output item because the wrapper returns a string to Open WebUI's middleware, the line also tells the model the path, and the frontend already parses tool result text (`getToolResultText`).

Must preserve:

- Tool results stay strings; a `view` image result (a `data:image/...` string) is never appended to (`_run_tool`: appended text would corrupt it). `view` and `generate_speech` are not wrapped.
- `Synced image:` lines and discovery warnings unchanged; files synced by `_sync_files_if_needed` before the call are not reported (the "before" listing is taken after the sync).
- A listing failure (timeout, HTTP error incl. 409 stale cursor / 503 busy, malformed body, more pages than the bound) never fails the tool result; it adds no lines and logs. If either snapshot fails, no lines.
- No listing runs before `_prepare_tool_call` / `_call_error` pass (`test_empty_chat_rejects_every_public_tool_before_work`, `test_unusable_credentials_reject_before_upload_or_probe` assert no network call), and no "after" listing runs when the MCP call was never invoked.
- WebUI: `generate_image`/`edit_image` items (#937), `display_file`, grouping, and the files-row filter unchanged.

Must add/change:

- Listing: `GET {ORCHESTRATOR_URL}/api/outputs/<chat>?limit=1000` (`MAX_PAGE_LIMIT`) with the internal bearer token (the only credential `/api/outputs/` accepts, `auth_guard.py:31-38`), following `next_cursor` for at most 5 pages, within a 5 s budget per snapshot (as `_imported_attachment_ids`). Worst case added latency per call: 10 s (two snapshots), typically two single-page requests. Snapshot `{path: (revision, hash)}` for `files[]` entries with `mime` starting `image/` and `url` not null.
- Report: paths whose `(revision, hash)` is new or changed after the call, sorted by path, at most 10 lines, plus the exact line `More new images: <n>` when more (it does not match the `New image:` pattern). The broker refreshes `revision`/`hash` only on a size change or a new file (`outputs_broker.py:707-737`), so a same-size rewrite is not reported (accepted). Freshness of a rewritten file shown twice rests on the file route's `Cache-Control: no-store` together with the per-call item URL (see the WebUI bullet): `no-store` alone does not stop a browser reusing an image already loaded in the document.
- Reported also when the MCP result is an error (`Error:`, `[Timeout`, nonzero exit): the file exists either way.
- Result layout: `<command output>` + `\n\nNew image: …` lines (one per line) + the existing `\n\n<sync notes>` when present. Exact string pinned in a test.
- WebUI: `buildOutputDisplayItems(output, {chatId, origin})` (options optional; without `chatId` no OCU image items). For a `bash_tool`, `str_replace`, `create_file` or `sub_agent` call whose output text has lines matching `^New image: /mnt/user-data/files/(.+)$`, add the call's token, `flushDetails`, push the #937 item shape `{type: 'image', id, images: [{id: path, url, name}]}` with the relative `url` `/ocu/files/<chat>/<encoded path>?call=<encoded call identity>` (the body `Image` has no `allowExternal`, so an absolute URL would be replaced). The per-call query gives each call's item its own URL: a browser reuses an image already loaded in the document for an identical URL despite `Cache-Control: no-store`, so without it the item after a rewriting call keeps the earlier revision until the page reloads (seen on the eval stack, #938). The call identity is `call_id`, else the item `id` (the key that finds the call's output); a call with neither has no output and so no item. Do not put these images on `function_call_output.files`: `ToolCallDisplay` would draw them a second time inside the tool row. Lines anywhere in the result count: command output printing a fake line can only render a file of the same chat (accepted).
- URL encoding and the path rule (drop an empty, `.` or `..` segment or a backslash) move out of `workspaceFileUrl` (`src/lib/apis/ocu/index.ts:62-84`) into one shared exported function used by both; `workspaceFileUrl` keeps its `file.url` check.
- Dedup: only a markdown image embed `![…](url)` in a message of the same output suppresses the item, and only when `url`, resolved like `recogniseOcuLink` (`src/lib/utils/ocu-links.ts:3-40`) against `${origin}/ocu`, names the same chat and, after decoding, the same path segments. A plain link, or an embed on another origin (which the browser cannot load with the session), keeps the item. A segment that fails to decode (for example `100%.png`) counts as no match and never throws.

Governing invariant: an image the agent wrote during an OCU call renders once in the reply, right after that call, and only files under the chat's outputs are ever rendered.

Sibling surfaces:

- `_sync_files_if_needed`: runs before the "before" listing.
- WebUI `save_generated_images` (generate_image uploads into outputs): happens in WebUI tool calls, not inside an OCU call window, so not reported; a concurrent upload during a long OCU call would be reported (accepted; it renders once more after that call).
- `system_prompt.py:264-269`: unchanged; a model that still embeds the image is deduplicated.
- Workspace sidebar listing: unchanged consumer of the same endpoint.
- Proxy route `files/{chat}/{path}` (issuer auth, 302 to grant): the rendered URL is the same one the sidebar uses.

Seams under test: OCU `Tools.bash_tool` etc. with the fake orchestrator listing (`tests/test_tools.py` harness); WebUI `buildOutputDisplayItems` and a URL-building helper as pure functions.

Required evidence:

- OCU: listing before `{}`, after `{chart.png: h1}` (image/png) → result ends with `New image: /mnt/user-data/files/chart.png` (red before).
- OCU: unchanged image (same hash) → no line; changed hash → line; new non-image file (`data.csv`) → no line; 12 new images → 10 lines plus one "and 2 more" line.
- OCU: listing raises / times out / returns malformed JSON → command output returned unchanged, no line.
- OCU: `view` result and `generate_speech` unchanged (no listings issued).
- OCU: a file synced by `_sync_files_if_needed` in the same call → not reported.
- OCU: "before" listing fails, "after" succeeds → no lines; MCP result `Error: …` with a new image → line appended; validation failure → no listing request; exact layout with a `Synced image:` note present → `out\n\nNew image: /mnt/user-data/files/chart.png\n\nSynced image: /mnt/user-data/files/u.png`.
- WebUI: output `[call bash_tool (call_id k1), output "…\n\nNew image: /mnt/user-data/files/plots/t.png"]` with chatId C → items: tool, image with URL `/ocu/files/C/plots/t.png?call=k1` (red before).
- WebUI: two calls (`k1`, `k2`) that both report `plots/t.png` → two image items with different URLs (`?call=k1`, `?call=k2`); rebuilding the same output yields the same URLs; dedup against an embed `![t](https://h/ocu/files/C/plots/t.png)` still suppresses both.
- WebUI: same output plus a message `![t](https://h/ocu/files/C/plots/t.png)` with origin `https://h` → no image item; with a message `[t](https://h/ocu/files/C/plots/t.png)` (plain link) → image item; with the embed on origin `http://other:8082` → image item.
- WebUI: `New image: /mnt/user-data/files/温度 (1).png` and an embed of the raw unencoded URL → shown once; URL encoded as `%E6%B8%A9%E5%BA%A6%20%281%29.png` (the shared encoder also encodes `!'()*`, as OCU's `quote(path, safe='/')` does).
- WebUI: 10 `New image:` lines plus `More new images: 2` → 10 images, no extra item.
- WebUI: embed `![x](https://h/ocu/files/C/100%.png)` beside `New image: /mnt/user-data/files/100%.png` → no throw; the image item is kept.
- WebUI: a `New image:` line in a `view` or non-OCU tool result → no item; `../x.png` or a backslash path → dropped; no `chatId` → no item.

Non-goals: non-image outputs; video; changing the system prompt; keeping an earlier revision of a rewritten image across a page reload (each item loads the file current when it first renders; after a reload all load the current file); channels (no OCU sandbox).

Review focus: listing cost and failure isolation; before/after window correctness; path safety of rendered URLs; exactly-once with markdown embeds; #937 item reuse.
