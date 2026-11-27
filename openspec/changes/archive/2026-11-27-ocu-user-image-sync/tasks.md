## 1. Implementation (OCU repo)

- [x] 1.1 `_chat_image_ids` yields the id of a message file entry whose `content_type` starts with `image/` and whose `id` is a nonempty string, in addition to the generated-image shape; order and dedup unchanged.
- [x] 1.2 Tests in `tests/test_tools.py` (using `_FakeWebUI`'s `lookups`, `access_checks` and the fake OCU's `uploads`), one per "Required evidence" line in `design.md`:
  - Red against `2de3c72`, green after: the `type: "file"` and `type: "image"` bare-id positive cases; the stored-row-is-PDF case (`webui.lookups == [U]`, `ocu.uploads == []`); the unreadable case (stored row with a `user_id` other than `OWNER["id"]` and no grant; `webui.lookups == [U]`, `(U, "read", OWNER["id"]) in webui.access_checks`, `ocu.uploads == []`). These prove the new shapes reach the `_readable_files` gate.
  - Regression guards (green before and after): history entry with `content_type: "application/pdf"`, and an image entry with no or non-string `id` (`webui.lookups == []`, no error).
- [x] 1.3 Existing `test_chat_images_*` and attachment tests stay green; `pytest tests/test_tools.py` passes.

## 2. Verification

- [x] 2.1 OCU CI green on the PR.
- [x] 2.2 Required. Eval stack on 27 (real saved chat history, not the unit-test fake): an image attached to a user message is listed in `/ocu/api/outputs/<chat>` after the first OCU tool call (`/mnt/user-data/files` is the outputs bind, `computer-use-server/docker_manager.py:1316`). Record the request, the saved `files` entry (`type`, `id`, `content_type`) and the listing.

## Risk packs

- Auth / permissions / secrets: selected. New entry shapes feed the read-access gate. Tests: unreadable image refused; stored row not `image/*` refused.
- File IO / path safety / overwrite: selected. More files are copied into the sandbox. Naming and collisions stay with the server's `store_upload`; test the stored-name note.
- Resource limits / large input / discovery: selected. More ids may compete for the 20-image cap. Non-goal to change the cap; existing `test_chat_image_cap_*` stay green.
- Legacy compatibility / examples: selected. Generated-image shape must keep syncing: existing tests.
- Public API / CLI / script entry: not selected. No signature change.
- Config / project setup: not selected. No config.
- Schema / columns / units / field names: not selected. Reads existing WebUI fields only.
- Concurrency / shared state / ordering: not selected. Order logic unchanged; covered by existing ordering tests.
- Error handling / rollback / partial outputs: not selected beyond the malformed-entry test (1.2): read failures still yield no ids.
- Release / packaging / dependency compatibility: not selected. No dependency change.
- Documentation / migration notes: not selected. No user-facing doc mentions the restriction.

## Evidence (2026-11-28)

- Shipped in DankerMu/open-computer-use PR 275 (merge `1efa569`); unit tests red then green per that PR.
- 2.1: OCU GitHub Actions have not triggered since 2026-11-23, so the PR has no CI run; `pytest tests/test_tools.py tests/test_upload_claim.py` passed locally (299 at `e3be359`).
- 2.2: eval stack on 27 (OCU `e3be359`, WebUI `65d5006`), chat `e9cde070-…`: the user message's saved entry is `{type: "file", id: "405cd85d-…", content_type: "image/png"}`; the first `bash_tool` result carries `Synced image: /mnt/user-data/files/red_blue.png`; `GET /ocu/api/outputs/<chat>` → 200 with `red_blue.png` (`image/png`, 125 bytes); PIL in the sandbox reads 64×48, (5,5)=(255,0,0), (60,40)=(0,0,255).
- Deployment note: the fix lives in the tool source, which an initialized deployment refreshes only when `open-webui-init` re-runs (#945).
