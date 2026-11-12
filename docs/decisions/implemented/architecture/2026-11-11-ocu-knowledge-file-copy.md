---
id: 2026-11-11-ocu-knowledge-file-copy
title: The OCU tool wrapper copies one knowledge-base file into the workspace on the chat owner's read access
kind: architecture
status: implemented
date: 2026-11-11
supersedes: none
references: docs/plans/2026-11-11-knowledge-copy-and-skill-display-names.md, ocu-knowledge-file-copy, DankerMu/open-webui#782, DankerMu/open-webui#784, DankerMu/open-webui#785, DankerMu/open-webui#786, DankerMu/open-webui#787, DankerMu/open-computer-use#230, DankerMu/open-computer-use#231, DankerMu/open-computer-use#232, 2026-10-02-ocu-unified-workspace-files
---

# The OCU tool wrapper copies one knowledge-base file into the workspace on the chat owner's read access

## Problem

RAG extracts only the text of a knowledge-base document, and the sandbox has no network, so the model cannot reach the original docx or pdf or the figures inside it. Bytes enter the workspace only through OCU's internal `POST /api/uploads/{chat_id}/{name}`. The choices were where the copy tool runs, whose rights decide which file may be copied, and how a repeated copy behaves, given that a receipted upload returns its recorded path even after the file was deleted. The source plan is [知识库文档拷入沙箱 · 上传 skill 的中文显示名](../../../plans/2026-11-11-knowledge-copy-and-skill-display-names.md) (part A); the OpenSpec change is `ocu-knowledge-file-copy` (design Decisions 1-3). This refines the receipt rule of [2026-10-02-ocu-unified-workspace-files](2026-10-02-ocu-unified-workspace-files.md).

## Decision

- **Placement.** The tool `copy_knowledge_file(file_id, description)` lives in the OCU Open WebUI tool wrapper `openwebui/tools/computer_use_tools.py`. The wrapper runs in the WebUI process, where the OCU tools already run, and it already holds the attachment-sync upload helper that the tool reuses. It copies one file per call into `/mnt/user-data/files/` and returns the sandbox path.
- **Access rule.** A file is copied only when it is linked through `knowledge_file` (`Knowledges.get_knowledges_by_file_id`) to a knowledge base that the chat's owner owns or may read. A read grant counts when `AccessGrants.has_access` admits it for the owner, one of the owner's groups (`Groups.get_groups_by_member_id`) or every user (`user:*`). The subject is the chat's owner from `Chats.get_chat_by_id(chat_id).user_id`, not the caller, because an administrator can run a completion in another user's chat. Administrator status grants nothing, and the legacy `file.meta.collection_name` is not consulted. A missing chat or owner, a file outside every readable knowledge base, a missing file or missing stored bytes returns an `Error:` line, and nothing is uploaded.
- **Repeated copies.** The upload sends the WebUI file id as `X-OCU-Attachment-Id`, so a second copy of the same file in the same chat returns the first copy's path, edited or not. It also sends `X-OCU-Reimport-Missing: 1`. With that header, `store_upload` checks under the per-chat receipt lock whether the receipted `stored_name` still opens as a regular file under the chat's outputs with the no-follow `_open_regular_relative`. A missing file, a missing outputs root, or a symlink, directory or other non-regular entry at that name counts as missing. The bytes are then stored as a new upload, with the collision suffix and the no-replace claim, and the receipt is rewritten; an existing entry is never replaced, truncated or followed. Any other `OSError` is a 500, and a receipted name that fails `check_upload_name` is a corrupt receipt (500). A header value other than `1`, an empty value included, or `1` without a non-empty attachment id returns 400 before anything is stored. Uploads without the header, which attachment sync, chat-image sync and WebUI's generated-image upload (`OcuClient.upload_file`) send, keep the receipt rule of 2026-10-02 unchanged.
- **OCU-local detail.** The shared upload helper, the string results and the tool and prompt guidance (design Decisions 4-6) are recorded in the change's `design.md`.

## Alternatives considered

- **A WebUI builtin tool** — it would put a new tool and its access resolver into the upstream builtin-tool spine, beside the existing `OcuClient.upload_file` seam, instead of next to the OCU tools in the wrapper.
- **An MCP tool** — it would run in the orchestrator, which cannot read WebUI storage.
- **`has_access_to_file` as the access rule** — it also admits direct ownership, shared chats, channels and models; the owner limited copying to knowledge-base files.
- **The caller's rights as the subject** — an administrator's own grants would put a document into another user's sandbox.
- **Honour `file.meta.collection_name`** — it can name a knowledge base the file has since left; membership is the `knowledge_file` link.
- **The wrapper checks for the copy itself** — it needs a second OCU call and a stored-name lookup, and it races with the write.
- **No receipt and a fresh copy on every call** — the owner chose deduplication.
- **Re-import missing files for every receipted upload** — it brings back attachments the user deleted on purpose, which 2026-10-02 forbids.

## Consequences

- Deploy: rebuild and redeploy the computer-use-server image. Then remove the `.computer-use-initialized` marker in the `open-webui-data` volume and re-run `open-webui-init`, as in OCU `deploy/production-like-test/NETWORK-HARDENING.md` § "Re-running the initializer and removing the wrapper model (#590)" step 2; Open WebUI stores tool source in its database, and only init writes it. Run that section's step 3 once afterwards: it exits 0 only when the stored tool equals the shipped 4.3.0 source.
- Re-running init replaces the stored valves with the seeded values, as that section lists.
- Rollback: redeploy the previous OCU image and re-run init with the previous wrapper, removing the marker as in step 2. Receipts written with the header keep their format, so the previous code reads them.
- Accepted gap: a chat whose container already exists keeps the old sandbox `README.md` text, without the `copy_knowledge_file` sentence, until it gets a new container.
- Coupling: the wrapper imports WebUI's `Knowledges`, `AccessGrants`, `Groups` and `Chats` in-process, and OCU tests them only with fakes. A WebUI rebase that changes those signatures could break the tool without failing a test in either repository.
- With the header, a copy the user renamed looks missing and is copied again under the original name; the renamed file is untouched.
- The model needs Open WebUI's built-in knowledge tools to find a file id. The deployment must keep them enabled; nothing here verifies that.
