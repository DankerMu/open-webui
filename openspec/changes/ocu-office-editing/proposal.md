# Proposal

## Why

Plan 1 gave every chat a workspace sidebar, but Office files in it are read-only previews, and the files a user uploads live in a separate read-only directory that the sidebar does not show. Employees cannot fix a paragraph or a cell without asking the Agent, and they cannot see or edit their own uploads. Plan 2 (`docs/plans/2026-09-20-office-manual-editing.md`, third revision 2026-10-01) removes the uploads/outputs split and adds in-place DOCX/XLSX/PPTX editing with version history.

## What Changes

- **BREAKING** (sandbox contract): one shared directory replaces `/mnt/user-data/uploads` and `/mnt/user-data/outputs` inside the sandbox. It is mounted read-write at `/mnt/user-data/files`; the old paths do not exist and a write to them fails. The host directory and the HTTP interface names keep their current names.
- Uploads are written into the same directory and never overwrite an existing file. A WebUI attachment is imported once, keyed by its WebUI file id; later edits, renames and deletes are never overwritten or resurrected. The upload manifest and upload list endpoints, their proxy rows and the SPA's upload list are removed.
- An Office broker inside the OCU server owns edit sessions, immutable versions, save receipts and a commit journal, stored as per-chat files under `.ocu/office/`. No database is added.
- Saving has one level for the user: save persists a version and immediately publishes it to the workspace file. An auto-save every 5 minutes persists without publishing. Leaving the editor closes the session and publishes the final content.
- Publishing replaces the workspace file atomically inside a fence: under the per-chat lock, with the sandbox paused when it is running. A hash mismatch against the edit baseline is a conflict, resolved by "save as new file" or "overwrite"; nothing is overwritten silently. When nobody is present, content is brought back automatically: saved as a new file when the original is gone, or offered for restore the next time the file is opened.
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
- `ocu-offline-image-delivery`: a release identifies seven images; DocumentServer is a pulled role; the open-source CJK fonts travel as a font bundle recorded in the inventory, whose format version becomes 2; every start also verifies the installed font directory.
- `ocu-backup-rollback`: backup stops the proxy, has DocumentServer save and close open documents, waits for open edit sessions to end, then stops the writers; its data volume is excluded; per-chat directories no longer contain an uploads tree; restore invalidates edit sessions; rollback verifies the images of the selected release's own inventory.
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

## Upload name-claim fixture

- Issue type: feature.
- Fixture level: expanded; agrees with the upload name-claim slice's suggested level.
- Blast radius: upload bytes, existing directory entries, and concurrent workers sharing one chat.
- Selected risk packs: public API; file IO; field names; concurrency; legacy compatibility; partial outputs; documentation.
- Evidence floor: endpoint cases for free and occupied names, thread/process concurrency, an unlocked competing writer, symlinks, traversal, and temporary-file cleanup; OCU unit command and an HTTP upload smoke.
- Scope: task 1.1 only. Tasks 1.2 onward remain separate dependency-gated work; this shared change is archived only when its complete task set is finished.

## Import-receipt fixture

- Issue type: feature.
- Fixture level: expanded; agrees with the import-receipt slice's suggested level.
- Blast radius: attachment identity, persisted receipts, concurrent imports and internal read authorization.
- Selected risk packs: API; file IO; schema; auth; concurrency; legacy compatibility; partial outputs; documentation.
- Evidence floor: repeated imports after edit/rename/delete, distinct-id deduplication, separate-worker same-id arbitration, headerless behavior, token/canonical-id matrix, absent-chat no-create and explicit receipt-write failure; OCU unit command plus real HTTP import smoke.
- Scope: task 1.2 only; the tool, mount cut-over, removed read endpoints and gateway table remain later slices.

## Attachment-sync fixture

- Issue type: feature.
- Fixture level: expanded; agrees with task 2.1's suggested level.
- Blast radius: attachment identity, credential transport, ordering before tool execution and preservation of user edits.
- Selected risk packs: API; file IO; schema; auth; concurrency/ordering; legacy compatibility; error handling; documentation.
- Evidence floor: all five tool methods, imported/new ids, consecutive calls, failed receipt reads, authenticated real transports, missing token, no manifest calls and reserved filename characters; focused/full OCU units and actual tool-to-HTTP smoke.
- Scope: task 2.1 only; no server, proxy, mount, tool path-text, README, Valve or MCP transport changes.

## Preview upload-list removal fixture

- Issue type: feature.
- Fixture level: expanded; agrees with the slice's suggested level because the dashboard is shared by standalone and terminal embed, with asynchronous upload/refresh ordering. This slice does not remove auth-matrix entries.
- Blast radius: terminal dashboard availability, retained upload action and standalone Files refresh.
- Selected risk packs: API; concurrency/ordering; legacy compatibility; error handling; documentation.
- Evidence floor: preview Python tests, existing real Chromium harness across embed modes, no upload read requests, upload-triggered Files refresh independent of polling, standalone screenshot and zero unexpected console errors.
- Scope: task 4.1 only; server handlers, proxy rows, mount cut-over and WebUI code remain unchanged.

## Upload read-handler removal fixture

