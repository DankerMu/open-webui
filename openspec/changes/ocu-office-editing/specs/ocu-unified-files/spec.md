# Spec Delta

## Purpose

One workspace files directory per chat, shared by the user and the Agent: a single read-write sandbox mount, no legacy sandbox paths, uploads written into the same directory without overwriting, and WebUI attachments imported exactly once. Source: Plan 2 § 关键设计 0 工作区统一 (B0), acceptance B-T16; design D2, D3.

## ADDED Requirements

### Requirement: Single workspace files mount

OCU SHALL bind-mount the host directory `{BASE_DATA_DIR}/{chat_id}/outputs` read-write at `/mnt/user-data/files` in every sandbox it creates or recreates, and SHALL mount no other per-chat host directory. OCU SHALL NOT create a per-chat `uploads` host directory. The sandbox image SHALL NOT contain `/mnt/user-data/uploads` or `/mnt/user-data/outputs`, neither as directories nor as symlinks, and `/mnt/user-data` SHALL be owned by root and not writable by the sandbox user, so that a write to a legacy path fails instead of landing in the container layer. `/home/assistant` SHALL remain the Agent's private working directory on the per-chat named volume; its content SHALL never appear in the workspace files listing and SHALL never be served by `/files/{chat_id}/{path}`.

#### Scenario: Mount set of a new sandbox

- **WHEN** OCU creates the sandbox for chat C
- **THEN** the container has exactly one bind mount under `/mnt/user-data`: source `{BASE_DATA_DIR}/C/outputs`, destination `/mnt/user-data/files`, read-write
- **AND** no mount has the destination `/mnt/user-data/uploads` or `/mnt/user-data/outputs`
- **AND** `{BASE_DATA_DIR}/C/uploads` does not exist

#### Scenario: Recreated sandbox keeps the same mount set

- **WHEN** the sandbox of chat C was removed and an explicit launch recreates it
- **THEN** the recreated container has the same single bind mount at `/mnt/user-data/files` and the same named volume at `/home/assistant`

#### Scenario: Agent write is a workspace file

- **WHEN** a process in the sandbox writes `/mnt/user-data/files/report.docx`
- **THEN** `{BASE_DATA_DIR}/C/outputs/report.docx` holds the same bytes and the next `GET /api/outputs/C` lists `report.docx`

#### Scenario: Write to a legacy path fails (B-T16)

- **WHEN** a process running as the sandbox user writes to `/mnt/user-data/outputs/a.txt` or `/mnt/user-data/uploads/a.txt`
- **THEN** the write fails with a non-zero exit status because the parent directory does not exist and `/mnt/user-data` is not writable by that user
- **AND** no file `a.txt` exists anywhere under `/mnt/user-data` in the container and none appears in the workspace files listing

#### Scenario: Private working directory is not listed

- **WHEN** a process in the sandbox creates `/home/assistant/scratch.txt`
- **THEN** `GET /api/outputs/C` does not list `scratch.txt` and `GET /files/C/scratch.txt` returns 404

### Requirement: Guidance and tooling name only the workspace files path

Every artefact shipped by OCU that tells the Agent, a sub-agent or an operator where files live SHALL name `/mnt/user-data/files` and SHALL NOT name `/mnt/user-data/uploads` or `/mnt/user-data/outputs`: the rendered system prompt, the MCP tool descriptions, the WebUI tool, the public skills, the sandbox image's directory setup and embedded agent configuration, the in-sandbox browser's download directory, and the recovery mount map. The system prompt SHALL describe `/mnt/user-data/files` as the one location that holds both uploaded and generated files, readable and writable by the Agent, and SHALL keep `/home/assistant` as the private working directory. Recovery SHALL attribute a sandbox to the deployment by the `/home/assistant` volume and the one `/mnt/user-data/files` bind, and SHALL NOT expect either legacy destination.

#### Scenario: Rendered prompt and tool text

- **WHEN** the system prompt and the MCP tool descriptions are rendered for a chat
- **THEN** neither contains the string `/mnt/user-data/uploads` or `/mnt/user-data/outputs`
- **AND** the system prompt names `/mnt/user-data/files` as the location of both uploaded and generated files

