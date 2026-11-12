# Tasks

Prefixes:

- `[ocu]` = sibling checkout `open-computer-use`. Branch `<tool>/<slug>` off `main`; tests live in the OCU repo root `tests/` and run with the unit-test command in its `AGENTS.md`.
- `[webui]` = this repository.

Every production change ships with its test in the same task, and each new test is red before the implementation (AGENTS.md § TDD). No task may implement an item from design.md Non-Goals.

## 1. [ocu] Opt-in re-import on the upload endpoint

- [x] 1.1 Add the `X-OCU-Reimport-Missing` header to the upload path.
  - **`computer-use-server/app.py` `upload_file`.** Read the header with the rules of spec requirement "Opt-in re-import on the upload endpoint":
    - absent means off;
    - `1` means on;
    - any other present value, including an empty one, returns 400 before anything is stored;
    - `1` without a non-empty `X-OCU-Attachment-Id` also returns 400.

    Pass the flag to `computer-use-server/uploads.py` `store_upload`.

  - **`store_upload`.** With the flag on and an id that already has a receipt, check the receipted `stored_name` with `_open_regular_relative` inside the per-chat lock that already guards receipts. Treat these as missing (design.md Decision 3): `FileNotFoundError`, a missing outputs root, and the traversal denial for a symlink, a directory or another non-regular entry. The attachment id is the trimmed value `upload_file` already computes; whitespace only counts as absent. When it is missing, store the bytes as a new upload and rewrite the receipt.

  Verify with new cases in `tests/test_upload_claim.py` against the `upload_server` fixture:
  - first copy with the header (no receipt yet) stores the file and records a receipt;
  - a deleted receipted file is written again with the header, and the receipt holds the new name, size and MD5;
  - a directory, and separately a symlink, at the receipted name leads with the header to a suffixed new copy and a rewritten receipt, and the occupant is untouched;
  - an edited receipted file is kept with the header, and the response reports the receipt;
  - `yes` and an empty value each get 400 with no file or receipt written;
  - `1` without an attachment id gets 400 with no file written;
  - the existing `test_reimported_attachment_id_does_not_resurrect_renamed_or_deleted_file` and `test_headerless_upload_does_not_create_or_mutate_receipts` stay green unchanged.

  Also run the full OCU unit-test command.

  **Task 1.1 required evidence** (authoritative where it is more specific than the bullets above):
  - Risk packs for this slice:
    - Public API — selected: header parsing and the 400 cases below.
    - File IO / path safety — selected: no-follow probe, occupant untouched, `stored_name` lexical guard.
    - Concurrency / shared state — selected: probe, publication and receipt rewrite stay inside the existing `with _combined_lock(chat_id)` in `store_upload`.
    - Error handling / partial outputs — selected: the error-path tests below.
    - Legacy compatibility — selected: Must preserve below.
    - Auth / secrets — not selected for 1.1: the route keeps its internal-bearer guard and the header grants nothing.
    - Documentation — not selected for 1.1: README/CHANGELOG move with the tool in 2.1.
  - Implementation facts:
    - The new `store_upload` parameter is keyword-only and defaults to off.
    - The probe opens the root with `_open_outputs_root(chat_id)`; `store_upload` holds no outputs fd at the receipt check.
    - It probes `_open_regular_relative(root_fd, Path(stored_name).parts)` after `stored_name` passes the `check_upload_name` rule; a failing name raises `CorruptReceiptsError`.
    - It closes the probe fd and the root fd on every path.
    - Publication of a re-store goes through `claim_file_no_replace` / `format_collision_name`, as a normal upload does.
    - Header validation in `upload_file` tests `is None` for absence, so an empty value is present and rejected.
  - Must preserve:
    - The headerless path stays byte-for-byte as today, including the generate_speech call `store_upload(chat, filename, audio)` in `mcp_tools.py`.
    - These tests pass unchanged: `test_reimported_attachment_id_keeps_edited_file_and_reports_original_metadata`, `test_reimported_attachment_id_does_not_resurrect_renamed_or_deleted_file`, `test_headerless_upload_does_not_create_or_mutate_receipts`, `test_corrupt_receipts_fail_explicitly_without_reimport`, `test_failed_receipt_write_leaves_prior_receipts_and_retries_without_overwrite`, and the `test_concurrent_*` tests.
    - The response shape stays `{status, filename, size, md5[, discovery]}`.
    - `GET /api/uploads/{chat}/imports` (read by the wrapper's `_imported_attachment_ids`) lists each id exactly once after a rewrite.
  - Sibling surfaces to check: `_open_outputs_root`, `_open_regular_relative`, `_lexical_parts`, `claim_file_no_replace`, `format_collision_name`, `read_import_receipts`, `write_import_receipts`, `_validate_receipts`, `_list_import_ids`, wrapper `_sync_uploaded_files` / `_imported_attachment_ids`, and generate_speech's `store_upload` call.
  - New tests in `tests/test_upload_claim.py` and their expected output (header value `1` unless stated):
    - **First copy, no receipt:** 200; the file is stored, and the receipt holds its name, size and MD5.
    - **Edited copy kept:** 200; the body carries the receipt's original `filename`, `size` and `md5`, not the edited bytes'; the file keeps its edited bytes; `imports.json` is byte-identical, `imported_at` included.
    - **Deleted copy:** 200; the body is the original unsuffixed name with `len(body)` and `md5(body)`; the directory holds exactly that one name; the receipt carries those three values and a new `imported_at`.
    - **Directory occupant, and separately a symlink occupant** (the symlink points at an existing regular file, to prove no-follow): body and receipt name `brief (2).docx`; the occupant's type and the target's bytes are unchanged.
    - **Every re-store:** other ids' receipts are unchanged and `/imports` lists the id once.
    - **Concurrent:** two simultaneous header-on uploads of one id whose copy was deleted give one new file, two identical responses and one receipt.
    - **Header validation:** `yes` and an empty value each get 400 with no file or receipt written; the same two values sent for an id whose copy was deleted also get 400 with no re-store and the receipt unchanged (validation runs before the storage branch); `1` with no `X-OCU-Attachment-Id`, and `1` with a whitespace-only one, each get 400 with no file written.
    - **Error paths:** corrupt `imports.json` with the header gives 500, no file written, `imports.json` unchanged. A receipt whose `stored_name` is absolute or contains `..` gives 500 with nothing written. A non-missing `OSError` (EIO) injected into the probe gives 500, no file written, the receipt unchanged.
    - **Receipt write fails once:** set up the deleted-copy case (receipted name absent) and send identical bytes on both attempts. The re-store publishes at the receipted unsuffixed name; `write_import_receipts` fails once, giving 500 with the receipt byte-identical. The retry with the header returns 200 with the prior receipt's `filename`, `size` and `md5`, and the outputs directory holds exactly that one file.
    - **Outputs root removed:** delete `outputs/` entirely and keep `.ocu/imports.json`. A header-on upload gives 200 with the unsuffixed name, `outputs/` is recreated holding that one file, and the receipt is rewritten. (`_open_outputs_root` also returns `None` for a symlinked chat dir or `outputs`; there the re-store's `ensure_workspace_directories` correctly answers 403. Do not treat `None` as "always re-store".)
    - Each new test is red against the unchanged source; for the empty-value case, confirm the test client really sends the empty header.

Suggested fixture level: expanded - a public upload-endpoint contract and on-disk receipts shared with attachment sync.
Minimal mergeable slice: atomic - one header and the single storage branch it switches; without the branch the header does nothing, and without the header the branch is unreachable.

## 2. [ocu] The copy tool

- [ ] 2.1 In `openwebui/tools/computer_use_tools.py`:
  - add `copy_knowledge_file(file_id, description)`, with the chat-owner knowledge-base access rule of design.md Decision 2 and the docstring of Decision 6;
  - give `_sync_uploaded_files` an optional extra-headers argument, and call it with `X-OCU-Reimport-Missing: 1` (Decision 4);
  - return the result strings of Decision 5, including the discovery warning and the upload-failed error;
  - call `_emit_workspace_hint` after a successful copy;
  - bump the tool `version`;
  - update `openwebui/tools/README.md` and `CHANGELOG.md`.

  In `tests/test_tools.py`, first extend `_FakeWebUI` as design.md "Sketch seams under test" describes. It needs knowledge, access-grant, group and chat fakes with the real async keyword signatures, and the fakes must assert `resource_type='knowledge'` and `permission='read'`. Then add one case per scenario of spec requirements "Copy one knowledge-base file into the workspace" and "Knowledge-base read access of the chat owner":
  - every refusal asserts zero upload requests;
  - every success asserts `X-OCU-Attachment-Id: <file id>` and `X-OCU-Reimport-Missing: 1` on the upload, and that the workspace-changed hint is emitted;
  - copying the same file twice in one chat returns the same path both times, with the recorded server answering the second upload from its receipt (spec "Second copy in the same chat");
  - the discovery-warning case and the upload-failure case (storage error, HTTP 500) assert the result text and that nothing is raised.

  Add a case asserting the tool docstring names the knowledge tools, the docx and pdf skills, and workspace file links.

  Cover the empty-chat rejection with a separate parametrization: `PUBLIC_TOOLS` also feeds tests that expect an MCP call, so it is not extended. Give the test its own explicit dispatch branch that asserts `copy_knowledge_file` itself ran, not the `sub_agent` fall-through of `_call_with_empty_chat`.

  Assert in `test_public_tools_sync_new_attachment_before_command` that attachment-sync uploads carry no `X-OCU-Reimport-Missing` header. Run the full OCU unit-test command.

  **Task 2.1 required evidence** (authoritative where it is more specific than the bullets above):
  - Risk packs for this slice:
    - Auth / permissions — selected: the access table below.
    - File IO / path safety — selected: the collision, heal and edited-copy cases (the server-side no-follow probe is proven in 1.1).
    - Public API (model-facing tool signature, result strings, docstring) — selected: exact-string asserts and the docstring test.
    - Error handling / partial outputs — selected: the error texts and failure injection below.
    - Legacy compatibility — selected: Must preserve below.
    - Documentation — selected: one row in the `openwebui/tools/README.md` "Tools Provided" table, one CHANGELOG Unreleased "Added" entry, and `version: 4.2.0` → `4.3.0` in the module docstring.
    - Concurrency — not selected: the server serializes under the per-chat lock (1.1); the wrapper adds no shared state.
    - Auth / secrets — not selected: no new credential; the internal bearer is reused.
  - Upload shim: `_GuardedOCU.upload` in `tests/test_tools.py` (about lines 373-396) passes `x_ocu_reimport_missing=request.headers.get("x-ocu-reimport-missing")` as a keyword to `ocu_app.upload_file`, and adds a `reimport_missing` key to a `self.uploads` record only when the header is present. The existing exact `ocu.uploads == [{"filename": ..., "attachment_id": ...}]` asserts therefore stay unchanged and prove attachment sync sends no header.
  - The tool does not call `_imported_attachment_ids`, does not take `__files__`, does not run `_sync_files_if_needed`, and makes no `/mcp` call; every case asserts zero `/api/uploads/{chat}/imports` and zero `/mcp` requests.
  - Check order and exact texts (tests assert full-string equality):
    1. `_prepare_tool_call` — its `[TOOL ERROR]` / `[CONFIG ERROR]` result is returned unchanged.
    2. `Chats.get_chat_by_id(<chat_id>)` (positional; the real first parameter is `id`) returns None or raises → `Error: chat not found`.
    3. No file row → `Error: file <id> not found`.
    4. Access rule fails → `Error: file <id> is not in a knowledge base the chat owner can read`. Checked before the stored-path check, so an unreadable file never reveals whether it has stored bytes. (The real `get_knowledges_by_file_id` swallows its errors and returns `[]`, so a DB error there also gives this text.)
    5. Empty `row.path` → `Error: file <id> has no stored bytes`.
    6. `synced == 0` → `Error: upload of <display name> failed`.
  - Success is exactly `Copied <display name> to /mnt/user-data/files/<stored name>`, with `<stored name>` from `sync_result["stored"]` (the server's `filename`), not the requested name. With a discovery failure, the `[DISCOVERY WARNING] ...` line from `sync_result["warnings"]` follows after `\n\n`. Collision case: an unrelated `报告.docx` is pre-seeded, the result names `报告 (2).docx`, and the seeded file's bytes are unchanged.
  - Status events: `description` (or a fixed fallback when empty) is the in-progress text; the final event is `complete` with a fixed text on success (discovery-warning case included) or `error` with a fixed text on any `Error:` result, and has `done: True`. Tests pin the texts. The workspace hint is emitted exactly once on success and in the discovery-warning case; on every refusal (chat-id and config errors included) and on upload failure, `_workspace_hints(events) == []`.
  - Fakes (async, real keyword names), registered as `open_webui.models.knowledge`, `open_webui.models.access_grants` and `open_webui.models.groups`:
    - `Knowledges.get_knowledges_by_file_id(file_id, db=None)` returning objects with `.id` and `.user_id`;
    - `AccessGrants.has_access(user_id, resource_type, resource_id, permission='read', user_group_ids=None, db=None)`: matches `user:*`, `user:<id>` and `group:<gid>` rows, requires an exact permission match, has no admin clause, and looks up groups itself when `user_group_ids` is None; it asserts `resource_type == 'knowledge'` and `permission == 'read'`;
    - `Groups.get_groups_by_member_id(user_id, db=None)`.
      KB grants get their own kwarg, separate from the existing `grants` (file_id, user_id) pairs; `_row` gains `path` and `collection_name` knobs. Every copy case asserts `webui.access_checks == []`, proving `has_access_to_file` is never called.
  - Access cases, each with chat C owned by OWNER and file F:

    | Case                         | `__user__` | Rows and grants                                                  | Expected                    |
    | ---------------------------- | ---------- | ---------------------------------------------------------------- | --------------------------- |
    | Owner-owned KB               | OWNER      | K owned by OWNER contains F                                      | copied                      |
    | Direct grant                 | OWNER      | K owned by OTHER; `knowledge/K/user/OWNER/read`                  | copied                      |
    | Group grant                  | OWNER      | OWNER in group G; `knowledge/K/group/G/read`                     | copied                      |
    | Open to everyone             | OWNER      | `knowledge/K/user/*/read`                                        | copied                      |
    | Several KBs                  | OWNER      | K1 owned by OTHER, ungranted; K2 owned by OWNER                  | copied                      |
    | Ungranted                    | OWNER      | K owned by OTHER, no grants                                      | refused                     |
    | Write-only grant             | OWNER      | K owned by OTHER; `knowledge/K/user/OWNER/write`                 | refused                     |
    | Admin in another user's chat | ADMIN      | C owned by OWNER; K owned by ADMIN                               | refused                     |
    | Other caller, owner may read | OTHER      | K owned by OWNER                                                 | copied into OWNER's chat    |
    | Admin owner without grant    | ADMIN      | C owned by ADMIN; K owned by OTHER, no grant                     | refused                     |
    | Legacy name only             | OWNER      | F's meta `collection_name` = K owned by OWNER; F not linked to K | refused                     |
    | Own upload outside any KB    | OWNER      | F owned by OWNER, in no KB                                       | refused                     |
    | Unknown id                   | OWNER      | no row                                                           | refused (`not found`)       |
    | No stored bytes              | OWNER      | readable F with `path=None`                                      | refused (`no stored bytes`) |

    Every refusal asserts zero upload requests.

  - Heal cases end to end through the forwarding shim and the real `upload_file` / `store_upload`:
    - **Second copy:** two upload POSTs, both with `X-OCU-Reimport-Missing: 1`, one stored file, two identical results.
    - **Copy deleted, then copied again:** delete the stored copy and copy again; two POSTs with header `1`; the workspace holds F's bytes again under the unsuffixed name, and the result names that path.
    - **Edited copy kept:** edit the stored copy and copy again; the edited bytes are unchanged and the result names the receipted path.
    - Mutation proof: removing the shim forward makes the deleted-copy case red (the second-copy case alone cannot prove forwarding, because the headerless path also answers from the receipt).
  - Failure injection, each asserting the exact `Error: upload of <display name> failed` (or the storage text below) and that nothing is raised:
    - storage error, run against `_with_guard`: no `webui.contents` entry for the key, so the fake `get_file` raises `FileNotFoundError`; zero upload POSTs, `ocu.stored_files(chat) == {}`, and an empty `GET /imports` id list afterwards;
    - HTTP 500: a `_local_origin` responder answers the upload with 500; `origin.requests` holds exactly one POST to `/api/uploads/<chat>/<name>` carrying `X-OCU-Attachment-Id: <file id>` and `X-OCU-Reimport-Missing: 1`, with no retry and no other request;
    - unreachable: `ORCHESTRATOR_URL` points at a closed port (call `_disable_proxy_env`); assert only the exact result and that nothing is raised.
    - The server-side "no receipt on a failed upload" is already proven by the task 1.1 error-path tests; the zero `/imports` / `/mcp` counts apply to the cases that run against the guarded OCU server.
  - Any exception from `Files.get_file_by_id`, `has_access` or `get_groups_by_member_id` yields a result starting with `Error:` with nothing raised and zero uploads; the implementer picks the text and the PR names it.
  - Test plumbing: the `Chats` fake and the new knowledge fake record their calls (for the "no chat or knowledge lookups" asserts), and `_FakeWebUI` honours the new `path` knob for the storage-error and `path=None` rows.
  - Config and empty chat: add the copy tool to a `[CONFIG ERROR]` case like `test_unusable_credentials_reject_before_upload_or_probe`; the empty-chat and config-error cases also assert `webui.lookups == []` and no chat or knowledge lookups.
  - Shared resolver: factor row loading and naming (`os.path.basename(meta.get("name") or row.filename or file_id)`) out of `_readable_files` into one helper both resolvers call. `_readable_files` keeps its caller-based rule (owner, or `has_access_to_file` read, no admin clause), its log lines and its return value byte for byte.
  - Must preserve: `_sync_uploaded_files(orchestrator_url, chat_id, entries, internal_token, debug=False, *, extra_headers=None)` — keyword-only, default None, applied after the attachment-id header; the call in `_sync_files_if_needed` unchanged; attachment and chat-image sync POSTs carry no `X-OCU-Reimport-Missing`; `PUBLIC_TOOLS` and `_call_with_empty_chat` unchanged; `tests/orchestrator/test_tool_descriptions.py::test_tool_set_is_the_five_tools_plus_generate_speech` stays green unchanged (the tool is wrapper-only).
  - Docstring test: the tokens `search_knowledge_files` or `query_knowledge_files`, `docx`, `pdf`, `/mnt/user-data/files/` and `![` appear in the description part of the docstring — the text before the first line matching `:param` or `:return`, mirroring Open WebUI `parse_description` (`backend/open_webui/utils/tools.py:805-828`), which becomes the tool description; a match elsewhere in `__doc__` does not count. `:param file_id:` and `:param description:` are matched with the same `:param (\w+):` regex (`tools.py:844`), since OCU tests cannot import `open_webui`.
  - Each new test is red against the unchanged source, except tests that only pin unchanged behavior, which the PR names.

Suggested fixture level: expanded - a model-callable path that moves stored files across the WebUI/sandbox boundary under an access rule.
Minimal mergeable slice: atomic - the tool, its access rule and the header it sends are one behavior with one test seam, and the shared helper's new argument has no other caller. Depends on 1.1.

## 3. [ocu] System prompt sentence

- [x] 3.1 In `computer-use-server/system_prompt.py` `<notes_on_user_uploaded_files>`, add the sentence of design.md Decision 6, starting with ``If a `copy_knowledge_file` tool is available``. Verify with a case in `tests/orchestrator/test_system_prompt_endpoint.py`: the rendered prompt for a saved chat contains exactly one sentence with that opening, inside the uploaded-files notes. Also run the full OCU unit-test command.

  **Task 3.1 required evidence** (authoritative where it is more specific than the line above):
  - Exact sentence, added as the last line before `</notes_on_user_uploaded_files>`, not reworded: ``If a `copy_knowledge_file` tool is available, it brings a knowledge-base document's original file into `/mnt/user-data/files/`, where you can process it like an uploaded file.`` (`FULL_SENTENCE` below).
  - Implementation facts: static text in `SYSTEM_PROMPT_BEFORE_SKILLS`; no `PROMPT_FEATURES` entry; `_RenderKey` and `_render_uncached` unchanged; not gated by video, `user_email` or `chat_id`.
  - Endpoint test in `tests/orchestrator/test_system_prompt_endpoint.py`: `GET /system-prompt` with only `params={"chat_id": "<uuid>"}` and the existing bearer token (no `user_email`, no `X-OCU-Features`) gives 200, and the body has ``count("If a `copy_knowledge_file` tool is available") == 1``, `count(FULL_SENTENCE) == 1`, the opening and closing `notes_on_user_uploaded_files` tags once each, and the sentence's index between them.
  - Variants: `SYSTEM_PROMPT_TEMPLATE` and `build_system_prompt(skills_xml=<one user skill>)` each contain `FULL_SENTENCE` exactly once, parametrized as in `test_prompt_view_text_models.py`; this covers the no-params, `user_email` and video renders.
  - Must preserve: with the new line removed, the notes block equals today's byte for byte; the sentence names neither `/mnt/user-data/uploads` nor `/mnt/user-data/outputs` (`test_rendered_prompt_names_only_workspace_files_path`); `test_system_prompt_endpoint.py`, `test_prompt_features.py` (its `video.replace(block) == plain` equality), `test_prompt_view_text_models.py`, `test_prompt_generated_images.py` and `test_vision_skill_listing.py` pass unchanged.
  - Risk packs for this slice: Documentation selected — one Unreleased line in OCU `CHANGELOG.md` in this PR (OCU `CLAUDE.md` requires a CHANGELOG entry per PR). Legacy compatibility selected — MCP clients, `sub_agent` and the sandbox `README.md` get the same sentence, and the conditional wording is the compatibility measure; a chat whose container already exists keeps the old `README.md` text until it gets a new container (accepted). Public API not selected — the `text/plain` body only gains text. Release/packaging is covered by 4.1.
  - Red first: the new tests fail against the unchanged source. Mutation proof: removing the `` `/mnt/user-data/files/` `` clause, and separately moving the sentence outside the closing tag, each make the test fail.

Suggested fixture level: compact - one prompt sentence with one endpoint assertion.
Minimal mergeable slice: atomic - a single sentence and its test; it does not depend on 2.1 to stay green, because the sentence is conditional.

## 4. [webui] Pin and decision record

- [ ] 4.1 Bump `constraints.yaml ocu_checkout.sha` to the OCU commit that contains tasks 1.1, 2.1 and 3.1. Add the decision record `docs/decisions/implemented/architecture/2026-11-11-ocu-knowledge-file-copy.md`: it records design.md Decisions 1-3, links the source plan, and states the deployment step (rebuild the computer-use-server image, remove the init marker, re-run init). Verify with `make smoke-proxy`, `make decisions-verify` and `make doc-gate`.

Suggested fixture level: compact - a pin bump and a record; the behavior is proven in the OCU repository.
Minimal mergeable slice: atomic - the pin and its record ship together, as AGENTS.md requires. Depends on 1.1, 2.1 and 3.1.
