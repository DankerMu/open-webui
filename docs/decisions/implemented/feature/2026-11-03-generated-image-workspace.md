---
id: 2026-11-03-generated-image-workspace
title: Generated images are renamed before they are shown and uploaded into the chat workspace after
kind: feature
status: implemented
date: 2026-11-03
supersedes: none
references: openspec/changes/webui-generated-image-workspace, DankerMu/open-webui#713, DankerMu/open-webui#707
---

# Generated images are renamed before they are shown and uploaded into the chat workspace after

## Problem

On the acceptance VPS the model drew an image, the image showed, and the model then embedded the guessed workspace link `…/ocu/files/<chat>/generated-image.png` as an image, which 404'd and rendered as "图片不可用" (#713). The image was only a WebUI file: the OCU wrapper copies chat images into the workspace only before its next tool call (#707), and this chat made none. Every image was called `generated-image.png`, and the workspace suffixes collisions, so any name the model guessed was unreliable. The owner also asked that images get a descriptive name.

## Decision

`generate_image` and `edit_image` (`tools/builtin.py`) take an optional `name` and make two calls into `utils/ocu_image_workspace.py`:

1. `name_generated_images(images, name, user)` inside the existing `image_files` comprehension, so it runs before the entries are persisted to the message and emitted. It renames the entries in place and returns them.
2. `save_generated_images(chat_id, user, images)` after the emit, while the result dict is built (inline in the emitter branch, one `workspace` line before the no-emitter return). It returns the extra tool-result keys.

The image is therefore persisted and shown before any OCU request. A stuck OCU delays only the tool result, and a Stop during the upload (task cancel) leaves the image in the message.

- **Name.** NFC; tabs and line breaks become spaces; `/`, `\` and other control characters are dropped; whitespace runs become one space; leading dots are trimmed; at most 60 characters; an extension equal to the real one is not repeated; the extension comes from the generated content type. Empty or missing → `generated-image`. OCU's `check_upload_name` accepts Unicode and spaces, so they are kept. When `name` is given, `Files.update_file_name_by_id` sets the file's `filename` column (FilesModal, file search) and metadata `name` (downloads), and the entries take it, so the chat shows it too. If the rename fails or the row is missing or foreign, the image keeps its name. Storage paths are not renamed. The tool docstring asks for a short descriptive name in the user's language, from the request, without an extension; the model has not seen the image when it names it.
- **Upload.** Only when `ENABLE_OCU_WORKSPACE` is on, the chat is saved (not `temporary:`/`local:`/`channel:`), and `Chats.is_chat_owner(chat_id, user.id)`. Each image's bytes come from `Storage.get_file(row.path)` for a file row the requester owns; a row that is gone or foreign by then is reported as `image file not found`. `OcuClient.upload_file` posts them under the row's file name to `POST /api/uploads/{chat_id}/{quoted name}` with the internal bearer, `X-OCU-Attachment-Id: <file id>`, redirects not followed, under the client's 30 s timeout. OCU's `store_upload` writes the chat's `outputs/` directory under its lifecycle lock without a sandbox. It records an import receipt, so the wrapper's `_imported_attachment_ids` skips the id on the next OCU tool call.
- **Result.** Success adds `workspace_files` (`/mnt/user-data/files/<name OCU stored>`) and `workspace_note`, which tells the model not to embed those workspace paths as images. It says nothing about the image being visible, because the no-emitter branch never showed it. A failed image adds `workspace_error` (`<n> of <total> image(s) not saved to the workspace: <reason>`, reason from the error class and HTTP status only) and a warning log with the traceback. Generation never fails because of the workspace. When a gate does not pass, no key is added.

`ENABLE_OCU_WORKSPACE` is read through `ocu_sandbox_cleanup.workspace_enabled` (renamed from `_workspace_enabled`), not parsed a third time. `builtin.py`'s bounded size ceiling in `constraints.yaml` rises from 4525 to 4534 for the nine hook lines (owner-approved 2026-11-03). The budget is why the rename call sits in the `image_files` comprehension and mutates the entries in place instead of taking a line of its own.

## Alternatives considered

- **One call that renames and uploads before persisting** — the first version of this change. A stuck OCU delayed the image by up to n×30 s, and a Stop in that window dropped the image from the message.
- **One call after persisting** — the persisted message entries and the emitted event would keep `generated-image.png` while the file row and workspace say `雪崩.png`.
- **Rename through `update_file_metadata_by_id`** — FilesModal lists the `filename` column and search matches it, so both kept `generated-image.png`.
- **Upload `image_files` (the persisted list)** — after persistence it is the whole message's file list, so a second generation in one message would upload the first image again.
- **Rename inside `routers/images.py`'s per-engine upload paths** — five engine branches in an upstream file; the owner excluded it.
- **Fall back to the requested name when OCU's response has no `filename`** — the requested name is wrong whenever OCU suffixed it; a missing name is reported as an error instead.
- **Leave it to the wrapper's next-call sync (#707)** — the model writes the link in the same turn, before any OCU tool call.

## Consequences

The tool result waits for one local upload per image after the image is shown; an OCU that hangs delays the model's continuation by up to the 30 s client timeout per image. A tombstoned (deleted) chat makes OCU refuse the upload, which surfaces as `workspace_error`. The display name has no collision suffix even when the workspace copy has one. With remote storage (S3/GCS) `Storage.get_file` leaves its downloaded copy under the upload directory, as upstream's file routes do.