#### Scenario: Public skills and sandbox image

- **WHEN** the public skills directory and the sandbox image's embedded agent configuration and shell setup are inspected
- **THEN** no file names either legacy path and every file permission rule, output directory setting and example command that referred to one names `/mnt/user-data/files`

#### Scenario: Browser download lands in workspace files

- **WHEN** the in-sandbox browser downloads a file
- **THEN** the file is saved under `/mnt/user-data/files` and appears in the workspace files listing

#### Scenario: Recovery mount map

- **WHEN** recovery inspects a sandbox created by this version, and separately a container that carries only the two legacy bind destinations
- **THEN** the first is attributed to the deployment and the second is not

### Requirement: Uploads land in the workspace files directory and never overwrite

`POST /api/uploads/{chat_id}/{path}` SHALL store the uploaded bytes in `{BASE_DATA_DIR}/{chat_id}/outputs` at the requested relative path, serialised through the same canonical per-chat thread and filesystem lock as sandbox lifecycle and outputs reconciliation. A file SHALL become visible under its final name only when its content is complete. When the requested name is already taken by any directory entry, including a symlink, the upload SHALL be stored under a deduplicated name of the form `name (N).ext` in the same directory (`name (2).ext` for the first collision), the existing entry SHALL be left untouched and not followed, and the success response SHALL report the final stored name. The existing traversal protection SHALL continue to apply: a path that resolves outside the chat's workspace files directory SHALL be rejected with a client error and SHALL write nothing. An uploaded file is an ordinary workspace file: subject to the outputs broker's existing discovery rules it SHALL appear in the next `GET /api/outputs/{chat_id}` listing with its own `file_id`, SHALL be served by `GET /files/{chat_id}/{path}` with the existing generated-content isolation headers, and SHALL be readable and writable by the Agent at `/mnt/user-data/files/{path}`. The MCP resource surface SHALL keep its URI shape `file://uploads/{chat_id}/…` and SHALL list and read the workspace files directory, skipping hidden names, instead of the removed host `uploads` directory.

#### Scenario: Uploaded Word file appears in the listing (B-T16)

- **WHEN** an authorized caller uploads `brief.docx` to chat C, whose workspace files directory has no `brief.docx`
- **THEN** the response reports the stored name `brief.docx`, `{BASE_DATA_DIR}/C/outputs/brief.docx` holds the uploaded bytes, and the next `GET /api/outputs/C` lists `brief.docx` with a `file_id`
- **AND** a process in the sandbox can read and modify `/mnt/user-data/files/brief.docx`

#### Scenario: Name collision is stored under a deduplicated name (B-T16)

- **WHEN** `report.docx` already exists in the workspace files directory and a caller uploads different bytes as `report.docx`
- **THEN** the upload is stored as `report (2).docx`, the response reports `report (2).docx`, and the bytes of `report.docx` are unchanged
- **AND** the listing shows both files with distinct `file_id` values

#### Scenario: Two concurrent uploads with the same name

- **WHEN** two requests upload different bytes as `data.xlsx` to the same chat at the same time, including through two server workers
- **THEN** both succeed, the directory holds two complete files with distinct names, each response reports the name that holds its own bytes, and neither content is lost or interleaved

#### Scenario: Sandbox creates the same name during an upload

- **WHEN** a process in the sandbox, which does not take the per-chat lock, creates `x.docx` after the upload of `x.docx` has found the name free and before the upload is placed under its final name
- **THEN** the sandbox's `x.docx` keeps its bytes, the upload is stored under a deduplicated name that the response reports, and neither content is lost

#### Scenario: Name occupied by a symlink

- **WHEN** the workspace files directory contains a symlink named `notes.txt` and a caller uploads `notes.txt`
- **THEN** the upload is stored under a deduplicated name, the symlink still exists with its original target, and no bytes are written through it

#### Scenario: Path escaping the directory is rejected

- **WHEN** the upload path contains traversal segments, or passes through a directory symlink that resolves outside the chat's workspace files directory
- **THEN** the request is rejected with a client error and no file is created or modified outside the workspace files directory

