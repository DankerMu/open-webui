# Design

## Context

See proposal.md for motivation and the source plan (`docs/plans/2026-11-11-knowledge-copy-and-skill-display-names.md`, part A) for the code survey. Constraints that shape the approach:

- The sandbox cannot reach WebUI or the internet. Bytes enter the workspace only through OCU's internal `POST /api/uploads/{chat_id}/{name}`, which the tool wrapper already calls from the WebUI process (`_sync_uploaded_files`).
- The wrapper runs inside the WebUI process and already imports WebUI models (`Files`, `Users`, `has_access_to_file`) to resolve attachments (`_readable_files`).
- A receipted upload (`X-OCU-Attachment-Id`) returns the stored record whenever the id already has a receipt, even when the file was deleted. `tests/test_upload_claim.py::test_reimported_attachment_id_does_not_resurrect_renamed_or_deleted_file` pins that behavior for attachment sync.
- Knowledge-base membership is the `knowledge_file` link (`Knowledges.get_knowledges_by_file_id`). Read access to a knowledge base is ownership or an `AccessGrants` read grant to the user or one of their groups (`backend/open_webui/utils/access_control/files.py:45-63`).

## Goals / Non-Goals

**Goals:**

- The model can copy one knowledge-base document per call into the workspace and gets back its sandbox path.
- Only documents in a knowledge base the chat's owner may read are copied, whoever triggers the call.
- Repeated copies in one chat do not pile up duplicates, and a copy the user deleted can be copied again.

**Non-Goals:**

- Syncing a whole knowledge base when it is attached with `#`.
- Copying several files in one call.
- Copying files that are not in a knowledge base, such as other chats' attachments.
- Multimodal embedding, figure extraction inside RAG, or download links.
- Any change to WebUI backend code or to attachment and generated-image sync behavior.
- Making the knowledge tools themselves available; the flow assumes the model has Open WebUI's built-in knowledge tools (native function calling with the knowledge builtin enabled); the deployment must keep them enabled, which this change does not verify.

## Decisions

1. **The tool lives in the OCU tool wrapper, not in a WebUI builtin or an MCP tool.**
   - Only the wrapper has both the WebUI file store and the OCU upload path.
   - An MCP tool would run in the orchestrator, which cannot read WebUI storage.
   - A WebUI builtin would duplicate the wrapper's upload code in the upstream spine.