- Issue type: feature.
- Fixture level: expanded; removing protected-handler matrix rows must preserve prefix authorization before routing.
- Blast radius: direct OCU upload-read availability and metadata containment, guard-first rejection and surviving upload/receipt consumers.
- Selected risk packs: API; auth; legacy compatibility; error handling; documentation.
- Evidence floor: authenticated removed-path requests against populated storage disclose no names, hashes or sizes; anonymous requests remain 401 and invalid chat ids remain 400. Focused/full OCU tests, real HTTP upload/import/removal smoke and direct preview browser harness.
- Scope: task 4.2 only; remove the obsolete preview list-response fixture but retain zero-request assertions. MCP resources, upload POST, imports, proxy rows, WebUI stub and served API documentation remain owned by their existing or later slices.

## Unified workspace mount fixture

- Issue type: feature; fixture level: expanded.
- Blast radius: sandbox mount identity and permissions, upload publication visibility, MCP resource roots, recovery attribution, executable guidance and shipped image configuration.
- Selected risk packs: API; configuration; file IO; auth/isolation; concurrency/ordering; discovery; legacy compatibility; error handling; packaging; documentation. Persisted schemas and HTTP/URI names do not change.
- Evidence floor: created/recreated mount sets, no host uploads directory, uploaded file identity and HTML isolation, MCP visible-file reads with hidden names excluded, recovery accepting only the new layout and rendered guidance. Upload tests run under restrictive umask, observe mode 0666 at the no-replace claim and preserve existing directory modes. Real linux/amd64 sandbox proof of in-place edit, rename/delete, nested creation, private home and failed legacy-path writes remains required under [batched acceptance #197](https://github.com/DankerMu/open-webui/issues/197), not the source-issue closure gate, by user direction.
- Image execution timing: defer all builds and image-dependent acceptance until Epic #107's source tasks are complete; track pending evidence in #197 without inferring a B1 go decision.
- Scope: tasks 3.1 and 3.2 are atomic. No old-data migration, compatibility aliases, Office code, proxy/stub cutover, archive-reader redesign or unrelated follow-up fixes.

## Proxy upload-read removal fixture

- Issue type: feature; fixture level: expanded for a pinned default-deny gateway allowlist.
- Blast radius: route inventory, renderer validation and native method/auth dispatch.
- Selected risk packs: public API; configuration; file IO; auth/secrets; legacy compatibility; error handling; documentation. No storage schema, concurrency, resource-limit or packaging change.
- Evidence floor: native nginx returns 404 for both retired GET paths without OCU contact for owner, foreign and anonymous callers; guarded POST uploads, including literal and encoded retired names, preserve body bytes and server-derived identity. Renderer accepts the 20-row inventory and rejects mismatches without replacing the previous private config.
- Scope: task 5.1 only. No Office rows/placeholders, imports assertions, DocumentServer listener, compose/port guard or WebUI stub/pin. Native nginx proof does not require an image build.

## Operator workspace documentation fixture

- Issue type: documentation; fixture level: compact. Runtime behavior is owned by the completed mount and route cuts.
- Scope: task 6.1, OCU operator Markdown, four handwritten SVGs, tool/server READMEs and the served API documentation page. Preserve the MCP `file://uploads/{chat_id}/...` URI; no code, tests, deploy overlay or guard implementation.
- Selected risk packs: documentation, legacy examples and public documentation entry. Required evidence is a clean scoped legacy/retired-endpoint scan, rendered Markdown/SVG/served-page inspection, valid SVG XML and resolved changed-document links.
- User-approved link gate: use existing `lychee.toml` locally on all changed documents with the workflow's offline internal-link policy and attach results to the PR. The existing workflow neither triggers on nor scans these files; do not claim CI coverage or change CI here.

## Tracked sandbox-path guard fixture

- Issue type: test infrastructure; fixture level: compact. The guard observes repository content without changing runtime behavior.
- Scope: task 6.2, one pytest guard module under OCU `tests/`; no CI/hook changes or cleanup of missed production references.
- Selected risk packs: test entry point, Git setup, file discovery, legacy compatibility, fail-loud errors and documentation. The Git index defines membership; working-tree bytes supply content, without an extension filter that would omit SVGs.
- Evidence floor: pass on the branch, reject both legacy literals in non-allowlisted tracked files with filenames reported, and ignore untracked files. Mutation proof uses a disposable Git fixture containing the real guard and branch document bytes, so repository production files are not altered to seed faults.

## Unified-directory harness fixture

- Issue type: test infrastructure; fixture level: expanded. Override the suggested compact level because the shared threaded stub gains mutable upload state and parses the browser's multipart input; its pinned gateway and consumers change atomically.
- Blast radius: uploaded fixture bytes/names, per-chat listing revisions and ETags, the pinned gateway matrix, and existing browser scenarios sharing the threaded stub.
- Scope: task 7.1 only, in WebUI harness scripts, proxy Hurl files and the OCU SHA pin. No backend, frontend, e2e, CI or OCU source edits.
- Selected risk packs: script/API entry, configuration, file-name/overwrite semantics, response fields, auth containment, shared-state ordering, compatibility, errors and documentation. Memory-only fixture state is not a production storage implementation.
- Evidence floor: semantic red then green for stub upload/list/dedup; native nginx and real WebUI ownership smoke with no-contact retired GETs and upload byte fidelity; existing workspace browser cases against the pinned assets. No image work or Office acceptance.
