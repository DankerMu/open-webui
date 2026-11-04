---
id: 2026-11-03-generated-image-workspace
title: Generated images take a model-chosen name and are uploaded into the chat workspace by WebUI file id
kind: feature
status: implemented
date: 2026-11-03
supersedes: none
references: openspec/changes/webui-generated-image-workspace, DankerMu/open-webui#713, DankerMu/open-webui#707
---

# Generated images take a model-chosen name and are uploaded into the chat workspace by WebUI file id

## Problem

On the acceptance VPS the model drew an image, the image showed, and the model then embedded the guessed workspace link `…/ocu/files/<chat>/generated-image.png` as an image, which 404'd and rendered as "图片不可用" (#713). The image was only a WebUI file: the OCU wrapper copies chat images into the workspace only before its next tool call (#707), and this chat made none. Every image was called `generated-image.png`, and the workspace suffixes collisions, so any name the model guessed was unreliable. The owner also asked that images get a descriptive name.

## Decision

`generate_image` and `edit_image` (`tools/builtin.py`) take an optional `name` and make one call, right after the image service returns: `save_generated_images(chat_id, user, images, name)` in `utils/ocu_image_workspace.py`. It returns the image entries and extra tool-result keys. The rest of `builtin.py` is unchanged apart from merging those keys into both result dicts.

- **Name.** NFC; tabs and line breaks become spaces; `/`, `\` and other control characters are dropped; whitespace runs become one space; leading dots are trimmed; at most 60 characters; an extension equal to the real one is not repeated; the extension comes from the generated content type. Empty or missing → `generated-image`. OCU's `check_upload_name` accepts Unicode and spaces, so they are kept. When `name` is given, the WebUI file's display name (`Files` metadata `name`) and the returned entries use it. The call runs before the entries are persisted to the message and emitted, so the chat and the download both show the name. Storage paths are not renamed.
- **Upload.** Only when `ENABLE_OCU_WORKSPACE` is on, the chat is saved (not `temporary:`/`local:`/`channel:`), and `Chats.is_chat_owner(chat_id, user.id)`. Each image's bytes come from `Storage.get_file(row.path)` for a file row the requester owns. `OcuClient.upload_file` posts them to `POST /api/uploads/{chat_id}/{quoted name}` with the internal bearer, `X-OCU-Attachment-Id: <file id>`, redirects not followed, under the client's 30 s timeout. OCU's `store_upload` writes the chat's `outputs/` directory under its lifecycle lock without a sandbox. It records an import receipt, so the wrapper's `_imported_attachment_ids` skips the id on the next OCU tool call.
- **Result.** Success adds `workspace_files` (`/mnt/user-data/files/<name OCU stored>`) and `workspace_note`. A failed image adds `workspace_error` (`<n> of <total> image(s) not saved to the workspace: <reason>`, reason from the error class and HTTP status only) and a warning log. Generation never fails because of the workspace. When a gate does not pass, no key is added.

`ENABLE_OCU_WORKSPACE` is read through `ocu_sandbox_cleanup.workspace_enabled` (renamed from `_workspace_enabled`), not parsed a third time. `builtin.py`'s bounded size ceiling in `constraints.yaml` rises from 4525 to 4534 for the nine hook lines.

## Alternatives considered

- **Upload after `add_message_files_by_id_and_message_id` (fixture seam)** — the persisted message entries and the emitted event would keep `generated-image.png` while the file row and workspace say `雪崩.png`.
- **Upload `image_files` (the persisted list)** — after persistence it is the whole message's file list, so a second generation in one message would upload the first image again.
- **Rename inside `routers/images.py`'s per-engine upload paths** — five engine branches in an upstream file; the owner excluded it.
- **Fall back to the requested name when OCU's response has no `filename`** — the requested name is wrong whenever OCU suffixed it; a missing name is reported as an error instead.
- **Leave it to the wrapper's next-call sync (#707)** — the model writes the link in the same turn, before any OCU tool call.

## Consequences

A generation with the workspace on now waits for one local upload per image before the image is shown; an OCU that hangs delays it by up to the 30 s client timeout. A tombstoned (deleted) chat makes OCU refuse the upload, which surfaces as `workspace_error`. The display name has no collision suffix even when the workspace copy has one. With remote storage (S3/GCS) `Storage.get_file` leaves its downloaded copy under the upload directory, as upstream's file routes do.