#### Scenario: MCP resource listing reads the workspace files directory

- **WHEN** `brief.docx` was uploaded to chat C and the chat's MCP resources are synchronised
- **THEN** a resource `file://uploads/C/brief.docx` exists and reads the bytes of `{BASE_DATA_DIR}/C/outputs/brief.docx`
- **AND** no resource is listed for a hidden name or for anything under `.ocu`

#### Scenario: Uploaded HTML keeps generated-content isolation

- **WHEN** a caller uploads `page.html` and then requests `GET /files/C/page.html` without forcing download
- **THEN** the response carries `Content-Security-Policy: sandbox allow-scripts allow-forms` and `X-Content-Type-Options: nosniff`, exactly as for a file the Agent generated

### Requirement: Attachments are imported once

An upload that carries the header `X-OCU-Attachment-Id` SHALL be treated as the import of the WebUI attachment with that file id. After such an upload is stored, OCU SHALL persist an import receipt for the chat in `{BASE_DATA_DIR}/{chat_id}/.ocu/imports.json` recording the attachment id, the stored name and the time. An upload whose attachment id already has a receipt SHALL be acknowledged with a success response that reports the receipt's stored name and SHALL write nothing to the workspace files directory, whatever has happened to the imported file since: an edited file SHALL NOT be overwritten, a renamed file SHALL NOT be duplicated under its old name, and a deleted file SHALL NOT be recreated. Identity is the attachment id, never the file name: an attachment with a different id and the same name as an existing file SHALL be imported under a deduplicated name with its own receipt. The receipt check and the write SHALL happen under the per-chat lock, so concurrent uploads of one attachment id store exactly one file. An upload without the header SHALL be stored as a new file and SHALL create no receipt. Receipts SHALL NOT be visible or writable from inside the sandbox.

#### Scenario: First import records a receipt

- **WHEN** an upload of `brief.docx` carries `X-OCU-Attachment-Id: F1` and chat C has no receipt for `F1`
- **THEN** the file is stored and `{BASE_DATA_DIR}/C/.ocu/imports.json` records `F1` with the stored name and a time

#### Scenario: Repeated sync does not overwrite an edited file (B-T16)

- **WHEN** attachment `F1` was imported as `brief.docx`, the Agent or the user then changed `brief.docx`, and an upload carrying `X-OCU-Attachment-Id: F1` arrives again with the original bytes
- **THEN** the response is a success that reports `brief.docx`, the changed bytes of `brief.docx` are intact, and no additional file is created

#### Scenario: Deleted or renamed import is not resurrected (B-T16)

- **WHEN** attachment `F1` was imported as `brief.docx`, the file was then deleted or renamed to `final.docx`, and an upload carrying `X-OCU-Attachment-Id: F1` arrives again
- **THEN** the response is a success, no `brief.docx` is created, and `final.docx`, if present, is unchanged

#### Scenario: Different attachment with the same name

- **WHEN** attachment `F1` was imported as `brief.docx` and an upload of `brief.docx` carries `X-OCU-Attachment-Id: F2`
- **THEN** the upload is stored as `brief (2).docx`, the response reports that name, and a receipt for `F2` records it

#### Scenario: Concurrent uploads of one attachment

- **WHEN** two requests carrying the same new attachment id arrive at the same time, including through two server workers
- **THEN** exactly one file is stored, exactly one receipt exists for that id, and both responses report the same stored name

#### Scenario: Upload without an attachment id

- **WHEN** a browser upload from the standalone workspace page posts `photo.png` without `X-OCU-Attachment-Id`
- **THEN** the file is stored under the never-overwrite rule and the receipts are unchanged

#### Scenario: Receipts are outside the sandbox

- **WHEN** a process in the sandbox lists `/mnt/user-data/files` and its parent directories
- **THEN** neither `.ocu` nor `imports.json` is reachable from inside the sandbox

### Requirement: Import receipts are readable only with the internal token

