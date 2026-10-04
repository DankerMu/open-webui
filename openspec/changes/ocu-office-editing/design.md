# Design

## Context

Source plan: `docs/plans/2026-09-20-office-manual-editing.md` (third revision, 2026-10-01). Its section "现状事实" lists, with file and line, the facts of the two repositories after Plan 1 landed; this design depends on those facts and does not restate them. The decisions below were settled branch by branch with the user on 2026-10-01 (Stage 1 grill, 32 user decisions); the ones that revise the earlier plan are marked in the plan's "修订记录".

Constraints that shape every decision:

- OCU runs two uvicorn workers. Nothing may live only in process memory; the per-chat `threading.RLock` + `fcntl.flock` pair (`_combined_lock`) is the only cross-process serialisation.
- Sandbox writers (`exec`, ttyd, background processes) never take that lock. For a running sandbox, `docker pause` is the only barrier against them.
- OCU does not know who owns a chat. Ownership is decided by WebUI's `GET /api/v1/ocu/auth` through the proxy's `auth_request`, which takes the chat id from the request path.
- OCU has no SQL client. Backup is a cold backup of the chat-data tree plus one database.
- The reverse-proxy route table, the port guard and the release inventory are pinned, reviewed artefacts; changing them is deliberate, tested work.
- Both forks must stay rebase-able. WebUI spine files get a minimal diff; OCU accepts a permanent divergence on the files that name the sandbox paths (user decision).
- Prefixes: `[webui]` = this repository; `[ocu]` = sibling checkout `open-computer-use` (branch `<tool>/plan2-<slug>` off its `main`; the change was verified against `9c35a8c`; tests in its `tests/`); `[deploy]` = OCU `deploy/`.

## Goals / Non-Goals

**Goals:**

- One shared directory per chat for uploaded and generated files, editable by the user and the Agent.
- In-sidebar editing of DOCX, XLSX and PPTX with a single user-visible save, version history and restore.
- No silent overwrite in either direction between a human edit and an Agent write.
- DocumentServer isolated on its own browser origin and reachable only through the gateway.
- Every Office task gated on a recorded release verification (B1).

**Non-Goals:**

