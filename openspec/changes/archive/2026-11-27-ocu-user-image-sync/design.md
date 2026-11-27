## Design

Change surface: OCU `openwebui/tools/computer_use_tools.py` `_chat_image_ids` only.

Must preserve:

- The generated-image entry `{type: "image", url: "/api/v1/files/<id>/content"}` still yields its id (`tests/test_tools.py` `_image_ref`, `test_chat_images_*`).
- Ids are newest-message first and unique; the chat is read only when the requesting user owns it; any read failure yields no ids and never fails the tool call.
- `_sync_files_if_needed` (`:753-807`): ids already in `__files__` are not double-listed; receipted ids are skipped; at most `_CHAT_IMAGE_LIMIT` (20) new ids per call.
- `_readable_files` (`:1206-1245`) stays the single gate: `image_only` refuses a row whose stored `content_type` is not `image/*`; a row the user neither owns nor may read is refused.

Must add/change: a message file entry with `content_type` starting `image/` and a nonempty string `id` yields that id, for `type` `file` (user upload) and `type` `image` with a bare-id `url` (image added by URL).

Governing invariant: a chat image reaches the sandbox only when the requesting user owns the chat, the stored file row is `image/*`, and the user owns or may read that row.

Sibling surfaces:

- `_attachment_ids` (`__files__`): unchanged; WebUI never puts images there.
- `_readable_files` / `_load_file`: unchanged; they enforce the invariant from the stored row, not from the message entry, so a forged `content_type` in chat history cannot bypass them.
- `Synced image:` note: already emitted for every stored chat-image id.
- Server `store_upload` (`computer-use-server/uploads.py`): unchanged; names and collisions as today.

Seams under test: `Tools._sync_files_if_needed` through the existing test harness in `tests/test_tools.py` (patched `Chats`, `Files`, `has_access_to_file`, and the upload POST), as the existing `test_chat_images_*` tests do.

Required evidence:

- User message `{type: "file", id: U, url: U, content_type: "image/png"}`, stored row `image/png`, owned by the user → U is posted once, note `Synced image: /mnt/user-data/files/<name>`; a second call posts nothing (receipt).
- Same with `{type: "image", id: U, url: U, content_type: "image/jpeg"}` → U synced.
- Entry `content_type: "image/png"` whose stored row is `application/pdf` → not posted (`not an image`).
- Entry `{type: "file", content_type: "application/pdf"}` in chat history → not listed as a chat image.
- Image entry for a file the user neither owns nor may read → not posted.
- An entry with `content_type: "image/png"` and no `id`, or a non-string `id` → ignored, no error.

Non-goals: the system prompt's "do not embed again" note (`system_prompt.py:269`) covering only generated images (a user-attached image now also sits in `/mnt/user-data/files/`; follow-up if models re-embed it); data-URL images with no file id (temporary chats, desktop paste); changing WebUI's `__files__` filter; changing the 20-image cap.

Review focus: the invariant holds for the new entry shapes; no change to `_readable_files`; id order and dedup unchanged; tests red before the fix.
