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

Suggested fixture level: expanded - a model-callable path that moves stored files across the WebUI/sandbox boundary under an access rule.
Minimal mergeable slice: atomic - the tool, its access rule and the header it sends are one behavior with one test seam, and the shared helper's new argument has no other caller. Depends on 1.1.

## 3. [ocu] System prompt sentence

- [ ] 3.1 In `computer-use-server/system_prompt.py` `<notes_on_user_uploaded_files>`, add the sentence of design.md Decision 6, starting with ``If a `copy_knowledge_file` tool is available``. Verify with a case in `tests/orchestrator/test_system_prompt_endpoint.py`: the rendered prompt for a saved chat contains exactly one sentence with that opening, inside the uploaded-files notes. Also run the full OCU unit-test command.

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