- Cross-user co-editing. Same-user multi-tab joins one session; chat sharing grants no edit right.
- Content merge on conflict.
- A "hand over to AI" action and a "discard changes" action.
- Making the editor's own save shortcut publish.
- Runtimes without `docker pause` (rootless cgroup limits, Kata, gVisor) and the stop → commit → start fallback.
- Showing or editing `/home/assistant` (the Agent's private scratch area).
- Migrating an environment that already holds chat data; the acceptance machine is wiped.
- Writing human edits back to WebUI's own file store or refreshing content already injected into a model context.
- Renaming the host directory `outputs` or the HTTP interfaces `/api/outputs`, `/files`, `/api/uploads`.
- Compatibility symlinks for the old sandbox paths.
- Pruning of stored versions.
- Extending the per-chat lock to tool execution.
- Server-side re-check of ownership when a DocumentServer callback arrives.
- Telling OCU when a chat is deleted in WebUI.
- A setting that limits the number of concurrent sandboxes.

### Unified-directory harness seam

Task 7.1 changes only the deterministic WebUI stub, its two smoke entrypoints,
the gateway Hurl assertions and the pinned OCU revision.
The governing invariant is that an accepted upload belongs to exactly one chat's
Files fixture under a non-replacing name, and the next listing exposes that
same file while retired GET routes never reach the upstream through nginx.

Use the pinned OCU upload response shape and multipart file input. Harness
storage is process-local and synchronized; it does not model production disk
durability or two-worker locking. Existing fixture entries keep their identities
and revisions when an unrelated upload increments the listing revision.
Serving uploaded bytes is part of this seam so a listed file is selectable by
the existing workspace consumer, rather than a listing-only fake.

Sibling surfaces are fixture listing/pagination/ETag, fixture file serving,
private request observations, real nginx route selection, WebUI ownership,
and the browser harness that materializes assets from the same pin.
Preserve scenario behavior and generated-file containment. The pin must contain
the unified mount and retired-read route table but not the second listener.
No Office route, image execution, backend route or new browser case is included.

Evidence crosses both public HTTP seams: stub upload-to-list-to-bytes and
gateway upload-to-list with body digest; retired gateway GETs must return 404
with no upstream record. Review focuses on non-overwrite, chat isolation,
revision/ETag consistency, multipart byte fidelity and unchanged auth denials.

## Decisions

### D1. One change, one epic, in the WebUI repository

As in Plan 1 (its D2). Issues carry `[webui]`, `[ocu]` or `[deploy]` and the label `plan2`. Work packages: B0 workspace unification, B1 release verification, B2 broker core, B3 publish, B4 frontend, B5 deployment and acceptance. B0 and B1 are independent roots. Every B2+ task depends on B1; every task that relies on the shared directory depends on B0.

Alternative rejected: a separate change for B0 first. It costs a second full pipeline run, and the Office broker's editable root is defined by B0 anyway.

### D2. One shared directory, mounted at `/mnt/user-data/files`

The host directory `{BASE_DATA_DIR}/{chat_id}/outputs` is the single workspace files directory. It is bind-mounted read-write at `/mnt/user-data/files`. `/mnt/user-data/uploads` and `/mnt/user-data/outputs` are not created in the image and not mounted; `/mnt/user-data` is owned by root and not writable by the sandbox user, so a habitual write to an old path fails instead of landing in the container layer. `/home/assistant` stays the Agent's private working directory on its named volume.

Every reference to the old paths is updated: the sandbox image's directory setup and embedded agent configuration, the system prompt, `mcp_tools` text, the three public skills that name them, the recovery mount map, tests and docs. The host directory keeps its name so the outputs broker, `/files`, `/api/outputs`, the proxy rows and the WebUI client are unaffected.

Alternatives rejected: mounting one directory at both old paths (no prompt changes, but a copy from one path to the other truncates its own source); two writable directories (every single-root assumption of Plan 1 changes and the split stays visible); renaming host directory and HTTP interfaces too (rework of accepted Plan 1 surface for no visible gain). The name `workspace` is avoided because the system prompt already uses it for `/home/assistant`.

### D3. Uploads land in the same directory; attachments are imported once

`POST /api/uploads/{chat_id}/{path}` writes into the shared directory under the per-chat lock. Bytes are staged in the server-private `{chat}/.ocu` directory outside the sandbox bind, then published by a no-replace hard link through pinned source and destination directory descriptors. The final name is never reopened for chmod. A plain rename is not used: sandbox writers do not take the lock, and a rename would replace a file the Agent created in between. If the name is taken the next deduplicated name (`name (2).ext`) is tried and the response returns the final name. The outputs broker detects the addition on its next reconcile; no explicit registration is needed.

Attachment sync: the tool sends the WebUI file id with each upload (`X-OCU-Attachment-Id`). OCU keeps import receipts in `{chat}/.ocu/imports.json` (attachment id → stored name, time). An id with a receipt is acknowledged without writing. `GET /api/uploads/{chat_id}/imports` (internal token, not proxied) returns the imported ids so the tool uploads only attachments that have none. The tool syncs whenever the tool call carries attachments, not only when the command text mentions an uploads path. If the read of the imported ids fails the tool uploads every attachment; the server-side receipt check keeps that safe. The file is placed and its receipt written inside one locked section; a crash between the two leaves a file without a receipt, and the next sync imports the attachment again under a deduplicated name. That is accepted: the failure produces a duplicate, never a loss.

`GET /api/uploads/{chat_id}/manifest` and `.../list`, their two proxy rows and the standalone SPA's upload list are deleted: the files are in the Files listing. A direct request to OCU for either path gets 404 or 405 (the upload `POST` route still claims the path shape); no handler is kept only to turn 405 into 404.

The MCP resource surface (`uploads.py`, `mcp_resources.py`, URI `file://uploads/{chat_id}/…`) keeps its URI shape and reads the shared directory instead of the removed host `uploads` directory, skipping hidden names. Without this it would silently become empty.

Alternative rejected: skip when a same-named file exists. It re-imports a file the user deleted or renamed and silently ignores a different attachment with the same name.

#### Proxy upload-read removal boundary

Task 5.1 removes exactly the two GET upload-read rows. The route schema stays version 1; the reviewed inventory has 20 rows and the renderer pins its exact bytes. Invariant: an unlisted method/path never reaches OCU, even when nginx's normalized URI matches the remaining POST upload location. No compatibility handler or redirect replaces the retired reads.

Must preserve guarded POST uploads whose filename is `manifest` or `list`, including encoded spellings, raw-path/body forwarding, owner-derived chat identity, mutation-origin denials and all unrelated HTTP/WebSocket/file policies. Sibling surfaces are the route table, count/hash validation, location method dispatch, native recording fixture and bad-table atomic-render tests. Read-row overlap handling with no remaining consumer is removed rather than retained as an unused transition mechanism. Office placeholders/rows, imports assertions and the second listener belong to later slices.

#### Name-claim slice boundary

Task 1.1 changes the upload handler and one importable no-replace claim helper, with paired tests. It retains the chat's `uploads` destination, existing guard, traversal rejection, response fields and manifest/list consumers. The `filename` field reports the stored name; `size` and `md5` describe that file's bytes.

Invariant: publishing an upload never replaces or writes through an existing final directory entry, including an entry created by a writer outside the lock. The existing per-chat thread/filesystem lock serializes server workers; hard-link creation arbitrates the final name against unlocked writers.

Sibling surfaces are lifecycle operations sharing `_combined_lock`, manifest/list readers, the deployed attachment tool, and later `save_as` callers of the helper. No consumer is migrated in this slice. Tests cross the upload HTTP boundary and exercise separate processes as well as threads. Failure injection covers temporary-file cleanup; traversal rejection must leave external content unchanged. Receipts, mount changes, proxy routes and Office callers are non-goals.

#### Import-receipt slice boundary

Task 1.2 adds the attachment-id header and internal imports read. `GET /api/uploads/{chat_id}/imports` returns `{"ids": [...]}` with exactly the persisted ids; ordering carries no meaning. The receipt maps each id to its stored relative name and import time. It also retains the original size and MD5 needed to acknowledge the existing upload response without reading an edited, renamed or deleted file.

Invariant: after an id has a committed receipt, further uploads of that id cannot mutate or resurrect its file. Receipt lookup, the existing upload operation and receipt commit share the canonical chat lock. The receipt file uses the existing atomic JSON publication convention; malformed existing state fails explicitly, never becomes an empty receipt set. A crash after file publication but before receipt publication may leave a complete unreceipted duplicate on retry; it must never overwrite or delete a file.

Must preserve the task 1.1 no-replace helper, 0644-before-publication, uploads destination, response fields and internal-token guard. Headerless uploads neither create nor change receipts. An imports read checks for an absent chat before acquiring the directory-creating lock; it returns an empty ids array without creating a directory or contacting Docker.

Sibling surfaces: lifecycle lock, `.ocu` broker metadata (different files), the upload endpoint, auth route matrix and the attachment-sync client added by task 2.1. Evidence crosses HTTP, persisted state and separate worker processes. Tool changes, broker-index mutation, manifest/list removal, mount changes and proxy rows are non-goals.

#### Attachment-sync slice boundary

Task 2.1 consumes `{"ids": [...]}` and sends the attachment's top-level `id` header. WebUI's upload producer sets `fileItem.id = uploadedFile.id` alongside `fileItem.file = uploadedFile`; tool injection receives these metadata files. Existing top-level or nested source paths remain source locations, never identity. A missing real id is not replaced with a filename, path or checksum.

Invariant: every executable tool call with attachments attempts their receipt-based synchronization before its MCP command, regardless of command/path text. Receipted ids are skipped even when the stored file changed or disappeared. If ids cannot be read, every attachment is sent with its original id and the server's receipt transaction remains the sole idempotence authority. Upload URLs preserve literal filename bytes, including reserved URL characters.

Must preserve public method signatures, server-side token lookup, configuration errors before network work, redirect refusal, Storage cleanup, MCP carriers/probes and workspace hints. No receipt logic is duplicated in the client. Sibling surfaces are the five public methods, sync helper, Storage provider, guarded transport test server and the task 1.2 endpoint. Evidence uses real upload/receipt handlers; sandbox path wording and the mount cut-over remain task 3.1.

#### Preview upload-list removal slice boundary

Task 4.1 removes the upload-list dependency and card from the shared `TerminalDashboard`, including terminal embed. Its status/session/process requests and upload action remain. Standalone supplies the existing `App.fetchFiles` callback through `TerminalView`; a completed upload triggers this refresh directly rather than waiting for polling. Terminal embed supplies no Files callback and performs no outputs discovery.

Invariant: retiring the upload read endpoints must not break the dashboard or upload action. Tests observe browser requests and DOM, with periodic polling paused when proving post-upload refresh. The server handlers remain present for the next slice. Until task 3.1 moves uploads, a successful standalone upload can be absent from the Files listing; this accepted gap is not hidden by a fabricated fixture claim.

Must preserve embed isolation, request-wrapper authentication/prefix handling, terminal controls and existing error/abort behavior. Sibling surfaces are standalone App, terminal embed, TerminalView and the browser harness's request matrix. Required runtime evidence is a real rendered standalone panel, its screenshot and no unexpected browser errors. No server, auth, proxy, mount or WebUI component change belongs here.

#### Upload read-handler removal slice boundary

Task 4.2 deletes the manifest/list GET handlers and only their exclusive helpers. No replacement GET handler forces a particular error code: the surviving upload POST path may cause a 405. Remove the two protected-handler matrix rows, not the `/api/uploads/` guarded prefix.

Invariant: neither retired read path can disclose uploaded-file metadata. Authorization still precedes routing: a missing token receives 401; a valid token with a noncanonical chat id receives 400; a valid canonical request reaches routing and receives 404 or 405. Tests seed recognizable bytes and names, then assert both retired responses contain neither filename, checksum nor size.

Must preserve upload no-replace publication, receipts/imports, path validation and MCP upload resources. Sibling surfaces are app route registration, auth matrix, traversal tests, receipt-based tool sync and preview harness. Remove its obsolete successful list stub while preserving assertions that the page makes no list/manifest request. Proxy rows, WebUI stub routes, mounted paths and served API documentation are not part of this cut.

#### Unified workspace mount cutover boundary

Tasks 3.1 and 3.2 switch one storage contract in one release. Existing no-replace publication, import receipts, outputs reconciliation, file serving and per-chat lifecycle locking are reused. The host directory remains `outputs`; only its sandbox name and the upload/MCP source converge. The skill-usage log is `/mnt/user-data/files/.skill-usage.jsonl`, preserving its host-side collection path.

`BASE_DATA_DIR` is the canonical root for both file IO and sandbox binds. The redundant `USER_DATA_BASE_PATH` input is removed with its imports, Compose/Helm settings, recovery expectations, fixtures and configuration documentation; retaining a second root can make uploads invisible to the sandbox. Supported deployments already give both variables the same path, visible identically inside the server and at the Docker daemon. That path-identity requirement remains; no host-path translation layer is introduced.

Invariant: every created or recreated sandbox has exactly one per-chat user-data bind, read-write at `/mnt/user-data/files`, and its private named volume at `/home/assistant`. The image contains neither legacy directory nor alias; root owns `/mnt/user-data` with mode 0755. Ordinary sandbox-user writes to either legacy path fail without leaving files. No cutover migrates or deletes existing chat data or silently reconfigures an already-running old sandbox.

Upload publication and receipts retain their canonical lock and identity semantics. The next existing outputs reconcile supplies `file_id`; no second registration path is added. MCP retains `file://uploads/{chat_id}/{encoded-path}` while listing and reading visible workspace files, excluding hidden path segments and `.ocu`. Uploaded HTML uses the existing opaque-origin response headers. Recovery accepts the workspace volume plus new files bind, not the legacy pair.

Upload files must be editable across the server and sandbox user IDs, not merely on a read-write mount. Keep temporary bytes private while writing; flush them and set mode 0666 through the open file descriptor before the no-replace link exposes the final name. Only directories newly created by the server under the files root receive mode 0777, independent of umask; existing directory modes are not broadened. Never chmod the published path after linking. This follows the existing shared-directory permission model without binding the server to an image-specific UID; `.ocu` metadata remains outside the mount.

Implementation order: first add failing mount/upload/MCP/recovery boundary cases; then change all runtime consumers and image/guidance together. Source review and merge require the non-image verification; the user moved full linux/amd64 image build and real integration execution to [batched acceptance #197](https://github.com/DankerMu/open-webui/issues/197). Unit fakes cannot prove image ownership, absent paths, sandbox-user writes or private-home isolation; those checks stay pending there until executed. The existing external-stack mode may target an isolated local server with a dedicated test network and matching host paths, using the full built image rather than a substitute or mocked Docker. Image-check failures require corrective PRs even if the source issue has closed.

Image execution is postponed until all Epic #107 source tasks are complete. No image build or image-dependent acceptance run starts before that boundary; this scheduling direction does not supply missing B1 measurements or a go decision.

Sibling surfaces: lifecycle create/recreate, upload and receipt tests, outputs listing/file serving, MCP registry, recovery mount attribution, rendered prompt/tool descriptions, browser download configuration, public/example skills and embedded agent permissions. The browser upload case must reflect the closed visibility gap rather than assert the transitional absence from task 4.1. Operator docs remain task 6.1; the server-package legacy-path scan excludes its served documentation page until that task. Archive staging-file visibility is tracked separately; it is not claimed fixed by MCP filtering.

Containment: server, tool guidance and rebuilt sandbox image ship together; acceptance starts with an empty operator-prepared environment. No agent deletes deployment data. A rollback requires the matching previous server/image and sandbox recreation; no compatibility mounts or automatic migration are added. The decision record records this accepted upstream divergence and the rejected dual-mount, dual-directory and broad-renaming alternatives.

### D4. ONLYOFFICE Docs Community v9.4.0, gated by B1

Unmodified upstream image, AGPL v3, branding kept. B1 produces a dated record: image identity, licence terms read, official minimum vs measured headroom on the acceptance machine, open/edit/export of deterministic DOCX/XLSX/PPTX samples, observed connection-boundary behaviour and whether usage is queryable, delay between last close and the status-2 callback, the origin of the download address in status-2 and status-6 callbacks, the editor's cap event or its observed absence at the tested boundary, the memory and swap present on the acceptance machine, whether the image's shutdown-preparation command saves and closes every open document, the command's name, and whether a restart clears the shutdown-preparation mode, whether the editor works when the proxy withholds the WebUI cookie, whether `forcesave` echoes `userdata`, whether the editor's own save command produces a callback with user-initiated force save off, the minimal iframe sandbox and permission set the editor needs, and the fonts loaded. Five observations are assumptions this design is built on, and each must hold for a go: `forcesave` echoes `userdata`; a shutdown-preparation command exists that saves and closes every open document; a restart clears that mode; the editor's own save produces no callback; the editor works without the WebUI cookie. If B1 fails, work stops and returns to the plan; there is no automatic switch to Collabora.

#### B1 isolation and evidence boundary

The user permits one local isolated B1 measurement campaign despite the general
image freeze. Its only DocumentServer is the unmodified pinned 9.4.0 image;
owned helper processes may serve deterministic samples, record real callbacks
and proxy the browser origin. A fresh internal network and loopback publication
isolate this campaign from existing services and the LAN. Restarts measure the
same instance's shutdown reset; they do not authorize another deployment.

The governing invariant is that every consumed value comes from the identified
running editor and a discriminating observation, never a stub or assumed API.
Sibling surfaces are browser events, command responses, callback bodies,
exported OOXML, iframe policy, cookie stripping and shutdown/restart state.
Keep JWT enabled, redact credentials, record monotonic timings and preserve
counterexamples. Test-only helpers live outside the repository and are removed
after retaining evidence. The pre-existing image is not deleted.

The dated record distinguishes local arm64 behavior from acceptance-machine
capacity and unmeasured architectures. Primary-source discrepancies, including
the release's actual connection-limit behavior, are recorded rather than
normalized to the plan. Licence applicability remains a human judgement.
The verdict supplies the B1 prerequisite, not release acceptance; source-only
exceptions recorded in tasks remain separate, and other image acceptance remains frozen.

### D5. The broker is an in-process package with per-chat file state

`computer-use-server/office/`. State for a chat lives in `{BASE_DATA_DIR}/{chat_id}/.ocu/office/`:

- `state.json` — documents, sessions, save receipts and the commit journal; schema-versioned; every read-modify-write under `_combined_lock(chat)`; written by temp file, fsync, `os.replace`, directory fsync (the outputs broker's pattern).
- `versions/{sha256}` — immutable version blobs, content-addressed.
- `staging/` — downloads in progress.
- `fence.json` — the stale-fence marker (D12).

`.ocu` is outside the mounted directory, so the sandbox cannot read or alter history. State and blobs share one filesystem, so there is no cross-store transaction; the journal covers the one multi-step operation (publish).

Alternatives rejected: PostgreSQL (new dependency, migration job, backup extension, two-store crash consistency); SQLite (still two stores, new failure modes under two workers). Cost accepted: no cross-chat query.

#### State-file transaction boundary

Tasks 10.1 and 10.4 expose `office.store.OfficeStore.read(chat_id)` and `update(chat_id, mutate)`. The mutator receives a fresh decoded state, modifies it in place and returns no value; update validates and durably publishes that successor, returning its snapshot. No live cache is retained. Both entrypoints use the canonical `_combined_lock`, including nested same-thread calls.

The initial schema is exactly `schema_version: 1` and mapping collections `documents`, `sessions`, `receipts`, `journal`. Validate the top-level types and ordinary JSON encoding; later owners extend record validation without inventing record semantics here. Missing state reads as an empty schema without creating a state file. An unreadable, malformed or unsupported state raises `StateCorruptError` and retains its bytes; unlike the outputs index's richer taxonomy, this error grouping is the explicit Office contract.

Governing invariant: each successful update is one complete durable per-chat successor derived under the same lock from the latest predecessor; neither another worker nor an exception may erase a prior committed mutation. A failed mutator or invalid successor never publishes. A killed pre-replace writer leaves the predecessor; post-replace directory-fsync failure reports `StateDurabilityError` without promising rollback.

Use no-follow control-directory/file access and the established temp/fsync/replace/directory-fsync pattern. The outputs broker's private writer is index-specific; importing it or extracting it would violate this slice's no-broker-edit boundary. The Office store owns its state-schema transaction and does not add a second generic persistence abstraction. Do not create versions/staging/fence files in this slice.

Sibling surfaces: lifecycle and outputs broker share the lock but retain their APIs/state; later Office routes and callbacks translate `StateCorruptError` to `state_corrupt`; version/session/journal owners add record rules. Dockerfile COPY coverage discovers actual top-level modules and package directories (`__init__.py`), excluding non-packages such as static/bin/cli-defaults. Storage outside the workspace mount is structural; source verification is not real-image isolation certification.

Evidence uses real processes and descriptors, forced update orders, actual flock contention, portable open-error injection, crash-before-replace, post-replace fsync failure and fresh-process reads. The WebUI companion decision references the existing lifecycle-lock decision without superseding it; PostgreSQL/SQLite add a second storage/backup boundary while per-chat files accept no cross-chat query.

### D6. Versions and terminology

`revision` keeps its Plan 1 meaning: the per-chat change counter of the outputs broker. The broker's immutable snapshots are **versions**. A document is keyed by the Plan 1 `file_id`. A version has a per-document monotonic number, parent, SHA-256, size, source (`workspace`, `save`, `autosave`, `close`, `restore`, `conflict`), time and a published flag. `conflict` is the source of the first version of the new document that a `save_as` creates.

When a session is created the workspace file is hashed; if its content differs from the document's newest version, a version with source `workspace` is recorded (the blob is shared when the content was stored before). This captures what the Agent or an upload produced, so history always holds the pre-edit content and an overwrite never destroys the only copy.

Persisted content whose SHA-256 equals the document's latest version adds no version record; the save receipt points at the existing version. A version is `published` when the workspace file was replaced by it, or, for a `workspace` version, because it is the workspace content.

Versions are not deleted automatically. Before storing a blob the broker checks free space against a configured floor and refuses with an explicit error when below it.

Every host-side read of the edited workspace file (the capture at session creation, the status poll's hash, the hash inside the fence, the captures before an overwrite and a restore) opens the file without following a symlink, checks that it is a regular file inside the chat's workspace files directory and that no parent component is a symlink. A file that fails the check is never read: creation, overwrite and restore refuse with `unsafe_path`, the status poll reports `workspace_changed`, and a publish treats it as a baseline mismatch.

#### Version, receipt and safe-read boundary

`OfficeStore.store_version(chat_id, file_id, content, *, source, parent, published, min_free_bytes, receipt=None, mutate_state=None)` returns the selected version record; `mark_published(chat_id, file_id, number)` only moves its flag to true. `record_receipt` handles outcomes without content, `get_receipt` looks up session/sequence with an optional expected hash, `check_free_space` accepts the caller's floor, and `read_workspace_file(chat_id, relative_path, *, max_bytes=None)` returns bytes and their SHA-256. No configuration default belongs here. The optional mutator shares the version commit; its session-creation consumer is specified in D9.

Version lists live inside `documents[file_id]["versions"]`; task 10.2 owns those records, not session-creation metadata (type/path/currently-published pointer). Receipts use `receipts[session_id][str(save_seq)]`. Store a complete receipt with callback status, hash or null, version number or null and the answer; an already recorded key may be replayed identically but not silently replaced with conflicting content.

Governing invariant: every committed version record refers to an immutable durable blob, and its receipt is committed in the same state successor. Hold the canonical chat lock across admission, blob publication and the existing state update. The floor compares current available bytes with the supplied floor, not a new projected-size reserve policy. Below-floor and precommit ENOSPC failures cannot advance records or receipts.

Publish a new blob through a private temp, file fsync and an exclusive no-replace claim, then sync its directory and owned ancestry before the state update can acknowledge. Verify an existing hash-named blob rather than assuming its filename proves content. Never rewrite an existing blob. Clean newly staged/uncommitted content on ordinary precommit failure without deleting a blob that predated the operation; a process killed after durable blob publication but before state publication may leave an unreferenced complete blob, not a dangling committed record. No pruning is introduced.

Use one `OfficeStore.update` for the version-list mutation and optional receipt. Equal latest hash preserves the record's number/source/parent/time and binds the receipt to it; later reuse of an older hash appends a new number. Existing records are immutable except a one-way published flag. Preserve the state primitive's explicit postreplace durability error: do not remove a blob referenced by a visible successor or claim that a committed replacement rolled back.

Safe workspace reads use the canonical chat root and no-follow directory descriptors down to an `O_NOFOLLOW|O_NONBLOCK` regular-file open. Validate relative components before access, hash the bytes actually read and reject unstable content. Reuse Office descriptor primitives where applicable; the outputs broker's private index observation remains unchanged. Downstream session/status/publish/restore owners map storage/path errors to their specified HTTP/session outcomes.

Module placement keeps each production file below 800 lines: `office/store.py` owns the state transaction and the public `OfficeStore` entrypoints, `office/versions.py` owns the single version/blob/receipt implementation, and `office/workspace.py` owns the single safe-reader implementation. Store entrypoints delegate rather than duplicate algorithms. Paired version/workspace test modules exercise those behaviors through the public seam; existing state tests remain in their module. The existing package-level Dockerfile COPY includes these nested modules, so no server-root module or new packaging path is introduced.

### D7. Route shape and authentication

Browser-facing routes carry the chat id and are proxied as ordinary chat rows (`auth: chat`), so the existing `auth_request` decides ownership:

| Route (after the `/ocu` prefix)                 | Method | Mutating |
| ----------------------------------------------- | ------ | -------- |
| `/api/office/{chat}/documents/{file}/sessions`  | POST   | yes      |
| `/api/office/{chat}/sessions/{session}`         | GET    | no       |
| `/api/office/{chat}/sessions/{session}/save`    | POST   | yes      |
| `/api/office/{chat}/sessions/{session}/close`   | POST   | yes      |
| `/api/office/{chat}/sessions/{session}/resolve` | POST   | yes      |
| `/api/office/{chat}/documents/{file}/versions`  | GET    | no       |
| `/api/office/{chat}/documents/{file}/restore`   | POST   | yes      |

The proxy renderer accepts two new placeholders, `{file}` and `{session}`, each a single path segment. The route table's row count and SHA pin are updated with the table.

Control-plane routes, never in the proxy table:

- `GET /office/source/{ticket}` — the ticket is an HMAC-signed, short-lived token binding chat, document, version and session. The HMAC key is derived from the internal token, which DocumentServer never holds, so a compromised DocumentServer cannot mint tickets for other documents.
- `POST /office/callback/{chat}/{session}` — authenticated by the DocumentServer JWT in the request.

`auth_guard` guards `/api/office/` like the other chat prefixes (internal token injected by the proxy, canonical chat id). The two control-plane routes are exempt from the internal-token check, authenticate as above, do not accept the internal token as a substitute, and still reject sandbox-subnet peers. The fence is a function call; there is no fence endpoint.

OCU has no separate Office switch. Office editing is enabled on the OCU server when the DocumentServer server-to-server address is configured. Configured with a blank JWT secret, the server refuses to start. Not configured, every Office route answers 404 (the browser routes after the guard) and nothing else changes; this is the state of every OCU outside the deployment overlay. The user-facing switch is the WebUI flag (D16).

Alternative rejected: routes keyed by `file_id` without a chat segment. They need a second authorization path in which OCU resolves ownership it does not hold.

#### Token and command-client boundary

Task 11.2 adds `office/tokens.py` and `office/commands.py`, with no route or state-machine consumers. `sign_jwt(payload)` and `verify_jwt(token)` use the configured DocumentServer secret and standard-library HS256 only. A shared private encoder/verifier uses constant-time signature comparison, rejects malformed or non-object input and unsupported algorithms, and returns nothing from an unverified payload. An `exp` claim, when present, must be a finite numeric date other than a boolean and is expired at `now >= exp`; a present `nbf` is honored. Invalid tokens raise a value-free `InvalidTokenError`; absent signing keys fail explicitly without disclosing values.

`sign_source_ticket(chat_id, file_id, version, session_id)` uses the configured source-ticket lifetime. Its key is HMAC-SHA256 keyed by the internal token over the purpose label `ocu-office-source-ticket`, not the DocumentServer secret or the raw internal token. The unpadded base64url token binds those four fields and a required expiry. `verify_source_ticket(token)` returns exactly the four bindings after signature, expiry and field-shape verification: nonempty string identities and a positive integer version, excluding booleans. The helpers keep no cache and never log credentials or tickets.

Async `forcesave(document_key, save_seq, intent)` sends a signed command with `c`, `key` and `userdata`; `userdata` is a compact JSON string containing positive integer `save_seq` and `intent` (`publish` or `persist`). Async `lookup_key(document_key)` sends `c: info`. Requests use the configured control-plane address plus `/command`, with a body token signing the command fields directly, not the header-token `payload` wrapper. The [command service](https://api.onlyoffice.com/docs/docs-api/additional-api/command-service/) and [body-token signature format](https://api.onlyoffice.com/docs/docs-api/additional-api/signature/request/token-in-body/) own this wire contract. The [B1 record](../../../docs/evidence/issue-119/2026-10-03-b1.md) supplies the exact-string echo observation, not a new capacity-query contract.

Force-save returns a typed outcome: integer code 0 is `accepted`, 1 `key_unknown`, 4 `nothing_to_save`, and every other code or malformed/non-success response `rejected`; connection refusal or timeout is `unreachable`. Key lookup reports `known` for code 0, `key_unknown` for 1 and `unreachable` for every other result, so a failed check never orphans a session as though the key were absent. Boolean and non-integer codes are invalid. HTTP uses existing aiohttp, a bounded timeout and response read, no redirects, environment proxy or retries; cancellation is not converted into a result. No request goes to the browser origin. Response bodies and exception messages are not logged.

#### Office gateway row boundary

Task 21.1 adds exactly the seven browser rows above to the existing twenty-row
inventory. Table bytes, count and SHA pin change atomically. Existing row objects,
method sets, authentication, mutation rules and file/WebSocket policies stay
unchanged. `{file}` and `{session}` match one non-empty segment, never the
multi-segment `{path}` rule, and are invalid without `{chat}`.

The invariant is default-deny before OCU contact: only a listed method and raw
path with owner authorization can reach OCU; mutating rows also require origin
proof. Sibling surfaces are renderer schema/pin validation, normalized-location
selection, raw-URI validation, path-derived chat identity and recording-fixture
observations. Control-plane source/callback paths and the imports GET stay
unproxied, with or without the `/ocu` prefix.

Extend the existing native fixture and test matrices; do not substitute a second
proxy or a fake success from a broker. Only synthetic credentials and private
temporary configs are exercised. A failed render preserves the previous config;
rollback restores the matching table/renderer pair. The later WebUI pin/smoke
consumer owns its update separately, and the second listener is out of scope.

#### Office route availability boundary

Task 12.1 adds `office/router.py`. The service guard owns the `/api/office/` prefix and takes the literal immediately following path segment, without collapsing empty segments or substituting header/query identity. After bearer and canonical validation it places the canonical value in the existing ASGI `ocu_chat_id` field. Office HTTP preflights do not use the guard's unauthenticated CORS shortcut; CORS behavior outside Office is unchanged.

A small ASGI availability middleware in the Office module runs inside the service guard and before route dispatch. Disabled Office returns 404 without filesystem or DocumentServer work. Enabled Office checks the canonical chat directory with a non-creating operation and returns 404 when absent, before any chat lock. Existing chat requests pass to the router. This prefix-wide boundary also covers unknown paths and methods, which route dependencies alone cannot cover. App wiring is one `include_router` line plus one explicit middleware registration before `AuthGuardMiddleware`, keeping authentication outermost; imports have no registration side effects.

The router contains a permanent unknown-path 404 fallback, not placeholder session handlers. `create_office_router()` registers an Office-only suffix converter matching all characters, including decoded newlines, then constructs a method-independent ASGI route through the existing `APIRouter.add_route` / `include_router` APIs. The built-in path converter is unchanged. Register the fallback after concrete Office routes so later session handlers win. Availability remains enforced before either path. Office-owned 404 reasons are `office_disabled`, `unknown_chat` and `unknown_route`; Office guard errors add `unauthorized`, `forbidden` or `invalid_chat_id` while retaining `detail`. Other guard responses remain unchanged.

The two app-fixture module inventories and the auth fixture reload the Office package, configuration and router imports they exercise. Later tasks extend those inventories when they add imports, as the task-12.1 ruling requires. This slice changes no store/config/client logic and takes no lifecycle lock.

### D8. One user-visible save; publish on save and on close

| Trigger                                                                                                             | Effect                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Save (the WebUI status bar button)                                                                                  | persist, then publish                                                         |
| Every 5 minutes while the editor holds a modification that no committed save covers, driven by the editor host page | persist only; shown in history as auto-saved, not published                   |
| Leaving the editor (chat switch, sidebar close, editor close)                                                       | session close; when the final callback reports changes: persist, then publish |
| Page refresh or tab close with unpublished changes                                                                  | browser-native `beforeunload` prompt                                          |

The WebUI status bar button is the only save. The editor's own save command (Ctrl+S) is left as DocumentServer ships it with user-initiated force save off: it flushes the edit to DocumentServer and produces no callback, so it neither persists nor publishes. The host page cannot intercept it, because the editor runs in DocumentServer's own cross-origin frame, and a callback the broker did not request would have no `save_seq` and no way for the host page to know what it covered. The status bar therefore keeps showing unsaved after Ctrl+S, which is true; the content is published by the next save, or when the user leaves the editor. Known limitation, recorded in the user documentation.

A save or a close that finds nothing new since an auto-save still publishes: when DocumentServer reports nothing to save (or status 4), the session's latest stored version is published if it is not already. Otherwise an auto-saved version could never reach the workspace file.

`autoAssembly` stays off. The documented loss bound is 5 minutes: after a DocumentServer crash or restart, input since the last auto-save may be lost and the session becomes `orphaned`. There is no discard action; undo is a restore from history.

Alternative rejected: the plan's two-level model (save persists, a separate action publishes). A user who saves and then asks the Agent to continue would have the Agent read the old file.

### D9. Session, key, ordering, callback statuses

Session states: `opening → editing ⇄ saving`, `closing → closed`, plus `conflict`, `error`, `orphaned`. `closed`, `error` and `orphaned` are final. One open session per document; a second tab of the same user joins it with the same `document.key`. The key is stable for the life of the session and a new session gets a new key. A join returns a freshly signed editor configuration with a new source ticket, so a session whose first tab died before the editor loaded can still be opened. A session records the restore epoch current at its creation (D18); a mismatch makes it `orphaned`.

#### Session creation transaction

Task 12.2 registers the concrete POST route inside `create_office_router()` before its unknown-route fallback. The handler uses the guard's canonical chat identity and does no DocumentServer I/O. Authorization, disabled-route and absent-chat behavior remain owned by D7.

The [approved interface extension](https://github.com/DankerMu/open-webui/issues/128#issuecomment-5977752090) keeps the canonical `OfficeStore.store_version` implementation and adds an optional state mutator receiving the successor and selected version. It runs inside the existing version/receipt state update, before publication. Creation uses that seam for document and session metadata; it never nests a separate version commit inside a state mutator or follows capture with a second commit. Existing callers retain their behavior.

Governing invariant: one committed successor contains the captured version, document metadata and opening session, or none of those changes is published. A precommit failure cleans only blobs owned by that operation; pre-existing blobs and state bytes remain unchanged. Postreplace `StateDurabilityError` retains the complete visible successor and its referenced blob and returns an explicit 500 `state_durability`, not a clean-refusal or rollback claim.

Under the shared chat lock, resolve the persisted file id, validate its case-insensitive extension, read through the safe reader, validate the OOXML container and check the free-space floor even if the latest version is reused. Unknown/malformed/tombstoned/foreign ids map to 404 `unknown_file`; unsupported names to 415 `unsupported_type`; unsafe paths to 422 `unsafe_path`; oversize reads to 413 `file_too_large`; invalid containers to 422 `corrupt_document`; the floor and precommit ENOSPC to 503 `storage_low`. Corrupt Office state returns 500 `state_corrupt` without regeneration.

`read_workspace_file` gains an optional nonnegative byte limit. Descriptor/path/regular-file checks precede content reads; known-oversized files are refused before reading and growth past the limit stops after at most one excess byte. Hash/stability checks and descriptor cleanup remain shared with uncapped callers. Creation supplies the outputs broker's per-file limit; no index scan or second reader is added.

OOXML validation uses the standard-library ZIP/Expat readers without extraction: require readable package metadata and the declared format's main part with matching content type and XML root. Admit only stored and DEFLATE ZIP members before decoder entry; other standard-library codecs can allocate output before the caller's read bound applies. Stream all inspected XML through EOF and CRC verification, reject DTD/entity declarations through encoding-independent parser handlers, and keep one 100 MiB decompressed-byte budget across inspected parts to bound compressed-input amplification. Member names are limited to 1024 UTF-8 bytes; there is no separate member-count cap. Malformed/encrypted/unreadable containers, exceeded parser bounds and type mismatches return `corrupt_document`. These package checks are not an Office renderer or complete ECMA schema validator.

Document metadata uses `file_id`, `type`, `path`, `published_version` and `published_sha256`, alongside the existing `versions`. Session metadata uses `session_id`, `file_id`, `document_key`, `baseline_sha256`, `restore_epoch`, `state: opening` and `save_seq: 0` (the first allocation is 1). The selected version is published workspace content; equal-latest reuse preserves its number/source/parent/time, while an older matching blob receives a new version number. Session ids and keys are checked against all retained sessions of the chat, including final ones.

Prepare the signed configuration and source ticket before publishing state; ticket claims bind the selected version and new session. `editor_config` is the editor configuration object (`document`, `documentType`, `editorConfig`) plus `token`, which signs those configuration fields without the token itself; it is not a bare JWT string. Both URLs use `OCU_OFFICE_SELF_URL`; the response carries no credential value. Signing or epoch-read failure cannot leave a captured version or session behind. The epoch reader remains read-only, including when its marker is absent.

Task 12.2 does not implement joining or reopen checks. Until task 12.3 replaces this branch with its specified join behavior, an existing non-final session causes 409 `session_already_open` without mutation. This check is under the same lock as creation so two workers cannot create two open sessions.

Sibling surfaces: store/version/receipt callers, safe-reader callers, router fallback precedence, module reload inventories in auth/outputs/preview tests, and package COPY discovery. Broker resolve, configuration, signing and epoch APIs remain unchanged. No gateway/deployment edits, artificial connection cap, force-save setting, source/callback serving or status endpoint belong to this slice.

Required evidence: all three formats and uppercase names; first/latest/older-content capture; independent token/ticket decoding; no secret in response bytes/headers; two-process same-document exclusion and unrelated-state preservation; ENOSPC before state replacement, failed mutator/signing, postreplace durability failure and bounded-reader boundary/growth regressions. Named refusals preserve existing state/blob/workspace bytes; regular refused files remain downloadable, whereas unsafe paths must never expose link targets.

Refusal byte-preservation covers Office records/blobs and workspace files; creating the existing `.lifecycle.lock` sentinel inside an already-present chat is permitted by the shared-lock primitive. The absent-chat no-directory guarantee remains unchanged.

Review focus: one state publication; no unsafe target reads; bounded input handling; complete signed/persisted agreement; unchanged shared-store semantics. Source tests and packaged HTTP smoke do not certify a real editor or deployment image.

`save_seq` is per session and strictly increasing. It is allocated by a save request, by a close request, and by the first arrival of a final callback when no close allocation is pending. The broker passes it to DocumentServer in the save command's `userdata` together with the intent (`publish` or `persist`). A save is accepted only while the session is `editing`, so one save is outstanding at a time; the host page waits and retries when an auto-save is in flight.

Every callback that is processed to an outcome leaves a receipt keyed by its `save_seq`: status, content SHA-256 when there is content, and the answer given. An incoming authenticated callback is handled in this order:

1. A status 2, 3 or 4 callback for a session that already has the receipt of a final callback returns that receipt's answer without downloading anything. A session ends once, so any later final callback for its key is a retry.
2. A status 6 or 7 callback whose `save_seq` has a receipt returns the receipt's answer when the status and content hash are the same, and is rejected as stale when the content differs.
3. A status 6 or 7 callback without a `save_seq` the broker issued, or with one lower than `last_committed_seq` and no receipt, is rejected and never moves a version backwards.
4. Otherwise it is processed.

| Status | Handling                                                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | update participants; `opening` becomes `editing`; `closing` with a participant still connected returns to `editing` and its close allocation is void |
| 2      | final close with changes: persist, then publish; session `closed`, `conflict` or `error`                                                             |
| 3      | record final-save failure; session `error`                                                                                                           |
| 4      | closed without changes; publish the latest stored version if it is unpublished; session `closed`, `conflict` or `error`                              |
| 6      | forcesave result: persist; publish when the recorded intent is `publish`; a `saving` session returns to `editing`                                    |
| 7      | record forcesave failure; a `saving` session returns to `editing` with the error surfaced                                                            |
| other  | change nothing; record a diagnosable error                                                                                                           |

A final callback takes the pending close allocation as its `save_seq`, or allocates the next one; the number is stored with its receipt on first arrival. A close allocation is void once a status 1 has returned the session to `editing`, so a later final callback (the remaining tab simply closed) allocates a fresh number above every committed save. A status 6 or 7 never changes the state of a session that is `closing` or `conflict`; its result is applied and the state stays. When the callback for the outstanding save is answered with an error (storage floor, invalid content, size limit, failed download), the session returns from `saving` to `editing` with that reason, and a later successful retry of the same callback is still committed.

`last_committed_seq` is the highest `save_seq` whose content is stored, or that DocumentServer confirmed adds nothing. `last_published_seq` is the highest `save_seq` after whose processing the workspace file equals the session's latest stored version. It advances when a publish completes, when a save of either intent finds nothing new and the latest version is already published, when a resolve succeeds, and when persisted content equals the already published version.

`POST .../close` records the intent only; the session ends when DocumentServer reports status 2 or 4. A close leaves a `conflict` session in `conflict`, so a pending conflict is not lost to it. A status 6 or 7 returns a `saving` session to `editing` only when it carries the outstanding `save_seq`. The host page destroys its editor only after the close request was accepted, so that status 1 cannot arrive before the close is recorded. A close on a session that never left `opening` ends it at once as `closed`: no editor connected, so no final callback will come. When a document is reopened, saved or closed and DocumentServer no longer knows the session's key, the session is `orphaned`. A reopen then creates a new session in the same request, with one exception: when the orphaned session leaves the document's newest version unpublished, that request is refused with `unpublished_version` and creates nothing, so the content is offered to the user before a new session buries it (D13). The session is orphaned by then, so the next create request succeeds.

Connection admission follows the [B1 selection decision](../../../docs/decisions/implemented/architecture/2026-10-03-ocu-office-editor-selection.md): 21 distinct documents entered edit mode without a cap refusal, and no documented global live-connection query is available. The broker adds no artificial 20-connection check and the host page adds no cap-event mapping. `refused` is reserved for broker refusals such as validation failure and `unpublished_version`; actual editor/API failures remain errors. This does not guarantee capacity above the measured boundary.

### D10. Persist pipeline

Validate the callback (JWT, session, `save_seq`) → download from the configured DocumentServer server-to-server origin only, validating every redirect hop against it, with timeout and size limit → check size, type and OOXML container structure → stage and fsync → store the version blob and the save receipt under the lock. The callback is acknowledged as successful only after the version is durable; anything else returns an error so DocumentServer retries.

DocumentServer may build the callback's download address from the browser-facing origin it was reached on, which the broker cannot fetch (that listener needs a WebUI session). The broker therefore accepts a download address whose origin is exactly the configured browser-facing DocumentServer origin or the server-to-server origin, takes only its path and query, and fetches that path from the server-to-server origin. Any other origin is rejected without an outbound request. B1 records which origin each callback status carries.

For a callback whose intent is to publish, the version, the receipt and the publish obligation (D11) are written in one state update, so a crash after the acknowledgement cannot leave a stored version that nothing will publish.

### D11. Publish: fence, compare, atomic replace

A publish starts as a journal entry: document, version, session, `save_seq` and what requested it (save, final callback, resolve, restore). For a callback the entry is written in the same state update as the version and its receipt (D10); for resolve and restore, when the request is accepted. The entry is the obligation to publish and is removed only when the publish reaches an outcome.

Always under `_combined_lock(chat)`:

1. Resolve the document's path from its `file_id` in the outputs broker's persisted index. No reconcile runs here: a reconcile fails with an unstable read whenever a sandbox process is writing any file, which is the normal state of a running sandbox. An id that does not resolve is the conflict `path_missing` (D13). An unreadable index fails the publish with `index_unavailable`.
2. Record the target path and the temporary file name in the journal entry.
3. If the sandbox is running: write `fence.json`, `pause`, reload and verify `State.Paused`. A pause failure fails the publish with `pause_failed`.
4. Hash the current workspace file at the resolved path (the safe read of D6). A missing file is `path_missing`; a hash that differs from the session baseline, or a file that fails the safe read — the file itself or any parent directory is a symlink, or it is not a regular file inside the chat's directory — is `baseline_mismatch`. Either is a conflict: nothing is read through a link and nothing is written.
5. Otherwise write the blob to a dot-prefixed temporary file in the target directory opened with `O_CREAT|O_EXCL|O_NOFOLLOW`, fsync, `lstat` every parent component again, `os.replace`, fsync the directory. The second `lstat` is a defence for the replace itself: a path that step 4 accepted and that is unsafe now (the sandbox is paused or stopped, so only a host-side actor can cause it) fails the publish with `unsafe_path`. A `save_as` publish (D13) has no existing file to hash, so step 4 is skipped and this check is its only one.
6. Register the write with the outputs broker so the entry's hash and `revision` are updated in the same locked transaction.
7. `unpause`. Remove `fence.json` only after the sandbox is observed not paused, or not running at all; if it is still paused the marker stays and the stale-fence poll (D12) retries the unpause.
8. In one state update: mark the version published, set the session baseline to the published hash, advance `last_published_seq`, remove the journal entry.

A rename that no listing has recorded yet is not followed: the file is missing at the indexed path and the publish is a conflict, which is safe. The WebUI sidebar reconciles on every listing poll, so the index is normally current.

Target window under pause: below 1 second. Past 5 seconds the publish fails with `publish_timeout` and the sandbox is unpaused. When the sandbox is not running the same steps run without pause; `launch` takes the same lock and therefore waits.

Every publish ends in one of three outcomes, and each removes the journal entry and sets the session:

| Outcome                                                                        | After a save              | After the final callback                 | Resolve or restore request                  |
| ------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------- | ------------------------------------------- |
| published                                                                      | `editing`                 | `closed`                                 | success response                            |
| conflict (`baseline_mismatch`, `path_missing`)                                 | `conflict`                | `conflict`, or the automatic copy of D13 | not applicable                              |
| failed (`pause_failed`, `publish_timeout`, `unsafe_path`, `index_unavailable`) | `editing` with the reason | `error` with the reason                  | HTTP 503 with the reason, session unchanged |

The `editing` of the "after a save" column applies to the save that is outstanding. A published or failed outcome of an earlier save — its callback arrived after the save timeout had already returned the session to `editing` and the user saved again — records the version and the reason and leaves the state as it is, so a session that is `saving` for a newer save stays `saving`. A conflict sets `conflict` whichever save met it, with the one exception D9 already makes: a status 6 result never changes a session that is `closing`. Such a conflict leaves the version stored and unpublished and the session `closing`; the final callback then publishes the latest stored version, meets the same conflict and ends the session in `conflict`.

A journal entry that survives a crash is driven again at startup, by the poll, when a duplicate of its callback arrives, before any other publish for the chat, and before its session is marked `orphaned`: the temporary file it names is removed; if the workspace file already equals the version, steps 6 to 8 complete it; otherwise the publish runs again from step 1. The session ends in the state the table gives for the outcome. A stored version with an obligation is therefore always published, reported as a conflict, or reported as failed.

There is no retry route. After a failed publish the version stays stored. Following a save the user saves again, which publishes the latest stored version. Following a close the document's newest version is unpublished and is offered the next time the file is opened (D13).

Restore runs the same fence. It first stores the current workspace content as a `workspace` version if that content is not yet a version, then publishes the chosen one as a new version. It is refused while a session is open on the document and when the path no longer exists.

The outputs broker gains two operations used here: resolve a `file_id` to its current path (a read of the persisted index; no scan, no hashing), and register a host-side write for a path. Registering a path that has no active entry creates one with a new `file_id`; this is how a `save_as` copy (D13) gets its identity.

#### Read-only resolution boundary

Task 9.1 adds `OutputsBroker.resolve_file_id(chat_id, file_id) -> str` and `FileIdNotFoundError`, using the canonical chat normalization, root-safety checks, `_combined_lock` and validated `_read_index` already used by `current_revision`. It searches only active persisted entries, never the workspace. Exact stored UUID identity is used; malformed or unmatched ids fail as not-found. Corrupt-index errors remain distinguishable and are not reset or translated into absence.

Governing invariant: resolution observes one locked index snapshot without changing its bytes, counter or identities and without contacting Docker. A filesystem rename is followed only after reconciliation records it. The operation does not assert that the indexed file still exists; downstream safe reads own that check.

Sibling surfaces: `reconcile` produces active entries and tombstones; `_read_index` validates them; `current_revision` shares the read and lock pattern; later session creation maps not-found to `unknown_file`, and publish maps it to `path_missing` while corruption becomes `index_unavailable`. These consumers are not implemented in task 9.1.

Evidence targets the public broker seam over real temporary storage: active/nested paths, recorded and unrecorded rename, deletion followed by path reuse, absent/malformed ids, absent/corrupt index, nested same-thread locking and cross-process exclusion. Index bytes and counters stay unchanged across resolution. Existing broker tests retain path confinement, paging and revision behavior. No new route, state format, sandbox lifecycle behavior or registration path is introduced.

#### Host-write registration boundary

Task 9.2 adds `register_host_write(chat_id, path) -> dict`, returning the registered entry with `file_id` and `revision`. Its caller owns `_combined_lock(chat)` from before the workspace write until registration returns; the operation reenters the same lock rather than creating another transaction mechanism. Do not infer ownership from the process-wide flock-depth map.

Governing invariant: one valid host write becomes one durable index successor, advancing the chat counter exactly once, retaining the active identity or assigning a fresh UUID, with no unrelated entry change. A subsequent unchanged reconcile must not count that write again.

Read the existing validated index (or an empty index when absent), safely observe only the requested relative path, and reuse `_hash_observation` for a fresh hash even when size is unchanged. Use the existing relative-path validation and no-follow directory/regular-file primitives; no second hashing implementation, whole-tree scan or path-resolution shortcut. All validation and limits precede `_write_index`, which owns temp-file fsync, replace and directory fsync.

Replace the selected active entry with refreshed metadata/hash/revision, regenerate consistent fingerprints through the existing helper, and preserve tombstones and sibling entries. A new entry never borrows a tombstone identity. A rejected path cannot create an index; a valid first registration may create it. Return only after the existing durable publication finishes.

Errors use existing broker classes: unrepresentable/hidden paths fail name validation; unsafe paths, missing/unstable/non-regular targets and exceeded limits retain the safe-reader taxonomy. No consumer may assume every filesystem rejection has one exact subclass. A failure before replacement leaves the predecessor intact; a directory-fsync error after replacement keeps the existing explicit commit-durability failure semantics.

Sibling surfaces: `reconcile` and `current_revision` observe the same index; `resolve_file_id` must resolve a newly assigned id; publish and save-as later consume the returned id/revision. Uploads remain reconcile-driven. Tests cover these read-side seams, real cross-process lock exclusion, fresh-process durability, path confinement and resource-limit rejection; none requires Office or Docker.

### D12. Stale-fence recovery, the session sweep, and why nothing else needs to yield

`fence.json` records when the pause began. OCU's startup sweep and the existing idle-reclamation poll take the chat lock, and if they find a marker older than the 5-second limit they unpause the sandbox and remove the marker once it is observed not paused. A broker crash or a failed unpause therefore cannot leave a sandbox frozen for longer than one poll interval. A paused sandbox without a marker was not paused by a publish and is left alone.

The same poll sweeps Office sessions, so that no state is left without an exit:

- A session in `opening`, `editing`, `saving` or `closing` with no callback and no request for longer than a configured liveness interval (longer than the ticket lifetime) is checked against DocumentServer. If DocumentServer no longer knows its key the session becomes `orphaned`. If DocumentServer cannot be reached nothing changes.
- A session in `saving` for longer than a configured save timeout whose key DocumentServer still knows returns to `editing` with reason `save_timeout`.
- A journal entry left by a crash is driven again (D11), before the chat's sessions are checked. The same order holds on a request: an entry of a session that is about to become `orphaned` is driven to its outcome first, so an orphaned session never holds one and an entry is removed only by its outcome. The orphaning then applies to the state the outcome left. The key check concerns every session whose editor is still expected: `editing`, `saving`, `closing`, and `conflict` without the receipt of a final callback. Such a session becomes `orphaned`; its conflicting content stays stored and unpublished and is offered like any other unpublished content. A session the outcome put in `closed` or `error`, or in `conflict` with the receipt of a final callback (a pending conflict, whose editor has ended), stays there. Versions an orphaned session stored without publishing are offered at the next open (D13).

The retention guard, the cleanup cron and recovery do not check a lease. The retention guard only stops containers, which removes writers and cannot corrupt a replace; the following `unpause` finds no running sandbox and the marker is removed. Cold backup requires every writer including OCU to be stopped, so no publish is in flight. The upstream cleanup cron is disabled in the overlay.

### D13. Conflicts, content waiting to be published, and the change notice

The user's content is always stored as a version before a conflict is reported. `POST .../resolve` then publishes the session's latest stored version, which may be newer than the one that first met the conflict, and accepts:

- `save_as` (default): publish to a new, deduplicated file name next to the original, claimed without replacing as in D3; when the original directory is gone or is not safe (it or a parent is a symlink), the new file goes to the workspace root instead, so nothing is written through a link. The new file is a new document whose first version has source `conflict`; the session continues on it.
- `overwrite`: store the current workspace content as a version (source `workspace`), then publish over it. The UI asks for a second confirmation. It is refused with `unsafe_path` when the file fails the safe read.

When the original path no longer exists only `save_as` is accepted; a deleted path is never recreated under its old name. When the workspace files directory itself is gone, neither action can place a file: the resolve is refused with `workspace_missing` and the session becomes `error` with that reason, the version kept, as at an unattended close. Resolving a conflict whose editor has already ended closes that session; editing again is an ordinary new session on whichever file the user opens.

Nobody is present when the publish at close meets a conflict, so the content must come back to the user without an action at that moment (user decision):

- **The file still exists but changed** (`baseline_mismatch`): the conflict is kept on the document and the conflict dialog is shown the next time that file is opened.
- **The file is gone** (`path_missing`): there is no entry to open, and `save_as` is the only action the rules allow anyway. The broker performs it at once: the version is published as a new file under a deduplicated name and the session is `closed`. The new file appears in the Files listing. If the workspace files directory itself no longer exists, nothing is created; the session is `error` with reason `workspace_missing` and the version is kept.
- **The publish failed, or the session was orphaned with auto-saved content** (DocumentServer restarted): the document's newest version is unpublished. When a file is opened for editing and its newest version is unpublished while no session is open, the UI offers to restore that content or to start from the current file. Restoring uses the restore route; starting from the current file leaves the unpublished versions in history, and the new session's `workspace` version becomes the newest one, so the offer is not repeated. This is what makes the 5-minute loss bound hold in practice.

  After a DocumentServer restart the old session is still stored as `editing` until something checks its key, so the versions read reports it as open and no offer is made. The create request is where the key is checked (D9), and it is therefore where the offer is guaranteed: a create that orphans the session while the newest version is unpublished is refused with `unpublished_version`, the host page reports the refusal, and the parent runs the open check again, which now finds no open session and makes the offer. Restore makes the same key check before it refuses with `session_open`, so history can restore the content without opening the editor first. The versions read itself never contacts DocumentServer; it applies the restore-epoch check, which is a local file read.

The guard that follows a session after its frame is gone (D15) tells the user how the close ended: saved, saved as a new file with its name, conflict waiting at the next open, or failed. The session status carries `saved_as`, the `file_id` and path of the new document a `save_as` created for the session (manual or automatic), or null.

While a session is open, `GET .../sessions/{session}` checks the one file being edited: `stat` first, hash only if size or mtime changed since the last check, and reports `workspace_changed` when the hash differs from the baseline. The last-checked size and mtime are cached in the session record; that bookkeeping is not a user-visible change, so the row stays non-mutating in the proxy table. The notice is a convenience. Safety comes from step 4 of D11, which always hashes. Hashing happens only at session creation, at publish and in this poll; the regular reconcile is unchanged, so the Plan 1 blind spot for same-size edits in the sidebar preview remains.

### D14. Revocation and deleted chats

A user who has lost access is denied new requests by the proxy, and tickets expire. The final callback of a session that was already open still publishes to the same chat: the content was written while authorized and chat ownership cannot move. Logout is not an immediate revocation (Plan 1 deviation, unchanged).

Deleting a chat in WebUI does not remove its OCU directory (Plan 1: no cascade, the data is orphaned). The final callback of a session that was open at that moment is therefore stored and published into that directory like any other; nobody can reach it afterwards, because the proxy denies every request for a chat that no longer exists. No deletion hook is added (user decision).

Only an operator removes directories. If the chat's workspace files directory is gone while its Office state remains, the version is kept, the session is `error` with reason `workspace_missing`, and no file or directory is recreated. If the chat's whole data directory is gone, the session is unknown and the callback creates nothing; the handler checks for the directory before taking the per-chat lock, because taking the lock would recreate it. The same check applies to every Office route and to the imports route.

### D15. Editor embedding

A new iframe class in `WorkspaceArtifact`, separate from the generated-document frame and the trusted preview frame. Its `src` is the OCU preview page in a new mode (`?embed=office`), which loads the DocumentServer JS API from the DocumentServer origin and creates the editor from the signed configuration returned by session creation. The frame is created once per edit action and is never keyed by `revision`, path or mtime, so a publish does not rebuild the editor; the session id, which the child page obtains after the frame exists, does not rebuild it either. Editing again after a session ended uses a new frame. Its sandbox attribute is fixed in code and never derived from `$settings.iframeSandbox*`; the exact token list comes from the B1 record.

Messages, exact key sets, validated by source, origin, chat and generation as in the Plan 1 preview protocol:

| Direction      | Message              | Fields                                                                                    |
| -------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| child → parent | `ocu:office-ready`   | `type, chat_id`                                                                           |
| parent → child | `ocu:office-open`    | `type, chat_id, file_id, generation`                                                      |
| child → parent | `ocu:office-state`   | `type, chat_id, file_id, generation, session_id, state, dirty, workspace_changed, reason` |
| parent → child | `ocu:office-command` | `type, chat_id, generation, command` (`save` or `close`)                                  |

A page instance accepts one `ocu:office-open`; a command must carry that open's generation. `file_id` in state messages is always the one from the open, also after a `save_as`. `dirty` means unpublished content exists; the auto-save timer instead fires while the editor holds a modification that no committed save covers, so an auto-save that failed is tried again at the next tick. `session_id` and `reason` are null when there is nothing to report.

The host page owns session creation, the status poll, the 5-minute auto-save timer and the save/close calls. On `close` it also destroys the editor instance, because DocumentServer sends the final callback only after the participant has left. The parent owns versions, restore and resolve calls and the status display. When the frame is destroyed before the session has ended (chat switch, sidebar close), the parent's guard module keeps the session id and reads the session status through its own client until a final state or the progress timeout. The read-only Files embedding and its protocol are not changed.

### D16. WebUI surface

- `WorkspaceArtifact`: an 编辑 action on DOCX/XLSX/PPTX entries; while editing, a status bar with state text, save, history, maximize. Activating 编辑 never launches a stopped sandbox.
- Before the editor frame is created the parent reads the document's versions. The response also carries the document's open session, if any, as `open_session` with `session_id`, `state`, `reason` and `editor_ended` (true when the session holds the receipt of a final callback). A session in `conflict` with `editor_ended` true is shown as the pending conflict; any other open session is joined; with no open session and an unpublished newest version, the restore-or-start-from-current choice of D13 is offered. When the host page then reports the creation refused with `unpublished_version`, the parent retires the frame and repeats this check.
- Maximize is an overlay inside the WebUI page, not the Fullscreen API.
- History lists versions with source and published flag and offers restore; restore is refused while a session is open on the document. History is reachable from the file entry when the file is not being edited, as well as from the status bar.
- Unsaved-state guard: `beforeunload` while unpublished changes exist; chat switch and sidebar close send `close`, show progress, and then report how the close ended (D13). The hooks in `ChatControls.svelte` and `Chat.svelte` are minimal calls into a new module.
- Feature flag `ENABLE_OCU_OFFICE_EDIT`, default false, exposed through the config features object like `enable_ocu_workspace`. With the flag off no edit entry is rendered and no Office request is made. A value that is neither true nor false fails startup (AGENTS.md: misconfiguration fails loud); the existing workspace flag's lenient parsing is not changed here.
- A new client module `src/lib/apis/ocu/office.ts` and chat-keyed store state beside the workspace store.

#### Office flag slice boundary

Task 23.1 owns only backend discovery of the Office switch. Parse once at import
beside the existing fork-owned OCU flag; `main.py` adds one authenticated
features entry, not another parser. The flag contract is recorded in
`docs/plans/2026-09-20-office-manual-editing.md` §5.

Invariant: unset means false; only case-insensitive `true`/`false` are accepted.
Empty strings, whitespace padding and other values fail startup with the
variable name, without echoing arbitrary input. Workspace parsing stays lenient
and independent; an invalid Office value fails even when workspace is disabled.
Anonymous config omits the Office key, while authenticated config reports a
boolean regardless of the workspace flag's value.

Sibling surfaces are router import, main config serialization, dev environment,
backend test environment and the existing workspace config/auth tests. Both
harness environments explicitly enable Office for later consumers; production
defaults remain off. No client consumes the setting in this slice.

Test environment setup must precede each case-specific environment assignment
and fresh application import, so harness defaults and Python module caching
cannot fake parser coverage. Isolated subprocesses use the existing harness
storage boundary; authenticated TestClient config proves the parsed value.
An invalid-case subprocess must exit on startup and name the setting. Real
harness smoke and an authenticated config probe prove the configured runtime;
scoped route/auth tests, lint and coverage retain existing authorization.

### D17. DocumentServer placement and origin

DocumentServer is a compose service on the control-plane network only, with no host publication and no Docker socket. It is added to the existing core stack beside the OCU server, not as a fourth stack, so the deployment entry and the smoke keep their three-stack lists. The proxy publishes a second port whose listener forwards to DocumentServer, including WebSocket upgrade. Every request on that listener passes session authentication (`/api/v1/auths/` with the browser cookie; cookies are not port-scoped). Browsers therefore see DocumentServer on a different origin from WebUI, so script running in the editor origin cannot read WebUI's `localStorage` token. The listener uses the WebUI session cookie for the authentication subrequest only and does not forward it to DocumentServer, a third-party image that has no use for the user's WebUI credential; B1 confirms the editor works without it.

The deployment has one shape. Once B5 lands, DocumentServer, the second listener and the second port are always present, whether the WebUI flag is on or off; the flag only decides whether WebUI offers editing. A conditional service would make the proxy configuration, the port guard, the smoke and the release inventory each carry two variants, and nginx refuses to start when a rendered upstream does not resolve. Cost accepted: DocumentServer uses memory while the flag is off.

JWT is enabled in both directions with a secret generated by bootstrap. The broker reaches DocumentServer's command service and download URLs on the control-plane address; DocumentServer reaches the broker's two control-plane routes the same way. The port guard changes from exactly one proxy publication to exactly two.

The settings that cross a component boundary have fixed names, so that OCU's configuration, bootstrap's output and the compose files cannot drift apart. The OCU configuration module defines the four it reads as constants and the deploy tests compare the resolved compose environment against them. Once `OCU_OFFICE_DOCSERVER_URL` is set, the other three that OCU reads are required: a blank secret, origin or self address stops the server at startup.

| Name                          | Set by                                                         | Read by                                  | Meaning                                                                              |
| ----------------------------- | -------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `OCU_OFFICE_DOCSERVER_URL`    | bootstrap                                                      | OCU; the proxy compose service           | DocumentServer's control-plane address; setting it enables Office editing            |
| `OCU_OFFICE_DOCSERVER_ORIGIN` | bootstrap                                                      | OCU                                      | DocumentServer's browser-facing origin (the second proxy port)                       |
| `OCU_OFFICE_SELF_URL`         | bootstrap                                                      | OCU                                      | OCU's own control-plane address, given to DocumentServer for the source and callback |
| `OCU_OFFICE_JWT_SECRET`       | bootstrap                                                      | OCU; DocumentServer's three JWT settings | the shared JWT secret                                                                |
| `OCU_OFFICE_PROXY_PORT`       | bootstrap                                                      | proxy compose service, port guard, smoke | the second published proxy port                                                      |
| `OCU_OFFICE_FONTS_DIR`        | bootstrap                                                      | compose                                  | the operator-owned font directory (D19)                                              |
| `ENABLE_OCU_OFFICE_EDIT`      | bootstrap                                                      | WebUI (through its compose service)      | the user-facing flag (D16)                                                           |
| `DOCUMENTSERVER_IMAGE`        | the release assignments, from the inventory                    | compose, release verification            | the image reference                                                                  |
| `OCU_RELEASE_FONTS_DIR`       | the deployment entry, derived at every start (D19); not stored | compose                                  | the release font directory                                                           |
| `OCU_OFFICE_PROXY_LISTEN`     | the proxy compose service; the WebUI smoke harness             | proxy renderer                           | listen address of the DocumentServer listener                                        |
| `OCU_OFFICE_PROXY_UPSTREAM`   | the proxy compose service; the WebUI smoke harness             | proxy renderer                           | DocumentServer upstream of that listener                                             |

The broker's tuning values (free-space floor, ticket lifetime, liveness interval, save timeout) have defaults in the OCU configuration module and are not part of the deployment contract.

Task 11.1 uses `office/config.py`. Its four environment-name constants have the identifiers and values shown in the first four rows above. `enabled()` reads the address at call time and treats absent, empty or whitespace-only as unconfigured. `validation_error()` returns the first missing/blank setting name (secret, origin, self address), or `None`; the existing parent-process preflight owns the diagnostic and exit status and invokes this check after its existing checks. Office diagnostics name settings, never their values. Blank detection does not normalize secret bytes; URL-format and secret-strength validation are outside this slice.

The module's positive integer defaults are `MIN_FREE_BYTES = 1024**3`, `SOURCE_TICKET_TTL_SECONDS = 300`, `SESSION_LIVENESS_INTERVAL_SECONDS = 600`, and `SAVE_CALLBACK_TIMEOUT_SECONDS = 30`. The floor reserves storage headroom; source tickets allow a bounded loading window; the liveness idle threshold outlives those tickets as D12 requires; the save timeout bounds waiting while late callbacks retain the existing commit rules. These are not environment settings or deployment measurements. No tuning overrides or import-time environment snapshot are added. The store continues accepting a caller-supplied floor.

Alternatives rejected: a same-origin path prefix (the editor frontend, which renders documents an injected Agent can craft, would share WebUI's origin); a subdomain (needs LAN DNS, which the deployment does not have).

### D18. Release and backup

DocumentServer is the seventh role in the release inventory, of kind `pull` like PostgreSQL: identity recorded as image configuration digest and archive SHA-256, verified at import and at every start. No derived image is built.

The inventory's `format_version` rises to 2. A version-2 inventory has seven roles and the `font_bundle` field (D19); every inventory load — the release command line (build, import, verify), the deployment entry, and recovery when it restores or activates a retained release — requires version 2 and refuses a version-1 inventory (six roles, no font bundle) by naming the format version. No second format is carried. The only release with a version-1 inventory is the Plan 1 release, which never went live (user decision, 2026-10-02), so no retained release and no recovery set of that format exists.

Backup quiesces editing before it stops writers, in this order:

1. Stop the proxy. No browser can reach WebUI, OCU or DocumentServer, so no session can start.
2. Ask DocumentServer to save and close every open document with the shutdown-preparation command the image ships (B1 names it). The final callbacks travel on the control-plane network and are persisted and published by OCU, which is still running.
3. Wait, up to a configured timeout that is longer than the session sweep's liveness interval, until no chat's Office state holds a session in `opening`, `editing`, `saving` or `closing` and none holds a journal entry. The check reads the state files; it does not call OCU.
4. Stop the remaining writers, DocumentServer among them, and capture.

If step 2 fails or step 3 times out, backup names the sessions still open, stops the writers as the existing failure rule requires, and publishes no complete set. DocumentServer leaves its shutdown mode when the deployment is started again (B1 confirms a restart clears it). DocumentServer's data volume is not part of the recovery set. The broker's state and versions are inside the chat-data component already.

Restore epoch: the file `{BASE_DATA_DIR}/.office-restore-epoch` holds one line, an opaque token. An absent file is the initial epoch. Restore writes a fresh random token after the chat-data tree is in place. A session stores the epoch read at its creation; the broker compares for equality on every session request and every callback and treats a session with a different epoch as `orphaned`, so no pre-restore callback is replayed. The broker owns the format; recovery only writes the file.

#### Restore-epoch read boundary

Task 10.3 adds `office.epoch.current_epoch() -> str | None` and `RestoreEpochError`. `None` represents initial absence and differs from all strings, including the readable empty token `""`; ordinary equality is sufficient and survives JSON storage by future session owners. Decode UTF-8 and strip surrounding whitespace without interpreting token structure.

Governing invariant: every call observes the marker anew and returns either its opaque token, absence, or an explicit read failure; it never changes filesystem state. ENOENT, including a missing base path, is absence. Other read errors retain their cause under `RestoreEpochError`. Reuse the Office no-follow/nonblocking file flags and verify a regular file, so directories, FIFOs and symlinks cannot masquerade as tokens or block the reader.

Sibling surfaces: restore task 33.2 owns atomic token publication; session and callback tasks own storing/comparing tokens and orphaning. No cache, per-chat marker, timestamp order, default token string or extra lock is introduced. Evidence distinguishes absent from whitespace-only content, observes A→B without restart, and proves unreadable markers are not silently absent.

One-version rollback verifies the seven images that the selected release's own inventory records. Recovery offers no rollback to a release that predates this change: such a release has a version-1 inventory, which recovery refuses.

### D19. Fonts

The release carries open-source CJK fonts (Noto Sans CJK SC and Noto Serif CJK SC, SIL Open Font License 1.1) in a directory mounted into DocumentServer. DocumentServer is a pulled image with no build step, so the fonts cannot be a build material of a role the way Draw.io and Pyodide are. They travel as a font bundle, a second non-image member of the release package beside the source bundle:

- **Pin.** `deploy/fonts/fonts.json`, tracked in the OCU repository, names each upstream archive (URL and SHA-256), the font files taken from it (name, SHA-256, size) and the licence file. No font file is tracked: font files exceed the repository's 500 KB limit.
- **Build.** `release.py build` runs `deploy/fonts/prepare_fonts.py`, which downloads the pinned archives, checks every SHA-256 and writes `fonts.tar` holding exactly the listed files and the licence text. The inventory records it in the top-level field `font_bundle` (`path`, `sha256`), the shape `source_bundle` already has.
- **Import.** `import_release` copies `fonts.tar` into the stage, checks its SHA-256 against the inventory, extracts regular files only into `fonts/` in the install root, checks each file against `fonts.json` of the release's source, and removes the archive.
- **Start.** The release font directory is always `fonts` beside the installed inventory that `OCU_RELEASE_MANIFEST` names. The deployment entry derives `OCU_RELEASE_FONTS_DIR` from that at every start and exports it for compose, which mounts it read-only; it is not a stored setting, so nothing has to be remapped when a restore or a rollback selects another release root. The release check that `deploy/up.sh` already runs before any service starts (source, runtime binding, local images) also checks that this directory holds exactly the files of `fonts.json` with their SHA-256. A missing directory would otherwise be mounted empty and Chinese text would silently render in a fallback font.
- **Restore and rollback.** At activation recovery imports the selected release into its own root and publishes the inventory into the deployment root, with `source` as a link into the selected root. It places `fonts` beside the published inventory the same way, as a link to the selected root's `fonts/`.

A second, operator-owned directory (`OCU_OFFICE_FONTS_DIR`) holds fonts supplied by the deploying organisation (仿宋\_GB2312, 方正小标宋简体, 楷体\_GB2312; licences held by that organisation, recorded by B1 as stated) and is mounted the same way. Bootstrap creates it empty; the operator copies the supplied fonts into it. DocumentServer regenerates its font list at start. Neither repository nor the release package contains the supplied fonts. 宋体 and 黑体 are substituted by the two shipped families; substitution effects are recorded as fidelity notes.

Alternative rejected: a derived DocumentServer image with the fonts in a layer. It would reuse the existing build-material path, but the plan fixes the upstream image as unmodified, and the role would stop being a pulled image.

### D20. Acceptance machine

The existing 4 vCPU / 7.4 GiB / 33 GiB machine. Whether swap is configured is the operator's choice at deployment; B1 records the memory and swap actually present (user decision: recorded, not a gate). Its memory plan assumes one running sandbox at a time instead of two. OCU has no setting that limits concurrent sandboxes and this change adds none: the figure is an operating constraint of the acceptance run, recorded with the deviation, not an enforced limit. The machine is below DocumentServer's official minimum; B1 records both figures. It is an acceptance environment, not a capacity proof.

### D21. Verification strategy

PR CI runs broker tests against recorded callback fixtures and a fake Docker client, proxy renderer tests, Vitest component tests and Playwright against the deterministic stub. A local `make verify-office` target starts a real DocumentServer and runs the three-format round trip; its evidence is pasted into PRs. The B-T01–B-T16 matrix runs on the acceptance machine. Exported files are reopened by the script with a second implementation, LibreOffice headless; a missing LibreOffice fails the target. Desktop Office is supplementary evidence only.

The samples are deterministic and carry what the acceptance rows judge: the DOCX has headings, a table, an image and Chinese text; the XLSX has two sheets, formulas including a cross-sheet reference, and a chart; the PPTX has several slides with shapes and an image. After the round trip the script checks that the edit is present, that formula cells still hold formulas and their recalculated values match, and that tables, images, sheets and slide order are intact. Page count before and after, and fonts substituted, are written to a fidelity record; differences are listed, not judged.

#### Office stub boundary

Task 22.1 changes `scripts/ocu-stub.py`, adjacent Office fixture/page helpers and
the `make smoke-stub` script and helpers. Keep the shared entrypoint below its
file-size limit rather than embedding another state machine in the handler.

Governing invariant: a chat's Office responses and visible file revisions are a
deterministic function of its selected scenario and ordered requests, never of
another chat, credentials, wall-clock delays or an external service.

Preserve the existing uploads, private observation channel, prefix handling,
file-serving semantics and every non-Office preview body and response policy.
Reuse the stub's listing and identity seams; Office changes must be visible to
outputs and file consumers rather than stored in a disconnected second listing.
Serialize shared transitions in the threaded stub, with deterministic session,
version and new-file identities. Persist-only saves do not change workspace data.

Sibling surfaces are Office dispatch, session/status/version responses, outputs
listing and file serving, scenario selection, private request recording and the
Office host page. The host uses the same exact message keys and generation
checks as D15, prefixed same-origin requests and the mutation header; its visible
modification control needs no DocumentServer or externally loaded resource.

Evidence uses real HTTP through `make smoke-stub`: default and all seven
scenarios, forbidden method/path rejection, credential canaries, independent
chats, concurrent joins and fresh-process replay. Review checks the executable
page against D15; this issue's command does not execute JavaScript, so its first
browser proof remains tasks 24.1/24.4. No source outside the stub/smoke boundary,
gateway pin bump, production broker behavior or deployment acceptance is added.

#### Office gateway smoke boundary

Task 22.2 consumes the reviewed 27-row OCU table through the exact pushed pin.
The shared smoke entrypoint is already at its size limit; new matrix and
observation handling belongs in its support module, not a second gateway runner.

Invariant: every successful Office probe is attributed to its exact stripped
path, owner and chat, and every denied probe is proven not to contact OCU.
Keep the request and its private observation boundary adjacent; aggregate
arrival totals across mixed successes and denials cannot establish this claim.

Use the existing real-cookie provisioning, native nginx, fixture selection,
Hurl variables and private report/credential scanners. Resolve requires a
publishing save followed by observed `conflict`, then a valid resolve action.
Restore requires observed `closed`, not merely an accepted close response, and
a version number obtained from the versions reply. Track the applicable
file/session identities through resolution instead of predicting opaque IDs.

Preserve all existing gateway cases and the smoke API used by browser
verification. Log each explicit Hurl file when invoked, including failure; do
not report a file merely because its name exists in a constant. Missing listed
files and incompatible route tables fail visibly. Private staging and owned
cleanup cover both successful and failed matrices.

Preserve `Smoke` constructor/state, `pin()`, `verify_checkout()`, `render()`,
`start_owned()` arguments/PID ownership and `cleanup_procs()`, plus
`PINNED_FILES` and `require_tools()`. `BrowserHarness` retains its `run()`,
`provision()`, `cleanup_data()` and `assert_sentinel()` overrides;
`run_owned_lifecycle` still dispatches their cleanup polymorphically. A
read-only callsite/diff audit of `scripts/verify-ui-ocu.py` records compatibility
for these unchanged seams; gateway smoke does not claim to execute the browser
subclass. Browser case additions and a full browser run are outside this slice.

Sibling surfaces: pin loader/materializer, renderer inputs, cookie provisioning,
stub scenario mapping, Hurl request/reply evidence, private arrival records,
credential scanner and lifecycle cleanup. No stub/proxy production changes,
second listener, browser case or real-editor acceptance belongs to this slice.
The negative controls in group22 prove discovery and pin failures without
turning scratch mutants into permanent source or weakening the passing oracle.

### D22. `/files` cache policy

`GET /files/{chat_id}/{path}` responses carry `Cache-Control: no-store`, so a preview after a publish cannot come from a cache keyed on mtime and size.

## Risks / Trade-offs

- **B1 can invalidate the editor choice after the specs are written.** → B1 is a DAG root and gates every Office task; B0 is independent and still delivers value.
- **Permanent divergence from upstream OCU on 25 files.** → Accepted by the user. The change is mechanical (a path string) and confined to one commit set, so a rebase conflict is resolvable by re-applying the rename.
- **A model writes to an old path by habit.** → The write fails loudly (`/mnt/user-data` is not writable); the system prompt names only the new path.
- **The Agent can modify or delete an uploaded original.** → Intended. WebUI keeps the attachment; the first edit session stores the pre-edit content as a version.
- **WebUI's stored attachment and content already injected into the model context go stale after an edit.** → Out of scope (Non-Goals); stated in the user notes.
- **Pause freezes user processes.** → Window under 1 second, hard limit 5 seconds, stale-fence recovery on the next poll.
- **A same-size, forged-mtime Agent edit is not noticed while editing.** → The publish-time hash still catches it; only the convenience notice is missed.
- **DocumentServer below its official minimum on the acceptance machine.** → Recorded deviation; the acceptance run keeps at most one sandbox running; production capacity is not claimed.
- **Concurrent-editor capacity is not certified.** → B1 demonstrates 21 admitted documents on the local machine, not production capacity; no synthetic cap replaces capacity measurement.
- **A rename the index has not recorded is not followed at publish.** → The publish becomes a conflict and the content is saved as a new file; nothing is lost.
- **Two workers and file state.** → Every transition is a locked read-modify-write of one file; no in-memory session state.
- **A second published port widens the LAN surface.** → Session authentication on the listener, DocumentServer JWT, and DocumentServer itself still publishes nothing.
- **A final save is refused because the disk filled during the session.** → Session creation already refuses below the floor, so the window is a disk filling while a document is open; DocumentServer retries, and if space does not return the input since the last stored version is lost and the session ends `orphaned`.
- **The file is gone and the automatic copy also fails.** → A double fault. The version stays in the store and the failure is logged with chat, document and version, for recovery by an operator.
- **Version blobs grow without pruning.** → Content-addressed, free-space floor checked before every store, refusal instead of partial writes.

## Migration Plan

1. B0 ships with a rebuilt sandbox image and the updated OCU server and tool. On the acceptance machine existing chat data, containers and volumes are removed before the first start; no migration runs.
2. B1 runs against an isolated DocumentServer and produces the verification record and a go/no-go.
3. B2–B4 land behind `ENABLE_OCU_OFFICE_EDIT=false`. B5 adds DocumentServer to the overlay, the release inventory and backup, then enables the flag on the acceptance machine and runs the matrix.
4. Rollback: turn the flag off; read-only preview and all stored versions remain; published files stay usable. Rolling back B0 means the previous sandbox image and server, and recreating sandbox containers; the recovery tooling does not do this, because a release that predates this change has a version-1 inventory (D18).

## Sketch seams under test

1. **OCU `pytest` on the broker package through its public functions and FastAPI `TestClient`** — the highest seam that covers store, sessions, callbacks and publish with a fake Docker client and recorded DocumentServer callbacks; one suite proves B-T04, B-T06, B-T08, B-T11 and B-T13 at source level.
2. **OCU `pytest` on `docker_manager` lifecycle (`tests/orchestrator/test_lifecycle.py`)** — existing seam; the mount set, the fence's lock sharing with `launch` and stale-fence recovery belong beside the lifecycle tests that already use the fake engine.
3. **Proxy renderer and native tests (`deploy/proxy/tests/`)** — existing seam; the route table, placeholders and second listener are judged where the table is already pinned.
4. **Deploy tests (`tests/deploy/`)** — existing seam for port guard, release inventory, recovery and bootstrap with the stateful fake engine.
5. **WebUI Vitest on `WorkspaceArtifact` and the new store/client modules** — existing seam for component state and message validation.
6. **WebUI Playwright through the dev proxy and the deterministic stub (`make verify-ui-ocu`)** — existing seam for the edit entry, status bar, guard and maximize in a real page.
7. **`make smoke-proxy`** — existing seam that ties the WebUI pin to the OCU proxy table; covers the added and removed rows.
8. **`make verify-office` against a real DocumentServer** — new seam, the only one that exercises the real editor protocol; kept out of PR CI.

## Not yet specified

- What the production machine for 20 users must provide; capacity is a measurement that has not been made.
- A pass or fail bar for pagination and layout differences; this change records the differences and judges none.
- How a later DocumentServer version is adopted: which parts of the B1 verification must be repeated.

## Open Questions

- The exact iframe sandbox tokens and permission-policy features the editor needs — answered by the B1 record; the spec fixes that the list is constant and code-defined.
- Which origin DocumentServer puts in a callback's download address — answered by the B1 record; the spec accepts both configured origins and always fetches from the server-to-server one.
- The measured delay between the last tab closing and the status-2 callback — answered by the B1 record; it sets the progress timeout shown by the UI, not the protocol.
