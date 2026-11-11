## Why

Users want the model to pull figures out of knowledge-base documents. RAG keeps only the extracted text, and the sandbox has no network, so the original `.docx` or `.pdf` never reaches the workspace. The owner chose to copy the document into the sandbox and process it there, instead of multimodal embedding or a download link. Source plan: `docs/plans/2026-11-11-knowledge-copy-and-skill-display-names.md` (part A, Decision Ledger confirmed by the user on 2026-11-11).

Triage:

```text
Issue type: feature
Fixture level: expanded
Upstream suggested level: absent
Blast radius: a model-callable tool that moves a stored WebUI file into a chat's sandbox; a wrong access check copies a document the user may not read into their workspace
Selected risk packs: Auth / secrets, File IO / path safety, Public API (OCU upload header), Error handling / partial outputs, Documentation
Evidence floor: OCU unit tests (wrapper + upload endpoint + system prompt), make smoke-proxy after the pin bump
```

## What Changes

- **New tool (OCU, Open WebUI tool wrapper).** `copy_knowledge_file(file_id, description)` copies one WebUI file into the chat's `/mnt/user-data/files/` and returns its sandbox path.
  - It copies the file only when it belongs to a knowledge base that the chat's owner owns or holds a read grant on (directly, through a group, or open to everyone). The rule is judged for the chat owner whoever triggers the call. Administrator status is not a grant.
  - Any other file, a missing file, a file without stored bytes and an upload failure each get an `Error:` result instead of an exception. Nothing is uploaded on refusal.
  - After a copy, the wrapper sends the workspace-changed hint so an open Files sidebar refreshes.
- **Deduplicated, self-healing copies (OCU server).** The tool reuses the receipted upload path, with the WebUI file id as the receipt id.
  - A new request header, `X-OCU-Reimport-Missing: 1`, makes the upload endpoint write the file again when the receipted copy no longer opens as a regular file in the workspace, and update the receipt. Any other value of the header, and the header without an attachment id, get 400.
  - When the copy still exists, even edited, the endpoint keeps it and returns the receipt.
  - Requests without the header (attachment and generated-image sync) behave as today: a deleted attachment never comes back.
- **Model guidance (OCU).** The tool docstring explains the flow: find the file id with the knowledge tools, copy it, extract figures with the docx/pdf skills, and show them through workspace file links. The system prompt's uploaded-files notes gain one conditional sentence, used only when a `copy_knowledge_file` tool is available.
- **Pin (WebUI).** `constraints.yaml ocu_checkout.sha` moves to the OCU commit that carries the above.

## Capabilities

### New Capabilities

- `ocu-knowledge-file-copy`: the copy tool, its knowledge-base access rule, its deduplication and re-copy behavior, and the upload header behind them.

### Modified Capabilities

None. The upload endpoint keeps every current behavior for requests without the new header.

## Impact

- OCU:
  - `openwebui/tools/computer_use_tools.py` (new tool, version bump);
  - `computer-use-server/uploads.py` (`store_upload`) and `computer-use-server/app.py` (header);
  - `computer-use-server/system_prompt.py`;
  - tests `tests/test_tools.py`, `tests/test_upload_claim.py`, `tests/orchestrator/test_system_prompt_endpoint.py`;
  - `openwebui/tools/README.md`, `CHANGELOG.md`.
- WebUI: the `constraints.yaml` OCU pin and a decision record.
- Deployment: rebuild the computer-use-server image, then remove the init marker and re-run init so the stored tool source is replaced.
