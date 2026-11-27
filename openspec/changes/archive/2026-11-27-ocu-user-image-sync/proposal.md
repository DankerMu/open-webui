## Why

Images a user attaches to a chat message never reach the sandbox (#935), so the agent cannot open, convert or embed them as files.

- WebUI leaves image attachments out of `__files__` on purpose (`src/lib/components/chat/Chat.svelte:3490`, `:2916`).
- OCU's other route, `_chat_image_ids` (`openwebui/tools/computer_use_tools.py:1177-1203` at OCU `2de3c72`), accepts only the shape upstream `generate_image` writes: `type == "image"` with `url` `/api/v1/files/<id>/content` (`:1157`, `:1198-1200`).
- A user upload is stored as `{type: "file", id, url: "<id>", content_type: "image/*"}` (`MessageInput.svelte:1009-1015`); an image added by URL as `{type: "image", id, url: "<id>", content_type}` (`Chat.svelte:1843-1848`). Both fail the check.

## What Changes

`_chat_image_ids` also yields the id of a message file entry whose `content_type` starts with `image/` and whose `id` is a nonempty string, whatever its `type`. The generated-image shape keeps working. Everything after the id list is unchanged: receipt dedup, the 20-image cap, `_readable_files` (which re-checks the stored row's `content_type` and the requesting user's read access), the upload, and the `Synced image: /mnt/user-data/files/<name>` note.

## Capabilities

### New Capabilities

- `ocu-chat-image-sync`: which chat images the OCU tool wrapper copies into the sandbox.

### Modified Capabilities

None.

## Impact

- OCU `openwebui/tools/computer_use_tools.py` (`_chat_image_ids`) and `tests/test_tools.py`.
- No WebUI code change.

## Triage

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent
Blast radius: a file the user may not read reaches their sandbox, or a non-image file is copied as a chat image
Selected risk packs: Auth / permissions / secrets; File IO / path safety / overwrite; Resource limits / large input / discovery; Legacy compatibility / examples
Evidence floor: new tests in tests/test_tools.py red before and green after; existing chat-image and attachment tests green; eval-stack check on 27
```
