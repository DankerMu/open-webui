# Tasks

Prefixes:

- `[ocu]` = sibling checkout `open-computer-use`. Branch `<tool>/<slug>` off `main`; tests live in the OCU repo root `tests/` and run with the unit-test command in its `AGENTS.md`.
- `[webui]` = this repository.

Every production change ships with its test in the same task, and each new test is red before the implementation (AGENTS.md § TDD). No task may implement an item from design.md Non-Goals.

## 1. [ocu] Opt-in re-import on the upload endpoint

- [ ] 1.1 Add the `X-OCU-Reimport-Missing` header to the upload path.
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

Suggested fixture level: compact - one prompt sentence with one endpoint assertion.
Minimal mergeable slice: atomic - a single sentence and its test; it does not depend on 2.1 to stay green, because the sentence is conditional.

## 4. [webui] Pin and decision record

- [ ] 4.1 Bump `constraints.yaml ocu_checkout.sha` to the OCU commit that contains tasks 1.1, 2.1 and 3.1. Add the decision record `docs/decisions/implemented/architecture/2026-11-11-ocu-knowledge-file-copy.md`: it records design.md Decisions 1-3, links the source plan, and states the deployment step (rebuild the computer-use-server image, remove the init marker, re-run init). Verify with `make smoke-proxy`, `make decisions-verify` and `make doc-gate`.

Suggested fixture level: compact - a pin bump and a record; the behavior is proven in the OCU repository.
Minimal mergeable slice: atomic - the pin and its record ship together, as AGENTS.md requires. Depends on 1.1, 2.1 and 3.1.
