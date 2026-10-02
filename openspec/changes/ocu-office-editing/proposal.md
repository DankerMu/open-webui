# Proposal

## Why

Plan 1 gave every chat a workspace sidebar, but Office files in it are read-only previews, and the files a user uploads live in a separate read-only directory that the sidebar does not show. Employees cannot fix a paragraph or a cell without asking the Agent, and they cannot see or edit their own uploads. Plan 2 (`docs/plans/2026-09-20-office-manual-editing.md`, third revision 2026-10-01) removes the uploads/outputs split and adds in-place DOCX/XLSX/PPTX editing with version history.

## What Changes

- **BREAKING** (sandbox contract): one shared directory replaces `/mnt/user-data/uploads` and `/mnt/user-data/outputs` inside the sandbox. It is mounted read-write at `/mnt/user-data/files`; the old paths do not exist and a write to them fails. The host directory and the HTTP interface names keep their current names.
- Uploads are written into the same directory and never overwrite an existing file. A WebUI attachment is imported once, keyed by its WebUI file id; later edits, renames and deletes are never overwritten or resurrected. The upload manifest and upload list endpoints, their proxy rows and the SPA's upload list are removed.
- An Office broker inside the OCU server owns edit sessions, immutable versions, save receipts and a commit journal, stored as per-chat files under `.ocu/office/`. No database is added.
- Saving has one level for the user: save persists a version and immediately publishes it to the workspace file. An auto-save every 5 minutes persists without publishing. Leaving the editor closes the session and publishes the final content.
- Publishing replaces the workspace file atomically inside a fence: under the per-chat lock, with the sandbox paused when it is running. A hash mismatch against the edit baseline is a conflict, resolved by "save as new file" or "overwrite"; nothing is overwritten silently.
- The WebUI sidebar gains an edit entry, a save-status bar whose button is the only save (the editor's own save shortcut does not publish), version history with restore, an overlay "maximize", and an unsaved-state guard. The editor runs in a new iframe class that hosts an OCU-served editor page.
- ONLYOFFICE DocumentServer Community v9.4.0 joins the deployment as a seventh image role, reachable from browsers only through a second reverse-proxy port so that it has its own origin. Its data volume is not backed up; restore invalidates every edit session.
- A release verification (B1) of the DocumentServer image, licence terms, capacity and three-format editing gates every later Office task. If it fails, work stops and returns to the plan.

## Capabilities

### New Capabilities

- `ocu-unified-files`: the single shared workspace files directory — sandbox mount, absent legacy paths, uploads into the same directory, import-once attachment sync.
- `ocu-office-store`: per-chat broker state, immutable versions, save receipts, commit journal, capacity check and crash recovery.
- `ocu-office-sessions`: edit session lifecycle and the browser-facing session API — create/join, status with change notice, save, close, the one-level save model, key stability and the connection cap.
- `ocu-office-callback`: the DocumentServer-facing control-plane routes — source tickets, callback authentication, status handling, ordering, idempotence and the persist pipeline.
- `ocu-office-publish`: publishing to the workspace file — the two-state fence, hash comparison, atomic replace, symlink guard, broker registration, stale-fence recovery, conflict resolution and version restore.
- `ocu-office-editor-embed`: the OCU-served editor host page and its parent message protocol.
- `ocu-office-workspace-ui`: the WebUI edit entry, editor iframe class, save-status bar, version history, maximize overlay, unsaved-state guard and feature flag.
- `ocu-documentserver-service`: the DocumentServer service in the deployment overlay — network placement, own origin through the second proxy port, JWT configuration, fonts and data volume.
- `ocu-office-verification`: the B1 release verification record, the local real-editor verification target and the B-T01–B-T16 acceptance run.

### Modified Capabilities

- `ocu-reverse-proxy`: the route table gains Office broker rows and loses the two upload read rows; a second listener serves DocumentServer with session authentication.
- `ocu-compose-port-matrix`: the proxy publishes exactly two ports; DocumentServer publishes none and joins only the control-plane network.
- `ocu-overlay-smoke`: the smoke asserts two proxy publications, a running DocumentServer and no direct DocumentServer entry.
- `ocu-offline-image-delivery`: a release identifies seven images; DocumentServer is a pulled role.
- `ocu-backup-rollback`: backup has DocumentServer save and close open documents, then stops it with the other writers; its data volume is excluded; per-chat directories no longer contain an uploads tree; restore invalidates edit sessions; rollback verifies the images of the selected release's own inventory.
- `ocu-outputs-broker`: the broker resolves a `file_id` to its path and registers a host-side write.
- `ocu-file-headers`: file responses carry `Cache-Control: no-store`.
- `ocu-auth-guard`: Office browser routes are guarded like other chat routes; the DocumentServer-facing routes authenticate by ticket or DocumentServer JWT instead of the internal token.
- `ocu-tool-auth`: the tool reads import receipts instead of the upload manifest.
- `ocu-stub`: the deterministic stub serves Office session fixtures and an editor host page, and drops the upload read routes.
- `ocu-proxy-smoke`: the gateway smoke covers the Office rows and the removed upload rows.
- `ocu-retention-env`: bootstrap always provisions the DocumentServer settings and writes the WebUI Office flag.

## Impact

- **OCU server** (`open-computer-use`, `computer-use-server/`): `docker_manager.py` (mount, fence, stale-fence recovery), `app.py` (upload endpoint, Office routes, file headers), `auth_guard.py`, `outputs_broker.py`, a new `office/` package, `static/` (editor host page, upload list removal, browser download directory), `system_prompt.py`, `mcp_tools.py`, `uploads.py` and `mcp_resources.py` (the MCP resource listing reads the shared directory).
- **OCU sandbox image and skills**: `Dockerfile` directory layout and embedded agent configuration, three public skills, docs. The sandbox image is rebuilt. The fork diverges from upstream OCU on these files permanently.
- **OCU tool** (`openwebui/tools/computer_use_tools.py`): attachment sync.
- **Deploy overlay** (`open-computer-use/deploy/`): proxy route table and renderer, second listener, compose service, port guard, release inventory, recovery, bootstrap, overlay smoke.
- **WebUI fork**: `WorkspaceArtifact.svelte`, minimal hooks in `ChatControls.svelte` and `Chat.svelte` (upstream spine, Critical Path), a new API client and store module, the OCU stub, smoke and e2e, `Makefile`, `AGENTS.md`, `CONTEXT.md`, decision records.
- **Dependencies**: no new Python or npm dependency is planned. One new third-party image (ONLYOFFICE DocumentServer, AGPL v3, unmodified).
- **Data**: no Alembic migration. Existing chat data on the acceptance machine is wiped; no migration tooling.
- **Operations**: DocumentServer, the second proxy listener and its port are always part of the deployment; the flag only decides whether WebUI offers editing. The acceptance machine runs below DocumentServer's official minimum and its run keeps at most one sandbox running; recorded as a deviation.