`GET /api/uploads/{chat_id}/imports` SHALL return the attachment ids that have an import receipt for the chat. It SHALL require the internal token and a canonical chat id like every other chat-bound OCU route, SHALL return an empty set for a chat without receipts or without a data directory, and SHALL NOT create, start or unpause a sandbox. A read SHALL NOT create the chat's data directory: when that directory does not exist the handler SHALL answer before taking the per-chat lock, because taking the lock would create it. The route SHALL NOT be present in the reverse-proxy route table, so a browser request for it through the gateway receives 404 without contacting OCU.

#### Scenario: Authorized read

- **WHEN** a request with the internal token reads the imports of chat C after attachments `F1` and `F2` were imported
- **THEN** the response is 200 and lists exactly `F1` and `F2`

#### Scenario: Chat without imports

- **WHEN** a request with the internal token reads the imports of a chat that has no receipts or no data directory yet
- **THEN** the response is 200 with an empty set and no sandbox is created
- **AND** no chat directory is created: a chat whose data directory did not exist before the request still has none after it

#### Scenario: Missing token

- **WHEN** the same request is sent without the internal token
- **THEN** OCU returns 401 before reading any receipt

#### Scenario: Not reachable through the gateway

- **WHEN** an authenticated chat owner requests `/ocu/api/uploads/C/imports` through the reverse proxy
- **THEN** the gateway returns 404 without contacting OCU

### Requirement: The tool syncs attachments whenever a call carries them

The WebUI-side OCU tool SHALL synchronise attachments on every tool call that carries attachments, independent of the command text or path argument of the call. For each call it SHALL read the chat's imported attachment ids and SHALL upload only attachments whose WebUI file id is not among them, sending that id in `X-OCU-Attachment-Id`. The tool SHALL NOT compare checksums with OCU and SHALL NOT replace an imported file with the attachment original. A failed read of the imported ids SHALL NOT cause an already imported attachment to be written again.

#### Scenario: Sync does not depend on the command text (B-T16)

- **WHEN** a tool call carries one attachment that has never been imported and its command does not mention any path under `/mnt/user-data`
- **THEN** the attachment is uploaded with its WebUI file id before the command runs and is present at `/mnt/user-data/files/` when it runs

#### Scenario: Already imported attachments are skipped (B-T16)

- **WHEN** a later tool call in the same chat carries the same attachment
- **THEN** the tool sends no upload for it and the workspace file imported earlier, including any edit, rename or deletion applied to it, is left as it is

#### Scenario: Receipt read fails

- **WHEN** the read of the imported ids fails and the tool uploads an attachment that already has a receipt
- **THEN** OCU acknowledges the upload without writing and the workspace files are unchanged

### Requirement: Upload read interfaces are removed

OCU SHALL NOT serve an upload manifest or an upload list. The reverse-proxy route table SHALL NOT contain rows for `GET api/uploads/{chat}/manifest` or `GET api/uploads/{chat}/list`, so the gateway returns 404 for both without contacting OCU. A `GET` for either path sent directly to OCU with a valid internal token SHALL receive a client-error status (404, or 405 where the path shape is still claimed by the upload `POST` route) and SHALL NOT return file names, checksums or sizes. The standalone workspace page SHALL NOT render a separate list of uploaded files and SHALL NOT request either path; uploaded files are shown in its Files listing like every other workspace file. The page's upload action SHALL remain available.

#### Scenario: Removed rows at the gateway

- **WHEN** an authenticated chat owner requests `/ocu/api/uploads/C/manifest` or `/ocu/api/uploads/C/list` through the reverse proxy
- **THEN** the gateway returns 404 and OCU receives no request

#### Scenario: Removed handlers at OCU

- **WHEN** a request with a valid internal token sends `GET /api/uploads/C/manifest` or `GET /api/uploads/C/list` directly to OCU
- **THEN** the status is 404 or 405 and the body contains no file names, checksums or sizes

#### Scenario: Standalone page shows uploads in Files

- **WHEN** a user uploads a file from the standalone workspace page and the page refreshes its data
- **THEN** the file appears in the Files listing, no separate uploaded-files section is rendered, and the page issues no request to an upload manifest or upload list path