2. **Access rule: knowledge-base membership plus the chat owner's read access to that knowledge base.**
   - The subject is the chat's owner, loaded with `Chats.get_chat_by_id(chat_id).user_id`, not the caller. Open WebUI lets an administrator run a completion in another user's chat (`backend/open_webui/main.py:1472`), and the owner chose to judge by the chat owner's rights (ledger #18). An administrator's own grants therefore never put a document into another user's sandbox, and a document the owner may read can be copied whoever triggers the call.
   - The rule is evaluated in the wrapper with `Knowledges.get_knowledges_by_file_id(file_id)`, then knowledge-base ownership by the owner or `AccessGrants.has_access(user_id=<owner>, resource_type='knowledge', resource_id=<kb>, permission='read', user_group_ids=<the owner's groups from Groups.get_groups_by_member_id>)`. That call already honours `user:*` grants (`backend/open_webui/models/access_grants.py:574-592`), so a knowledge base open to everyone is readable.
   - A missing chat or owner returns `Error:` before any file lookup.
   - `has_access_to_file` alone is rejected because it also admits direct ownership, shared chats, channels and models, and the owner limited copying to knowledge-base files.
   - The legacy `file.meta.collection_name` path is not consulted: membership is the `knowledge_file` link, and that field can name a knowledge base the file has since left.
   - Administrator status grants nothing, matching `_readable_files` (admin read access is not execution authority in a user's sandbox).
3. **Reuse the receipted upload with an opt-in re-import header.**
   - The tool sends the WebUI file id as `X-OCU-Attachment-Id`, so a second copy of the same file in the same chat returns the first copy's path.
   - It also sends `X-OCU-Reimport-Missing: 1`. With that header, `store_upload` checks, under the per-chat lock it already holds for receipts, whether the receipted `stored_name` still opens as a regular file under the chat's outputs, using the no-follow open that reads uploads (`_open_regular_relative`). Any failure to open it as a regular file counts as missing: `FileNotFoundError`, and also the traversal denial raised for a symlink, a directory or another non-regular entry. If it is missing, the bytes are stored as a new upload (collision suffix included) and the receipt is rewritten to the new name, size and MD5.
   - A header-on upload with no receipt for the id is a normal receipted upload.
   - Alternative rejected: the wrapper checks existence itself. It would need a second OCU call and a stored-name lookup, and it would race with the write.
   - Alternative rejected: no receipt and a fresh copy every call. The owner chose deduplication.
   - Alternative rejected: re-importing missing files for every receipted upload. It would bring back attachments the user deleted on purpose, which the existing test forbids.
   - Any present header value other than `1`, including an empty value, is rejected with 400, and so is `1` without a non-empty `X-OCU-Attachment-Id`, so a malformed request fails loud instead of silently keeping the old behavior.
4. **One shared upload helper.**
   - `_sync_uploaded_files` gains an optional extra-headers argument, and the tool calls it with one entry.
   - Entries come from a resolver that applies Decision 2 and otherwise shares `_readable_files`' row loading and naming (basename of `meta.name`, else `filename`, else the id).
   - No second upload loop is written.
5. **Results are strings, never exceptions.**
   - Success: `Copied <display name> to /mnt/user-data/files/<stored_name>`, plus the existing `[DISCOVERY WARNING]` line when the upload reports a discovery failure.
   - Refusal or failure: a line starting with `Error:` that names the reason (chat not found, not in a knowledge base the chat owner can read, file not found, no stored bytes, upload failed). `_sync_uploaded_files` counts failures instead of raising, so `synced == 0` maps to the upload-failed error.
   - Status events follow `_run_tool`'s pattern (in progress, then complete or error). After a successful upload the tool calls `_emit_workspace_hint`, because it does not go through `_run_tool` and an open Files sidebar would otherwise not refresh.
6. **Guidance in two places.**
   - The docstring is what the model sees as the tool description. It lists the four steps of the spec: knowledge tools for the id, this tool, the docx or pdf skill, and markdown image links to the extracted files.
   - The system prompt sentence starts with ``If a `copy_knowledge_file` tool is available``, because MCP clients receive the same prompt without the tool.

## Sketch seams under test

- `Tools.copy_knowledge_file` called directly in `tests/test_tools.py`, with a recorded upload server and the existing `_FakeWebUI` stub. The stub is extended with `open_webui.models.knowledge`, `access_grants`, `groups` and `chats` fakes whose async signatures match the real ones, and with grants modelled as (resource type, resource id, principal type, principal id, permission) rows. This is the highest seam the owner-visible behavior passes through (access rule, headers, result text) and the existing pattern for `_readable_files`.
- `POST /api/uploads/{chat_id}/{name}` against the real `upload_server` fixture in `tests/test_upload_claim.py`. The re-import rule is endpoint behavior, and the fixture already exercises receipts on disk.
- `GET /system-prompt` in `tests/orchestrator/test_system_prompt_endpoint.py` for the conditional sentence.

## Risks / Trade-offs

- [A renamed copy looks missing] → With the header, a copy the user renamed is copied again under the original name. This is accepted: the model asked for the document, and the renamed file is untouched.
- [Large documents] → Upload reads the whole file into memory with a 30 s client timeout, as attachment sync does. A very large PDF may fail, and the tool then returns an `Error:` line. No new limit is introduced.
- [Stale tool source in deployments] → Open WebUI stores tool source in its DB. The deployment must remove the init marker and re-run init (Migration Plan).

## Migration Plan

1. Merge the OCU change, then bump the WebUI pin.
2. Deploy: rebuild the computer-use-server image, remove the init marker, re-run init.
3. Rollback: redeploy the previous OCU image and re-run init with the previous wrapper. Receipts written with the header have the same format as before, so the old code reads them.

## Not yet specified

None.

## Open Questions

None.
