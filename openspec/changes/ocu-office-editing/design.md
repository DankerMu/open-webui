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

#### Control-plane authentication slice

Tasks 14.1 and 14.4 add source delivery and callback admission, not callback processing. Until task 14.2 supplies processing, an authenticated callback returns HTTP 503 with reason `callback_processing_unavailable`, changes no state and never acknowledges a save. This is the issue's explicit non-success slice ruling; no status-specific handling, download or receipt is added here.

Admission order is transport-peer rejection, Office availability, then route-specific identity and credential checks. A sandbox peer receives 403 even when Office is disabled; otherwise disabled source/callback routes return 404 without evaluating credentials or storage. Control-plane OPTIONS requests do not bypass this boundary through the generic CORS shortcut. Other service and browser Office authentication remains unchanged.

Callback chat ids use the existing canonical rules, including empty/transient/encoded cases. After JWT verification, check the chat control directory without creating it and before taking the canonical chat lock; a removed directory is 404 `unknown_session`. Under that lock recheck the safe root, read the session and compare its document key with the verified payload. Missing/mismatched session binding cannot authenticate and returns 401 `invalid_token`; task 14.2 owns the authenticated unknown-session disposition and lifecycle checks.

For the documented [header token](https://api.onlyoffice.com/docs/docs-api/additional-api/signature/request/token-in-header/), `Authorization: Bearer` signs a nested `payload` object. A body `token` signs callback fields directly. A present Authorization header is authoritative: malformed/invalid headers never fall back to a body token. Only the verified callback object supplies key, status, URL and userdata; unsigned copies cannot override it. Existing JWT verification owns algorithms and expiry. Token helpers remain unchanged.

Source verifies the ticket before any version-content read, then checks its canonical chat directory with a non-creating operation before taking the canonical chat lock. A missing chat returns 401 `invalid_ticket` and creates nothing. Under the lock recheck the safe root and resolve the document, positive version and session binding. The session must belong to the ticket's document; no active-state restriction invalidates an otherwise live ticket. A missing binding returns 401 `invalid_ticket`; a missing/corrupt blob is an explicit storage failure, never a workspace fallback. Read only the selected immutable version through existing descriptor-relative no-follow primitives and return those verified bytes, not a pathname reopened by the response.

The user-approved reader exception lets the existing blob verifier return its already-read bytes. Existing write/deduplication callers retain their behavior; no second hashing/reading implementation, store schema or publication policy is introduced. All routing failures preserve version, receipt, session and workspace state, including timestamps.

Source credentials must be redacted at the actual access-log owner for success, invalid credentials, disabled Office, unsupported methods and peer denial, without modifying dispatch paths or disabling unrelated access logs. Callback rejection diagnostics name chat, session and reason without raw tokens, request bodies or exception messages; untrusted identity text must not forge log records.

Governing invariant: only verified, bound credentials can reach their immutable source bytes or callback admission, and authentication alone never confirms a saved document. Sibling surfaces are token/config producers, signed session URLs, the canonical store/blob verifier, guard/CORS/availability ordering, packaged Uvicorn logging, reload inventories and the unchanged gateway allowlist.

Required evidence: public HTTP tests cover the admission matrix, signed/unsigned field disagreement and no-create/no-mutation failures; existing store tests cover the reader return change. A real packaged two-worker process serves a bound version after workspace mutation and emits redacted access logs while ordinary access logs remain visible. No image build, real-editor acceptance, epoch transition, callback processing or deployment is claimed by this slice.

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

#### No-change publication boundary

Task 16.2 extends the existing guarded command reconciliation and status-4
receipt transaction. A nothing-new save with intent `publish` selects the
latest stored version under the canonical lock. If it is unpublished, its
completion commits a bound save obligation without adding a version or blob;
the existing publisher then owns the terminal outcome. Keep the save's
identity available until that completion, without consuming a newer allocation.
An already-published latest version needs no publication: saves of either
intent advance both sequence values monotonically and leave bytes/revision
unchanged. A persist-only save with an unpublished latest version advances only
the committed sequence and leaves no obligation.

Status 4 freezes the latest unpublished version in a final obligation in the
same update as its existing contentless receipt. It downloads nothing and adds
no version. Final receipt replay drives that persisted binding, not whichever
version happens to be latest at replay time. The contentless receipt retains
null hash/version fields; the journal supplies the publication version.
Completed replay performs no publication, allocation or revision change.

Equal-content callbacks retain the existing latest-version deduplication and
advance the published sequence when that selected version is already published.
Do not add a second counter or journal implementation. Reuse the existing
atomic completion, including baseline notice-cache invalidation, outcome table
and classified unresolved-publication handling; unexpected faults stay visible.

Governing invariant: completion/receipt and publication responsibility share
one durable successor, and each stale command result can affect only its own
still-owned allocation. Sibling surfaces are save admission/reconciliation,
status-4/final-receipt callbacks, equal-content persist, publisher completion,
startup/poll/request recovery and the public status projection. Preserve late
callback, closing, final-state and epoch guards. A repeated save request is a
new operation, not an idempotency-keyed retry.

Required evidence observes versions/blobs, receipt/journal, state/counters,
workspace bytes, baseline and broker revision across both routes, atomic
commit cuts and fresh-process recovery. No-change paths with published content
must demonstrate no publisher write or revision advance; persist-only paths
must demonstrate no deferred publication. Final missing-path policy remains
task 16.3, and the existing status-4 path needing no publication is unchanged.

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

Create/join admission is serialized under the same chat lock as the version transaction. Task 12.3 owns the existing-session behavior below; there is no separate repeated-create refusal once joining is available.

Sibling surfaces: store/version/receipt callers, safe-reader callers, router fallback precedence, module reload inventories in auth/outputs/preview tests, and package COPY discovery. Broker resolve, configuration, signing and epoch APIs remain unchanged. No gateway/deployment edits, artificial connection cap, force-save setting, source/callback serving or status endpoint belong to this slice.

Required evidence: all three formats and uppercase names; first/latest/older-content capture; independent token/ticket decoding; no secret in response bytes/headers; two-process same-document exclusion and unrelated-state preservation; ENOSPC before state replacement, failed mutator/signing, postreplace durability failure and bounded-reader boundary/growth regressions. Named refusals preserve existing state/blob/workspace bytes; regular refused files remain downloadable, whereas unsafe paths must never expose link targets.

Refusal byte-preservation covers Office records/blobs and workspace files; creating the existing `.lifecycle.lock` sentinel inside an already-present chat is permitted by the shared-lock primitive. The absent-chat no-directory guarantee remains unchanged.

Review focus: one state publication; no unsafe target reads; bounded input handling; complete signed/persisted agreement; unchanged shared-store semantics. Source tests and packaged HTTP smoke do not certify a real editor or deployment image.

#### Join, reopen and status boundary

Task 12.3 extends the existing session owner and router. A POST finding an open session returns 200 with its stable identity and `joined: true`, without creating a session, capturing workspace content, changing the baseline or advancing a version. A POST finding none uses the existing atomic creation path and returns 201. More than one persisted open session for one document is corrupt state, not a choice of whichever record was listed first.

Keep the synchronous FastAPI worker-thread entrypoint. Hold the canonical reentrant chat lock across the decision and its publication; bridge the existing async `lookup_key` with the repository's worker-thread `asyncio.run` pattern. Never hold this blocking lock across an `await` on the application event loop. The existing client's timeout bounds the per-chat wait; no retry, second client or optimistic two-phase protocol is added.

Read and validate the chat-local session state and current epoch before deciding its lifecycle. An epoch mismatch orphans an open session with `restore_epoch_changed` without a key lookup; final `closed`, `error` and `orphaned` records remain unchanged. Compare opaque epochs exactly, including absent marker versus empty token, and preserve the reader's explicit failure rather than treating it as absent.

With an unchanged epoch, `opening` joins without lookup. `editing`, `saving`, `closing`, and `conflict` without a final receipt require the existing command client's key lookup. `known` joins; `unreachable` returns 502 `documentserver_unavailable` with byte-identical persisted state. Final-callback evidence comes from this session's existing receipts with status 2, 3 or 4, not a new boolean flag. A `conflict` with a final receipt joins with `editor_config: null` and makes no DocumentServer request.

A request that determines its open session is orphaned durably records that transition before replacement admission. If the newest version is unpublished it returns 409 `unpublished_version`, retaining that version and adding no session/version/blob. The next request sees no open session and may create from workspace content. The refusal applies only to the request that itself orphaned the session, not to every document with unpublished history. If replacement validation, signing or storage subsequently fails, the old session remains orphaned; the new capture still satisfies the atomic creation invariant.

A normal join reuses document admission and returns a newly signed configuration without calling the capture/store-version path. Its source ticket names the document's newest persisted version under the held lock, never a new workspace capture. The pending-conflict/null-config branch needs no source ticket. Ticket minting adds a random `jti` in the canonical source-ticket signer so equal bindings at equal time still yield different tickets; lifetime, key derivation, signature algorithm, function signatures and the verifier's four-field result stay unchanged.

The status GET projects only `session_id`, `file_id`, `document_key`, `state`, `reason`, `save_seq`, `last_committed_seq`, `last_published_seq`, `workspace_changed` and `saved_as`. New sessions persist initial bookkeeping values `reason: null`, counters 0, `workspace_changed: false`, `saved_as: null`; records created before these fields existed project those same initial values without a rewrite solely to add defaults. Present malformed fields fail as `state_corrupt`, never coerce to defaults. Status calls no DocumentServer; open sessions receive the targeted change notice of D13, and its only lifecycle write is epoch orphaning. Unknown/malformed/foreign session ids return 404 `unknown_session` without foreign reads or directory creation.

Must preserve: guard/availability precedence, descriptor-safe document admission, refusal reasons, atomic version/document/session creation, immutable version semantics, historical key uniqueness and explicit corruption/durability errors. The store and command-client contracts do not change. Added imports participate in auth/outputs/preview reload inventories and existing package COPY discovery.

Required evidence: all five open states and three final states; equal/changed/unreadable epoch; known/unknown/unreachable keys; both conflict receipt variants; published/unpublished newest version; delayed and same-clock ticket refresh; two workers returning 201+200 with one identity; status from another worker; failed replacement preserving the durable orphan and no partial capture. Network failure, ordinary join and status preserve version/blob/workspace bytes.

Non-goals: workspace-change computation, save/close, sweep, journal driving, non-null saved-as production, source/callback serving, version listing/restore and browser prompts. There is no connection-count query or artificial twenty-session limit. Cross-review concentrates on transition precedence, thread/lock ownership, receipt evidence, exact ticket bindings and failure atomicity.

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

#### Save and close request boundary

Task 13.1 adds guarded POST save/close routes through the Office router. Invalid save JSON, a non-object body or an intent other than the exact strings `publish` and `persist` returns 422 `invalid_request` before state mutation. Authentication and availability still precede body handling. Unknown/malformed/foreign session ids return 404 `unknown_session`; save outside `editing` returns 409 `session_not_editing`, and close on a final session returns 409 `session_not_open`.

Governing invariant: each accepted allocation is durable and never reused; its eventual command result may reconcile only that operation, never erase a newer save, close, callback outcome or epoch orphan. Save has three boundaries: under the canonical lock validate epoch/state and publish the allocation; release the lock for `commands.forcesave`; reacquire it to interpret the latest state. Blocking store/lock work stays on a request worker, not the application event loop. Holding a chat lock while force-save can induce a callback is forbidden.

Allocation metadata is session-local: `save_intents[str(save_seq)]` records each save's `publish`/`persist` intent, `pending_save_seq` identifies the outstanding save command and `pending_close_seq` identifies a close allocation awaiting a final callback. Absent metadata means no prior allocation of that kind; malformed present metadata fails explicitly rather than resetting. Allocate from the persisted `save_seq + 1`, starting at 1; keep prior intents when a close increments the counter or a command fails. A durable allocation failure sends no command.

| Save outcome            | Response and request-owned state                                                                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted                | 202 `{session_id, save_seq, intent}`; `saving` remains until another owner completes it; no version, receipt or publish is produced here.                                                                                                                            |
| Nothing new             | 202 with the submitted allocation; retire its pending-save marker, advance `last_committed_seq` monotonically to at least that sequence, return its still-outstanding `saving` state to `editing`. Publishing and `last_published_seq` advancement remain task 16.2. |
| Rejected or unreachable | 502 `documentserver_unavailable`; retire its pending-save marker and return its still-outstanding `saving` state to `editing`; sequence and intent are retained, no version is stored.                                                                               |
| Unknown key             | 409 `session_not_editing`; retire its pending-save marker and orphan the still-owned open session with `editor_state_lost`, including a concurrent close; no version is stored.                                                                                      |

Those transitions describe an operation that is still outstanding. Reconciliation re-reads the session and matches its key and pending save allocation; a callback-completed or superseded operation must not change the record. Final sessions, already epoch-orphaned sessions and conflicts holding a final receipt remain unchanged. Ordinary completion/failure changes lifecycle state only while the session is still `saving` for that allocation: a concurrent close keeps its pending close allocation, `closing` state and earlier save intent, and a live conflict keeps its state/reason. Nothing-new may retire its own pending save and advance its committed sequence without changing that newer lifecycle state. Unknown-key is a liveness result, not an ordinary failure: while that save still owns its pending allocation and the session remains open, the governing orphan requirement takes precedence over `closing` or live `conflict`; allocation history is retained. Command acceptance itself requires no second state write.

Close records intent only and never calls force-save. An `opening` close allocates the next sequence and ends at once as `closed`, without a pending final-callback obligation. `editing`/`saving` close checks the key using the existing bounded client: unknown key orphans and returns 409; known or unavailable records the close and returns 202 `closing`. It preserves any outstanding save allocation. The read-only lookup may use the existing worker-thread serialized lookup pattern.

A repeated `closing` request returns the existing `pending_close_seq` without allocation or lookup. A live `conflict` (no final receipt) stays `conflict`, with reason unchanged, and records or reuses its pending close allocation without a force-save. A `conflict` with a final receipt (status 2/3/4) returns 202 with its existing sequence and unchanged state/reason, allocating nothing. Final-callback consumption and status-1 invalidation of a close allocation remain task 14.2; a test may seed the resulting voided allocation to prove the next close takes a higher sequence.

Epoch validation precedes save/close admission. A differing epoch durably orphans an open session with `restore_epoch_changed`, sends no command and returns the route's ordinary orphan refusal. Final-state comparisons preserve their records. Ordinary validation/auth/state refusals allocate nothing; a command failure after durable admission does not roll the sequence back. Existing corruption and postreplace durability distinctions remain explicit, with no command issued after a failed preparation commit.

Create and join configurations explicitly include `editorConfig.customization.forcesave: false` inside the signed payload. This uses the bounded [B1 DOCX observation](../../../docs/evidence/issue-119/2026-10-03-b1.md#13-editor-native-save-with-user-force-save-disabled); it does not certify every future callback timing. There is no broker auto-save timer, count query or artificial capacity limit.

Sibling surfaces: the session validator/projection and epoch/receipt helpers, canonical store, command outcomes and JWT userdata, source-ticket/config signing, router fallback, and all three app-reload inventories. Store and command-client contracts stay unchanged. Save and close handlers never read or write workspace content, blobs, receipts or journal entries; later owners perform persistence/publication.

Required evidence: both intents and all command outcomes; invalid-body and every refused-state case; save/save and close/close cross-process races; callback-side lock acquisition before a command response; a held command overlapping close, completed callback or newer save; unchanged workspaces/history on every request; sequence monotonicity after failure and voided close; epoch and owner-guard denials; independent signed force-save/config checks; retained beyond-twenty admission. No callback handler, publish, timeout sweep or auto-save timer is implemented for these proofs.

### D10. Persist pipeline

Validate the callback (JWT, session, `save_seq`) → download from the configured DocumentServer server-to-server origin only, validating every redirect hop against it, with timeout and size limit → check size, type and OOXML container structure → stage and fsync → store the version blob and the save receipt under the lock. The callback is acknowledged as successful only after the version is durable; anything else returns an error so DocumentServer retries.

DocumentServer may build the callback's download address from the browser-facing origin it was reached on, which the broker cannot fetch (that listener needs a WebUI session). The broker therefore accepts a download address whose origin is exactly the configured browser-facing DocumentServer origin or the server-to-server origin, takes only its path and query, and fetches that path from the server-to-server origin. Any other origin is rejected without an outbound request. B1 records which origin each callback status carries.

For a callback whose intent is to publish, the version, the receipt and the publish obligation (D11) are written in one state update, so a crash after the acknowledgement cannot leave a stored version that nothing will publish.

#### Callback persistence slice boundary

Tasks 14.2/14.3 implement D9 outcomes and persist only. Status 2 stores a
`close` version and receipt, preserving lifecycle state; status 6 stores `save`
or `autosave` according to the issued intent and returns only its outstanding
`saving` allocation to `editing`. New versions remain unpublished. Status 4
adds no version and closes when the latest version is already published;
otherwise it preserves state. Publish, journal and publish-outcome states belong
to task 16.1; unpublished status-4 completion belongs to task 16.2.

Governing invariant: success means one durable receipt and its version, when
content exists; retries never regress sequences, history, workspace bytes or
listing revision. JWT verification and session-key binding precede processing.
A validly signed unknown session returns 404; a known session with a different
key remains 401. Epoch mismatch first orphans an open session and refuses that
delivery, before any receipt replay. Otherwise final receipts replay without
download; status-6 replay compares downloaded bytes, not URL identity. Status
mismatch is stale without fetching; status 7 has no content hash.

The entire bounded read/download/commit transaction runs on the existing worker
thread under the canonical no-create chat lock. No force-save command runs here;
download GETs do not request a callback. This trades same-chat latency for one
serialized state snapshot, while the ASGI loop and other chats stay responsive.
Use the existing OOXML validator, broker size limit, version staging and
`store_version(receipt=..., mutate_state=...)`. No-content outcomes use one
`OfficeStore.update` containing the existing receipt insertion and state change.
Keep postreplace durability errors distinct: never delete a committed blob or
claim acknowledgement when the state-directory flush failed.
Before any receipt-based success, open the existing Office directory through
the unchanged no-create descriptor opener and fsync that directory under the
chat lock, closing every descriptor. This completes a prior postreplace state
sync failure without rewriting state or adding a version/receipt/sequence.
The blob and its directory were flushed before state replacement. A failed
replay barrier remains non-200; never use a no-op state update or a process-local
failure marker. A postreplace failure retains visible matching records, unlike
a precommit failure, and must not be followed by an error-state rewrite.

Final sequence allocation and receipt share the same commit. Status 1 voids
only the pending close allocation, never reuses its number, and keeps the key.
Retain issued intents after failed deliveries; retire only the matching pending
save on an outcome or recoverable download/storage failure. Late saves leave
newer pending saves and `closing`/`conflict` state and reason intact. Committed
and already-published-equal-content counters advance monotonically, without
marking a new version published or performing workspace IO.

Download accepts only HTTP(S) exact parsed scheme/host/effective-port origins;
reject malformed URLs and credentials. Rebuild only path/query on the internal
origin, with no callback authorization header, cookies or environment proxy.
Validate every redirect before requesting it; bound hops, total time and actual
streamed bytes. Use the existing 10-second HTTP timeout convention and a finite
five-hop bound; these bound lock occupancy, not editor-close latency.

Sibling surfaces: save/close allocation and reconciliation, timeout sweep,
epoch reader, session projection, receipt/version store, OOXML validator,
outputs size/index and app module inventories. Preserve their APIs and formats.
Required evidence: all status/order/failure cases through the real callback
route, signed-field authority, confined fake-server traffic, concurrent repeats,
same-loop health progress, crash before store, fresh-process reads after ack,
and exact no-publish conservation. No image or LAN verification is claimed.

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

The final-callback parent-symlink exception in D13 takes precedence over step 4's generic conflict classification. It never permits reading through a link or writing through an unsafe workspace root.

A rename that no listing has recorded yet is not followed: the file is missing at the indexed path and the publish is a conflict, which is safe. The WebUI sidebar reconciles on every listing poll, so the index is normally current.

Target window under pause: below 1 second. The [user-approved timing ruling](https://github.com/DankerMu/open-webui/issues/136#issuecomment-5997477072) defines five seconds as a safe-boundary publication budget, not a hard wall-clock unpause guarantee. When elapsed monotonic time is at least five seconds at a safe boundary, start no further publication mutation; let an in-flight indivisible operation settle before cleanup. Before workspace replacement, timeout preserves the prior file; after replacement, incomplete registration/completion retains the journal instead of claiming rollback. A visible completed successor is never rewritten as a fabricated timeout failure. Slow engine/filesystem calls can extend actual pause duration. Stopped or externally paused sandboxes do not acquire this attempt's pause budget; `launch` still waits for the shared lock.

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

#### History-restore transaction boundary

Task 17.2's restore slice uses the existing request router, version store,
publisher and reopen checks. The [approved scope and failure ruling](https://github.com/DankerMu/open-webui/issues/143#issuecomment-6050261065)
permits minimal extensions of those owners and extraction of the unchanged
reopen decision for create and restore. There is no second publisher, fake edit
session, route-owned fence or parallel version constructor.

Validate the body and active file/version identity before mutating session
state. A non-integer number, including a boolean, is 422 `invalid_request`;
an integer that names no version is 404 `unknown_version`. Reuse safe,
noncreating root admission and one canonical chat lock. Reopen checks preserve
epoch precedence, opening/final-receipt exclusions, explicit key unavailability
and recovery-before-orphan. Reselect the requested document after recovery.
Any remaining open session refuses with `session_open`; restore creates none.

Acceptance binds the requested immutable version and a sessionless restore
obligation durably. The canonical publisher owns every later preparation,
fence, capture, replacement, registration and completion, including recovery
after a crash immediately following acceptance. Under writer exclusion, capture
current workspace content only if its hash is absent from that document's
history, then append a new `restore` record with the requested version as parent.
History restore always creates a new record, even for the latest equal hash;
blob sharing and callback/resolve latest-hash deduplication remain unchanged.
Do not repoint, renumber or mark an older selected record as this new restore.

Pause failure has one explicit timing exception: retain a new unpublished
restore record referring to the already stored requested content, without
reading/capturing or modifying the workspace. Successful capture and restore
remain in one fence. Missing/unsafe-path admission adds no version and never
recreates a path. Other terminal publication failures retain the prepared
restore record unpublished; interrupted/uncertain publication retains its
obligation rather than fabricating completion or rolling back visible state.

Without a new workspace change, recovery reuses the accepted preparation and
owned replacement/registration instead of duplicating records or publication.
If a crash released the writer and new Agent content appears, preserve it before
replacing it and leave the requested restored content as the latest version.
Success atomically marks the restored record published, updates the document
pointer and retires the journal; session histories/receipts remain unchanged
except the canonical reopen transition that admitted the request.

Evidence covers all ten restore criteria, equal-latest forced append, safe-read
refusals, real pause ownership, immutable history, low space, sibling callback/
resolve behavior and fresh-process acceptance/capture/replace/register recovery.
Rollback closes new Office requests and drains accepted restore obligations
before downgrading the reader. Gateway, UI, pruning, dependencies and deployment
remain outside this slice.

#### Callback publication boundary

Task 16.1 uses the existing version transaction's state mutator to bind
`file_id`, version, `session_id`, `save_seq` and requester (`save` or `final`)
in the journal with the callback receipt. A persist-only callback adds no
obligation. The publisher runs only after that commit is durable; terminal
conflict or failure cannot turn the persisted callback into an error answer.
An interrupted publication retains its obligation and is not a terminal failure.

Receipt replay drives a surviving obligation only after the existing replay
checks pass: final receipts require no download; forcesave receipts require the
same status and content hash. With no matching obligation, replay changes no
workspace or revision. Existing publisher ordering remains authoritative.

The publisher's completion update owns lifecycle state, reason, baseline,
publication metadata, monotonic `last_published_seq` and journal removal.
Outstanding-save identity must survive until that update; a late result cannot
consume a newer allocation. A status-6 result preserves `closing` and `conflict`.
Recovery uses that same completion path, not a second state transition.

Every request-owned orphan decision drives the session's obligation first and
re-reads its resulting state. Final `closed`/`error` and a conflict with a final
receipt remain final. A create request that actually orphans a session and
finds its newest version unpublished returns `unpublished_version` without
creating a session or workspace version.

Epoch admission still precedes callback receipt processing. Its orphan decision
drives only obligations already stored before this request; it does not download,
persist or publish the rejected callback's supplied content. Thus an old-epoch
request may recover prior durable content before refusing the callback, even
when that envelope would fail the later status/hash rule. Current-epoch replay
rejected by that rule cannot drive an obligation. With no prior obligation,
the old-epoch callback preserves the no-publication restore behavior.

The sweep's ordinary exclusion of conflict sessions remains. The specific
surviving-entry rule also covers a session eligible for the sweep whose recovered
save reaches conflict: apply its due unknown-key orphan decision to that result.
Do not query unrelated pre-existing conflicts, relax liveness intervals or orphan
a conflict completed by a final callback. Unresolved recovery prevents orphaning.

Sibling surfaces: callback new-content and receipt paths, version mutator,
publisher completion/recovery, create/status/save reconciliation/close epoch and
unknown-key paths, startup and idle sweep. Required evidence observes actual
workspace bytes, immutable versions, receipts, journal, broker revision and
session state across route execution and fresh-process recovery.
No-change saves/status 4 and unattended final missing-path policy remain separate
slices; no new background worker, callback authentication or fence implementation.

#### Stopped-sandbox publication boundary

Tasks 15.1 and 15.4 consume a persisted journal obligation and record the fence decision; they do not wire callbacks, routes, recovery or the running/paused sandbox path. The publish module owns the entry validator and outcome representation. An entry identifies `file_id`, positive version number, optional `session_id`, `save_seq` and requester (`save`, `final`, `resolve`, `restore`); its map key identifies the obligation. Validate document/version/session binding before workspace access. A bound session supplies `baseline_sha256`; a sessionless obligation uses the document's recorded published hash. The operation resolves its own path rather than accepting a caller-supplied destination.

Hold the existing canonical chat lock from reading the obligation through the last durable completion update. Under it, positively observe an absent sandbox or an established stopped state. Running, paused, transitional or unknown state is an explicit internal refusal with the obligation and files unchanged; engine lookup failure is not absence. No engine lifecycle mutation, new HTTP response or provisional pause implementation belongs to this slice.

Before workspace access, durably record the resolved relative `target_path` and a dot-prefixed `temporary_name` in the obligation. Reuse the existing safe reader and immutable version reader. Initial missing paths, including an unrecorded rename, are `path_missing`; an initial unsafe read or hash mismatch is `baseline_mismatch`. Classify missing-path failures from the safe operation's cause, never by following a link in a fallback read. Every publish hashes, regardless of size or mtime.

Bind temporary creation and replacement to no-follow directory descriptors. Create the temporary exclusively, flush its contents, and revalidate every directory component and its identity before the descriptor-relative replace. A path changed after the hash step is `unsafe_path`; remove only the temporary inode this attempt owns, even if its original parent was renamed. A pre-existing temporary-name file or symlink is never truncated, followed or removed. Flush the replaced directory, then call the existing host-write registration without reconciliation or scanning sibling files.

A successful final Office update marks the selected version published, updates the document's published version/hash and the bound session's baseline, and removes the obligation together. Expected pre-replace conflict/failure outcomes remove the obligation in one update while retaining predecessor publication metadata and all stored content. Return the outcome and reason to the caller; do not introduce an outcome-history collection. Task 16.1 adds lifecycle mapping and `last_published_seq` to this same completion update; neither changes here.

An interrupted IO transaction is not a completed failed outcome. Before replacement, clean owned temporary content and retain the obligation when completion cannot be recorded. After workspace replacement, registration or final-state failure must not claim rollback, delete version content or discard the recovery obligation. Preserve the store's postreplace durability semantics: a visible successor is not rewritten as a fabricated failure. Driving retained obligations belongs to task 15.3. No catch-all may turn an incomplete durable transaction into success.

Governing invariant: a successful publish is complete workspace bytes, one registered broker revision and one consistent Office successor under the shared lock; a refused publish neither follows an unsafe path nor overwrites mismatched workspace content. Sibling surfaces are safe reads, immutable blobs, journal bindings, document publication metadata, session baselines, broker resolution/registration/listing and the real `launch_sandbox` lock consumer. The decision record states the full two-state design and explicitly separates this implemented stopped path from later pause/recovery integration.

#### Running-sandbox fence boundary

Task 15.2 generalizes the stopped-only entrypoint as `office.publish.publish(chat_id, journal_id)`; every caller migrates without an alias, and comparison/replacement/registration has one implementation. The stopped slice's identity, bounded-read, permissions and partial-commit guarantees remain. Running and externally paused states are admitted through the fence rules below; transitional/unknown engine states remain explicit refusals. No callback, route, startup recovery, idle-poll recovery or lifecycle outcome mapping is added.

Resolve the indexed path and its expected failures before any pause. Persist the obligation's target/temp metadata before requesting a fence. An existing `fence.json` belongs to recovery and is never overwritten or treated as permission to resume a manually paused sandbox. For a running sandbox, persist a complete private no-follow marker with `schema_version: 1`, the observed `container_id` and `pause_started_at` wall time before issuing pause. An exclusive staged file and no-clobber hard link install complete marker bytes; marker and control-directory identities are checked before pause. Marker creation failure cannot proceed to pause or workspace mutation. Runtime duration uses a monotonic clock; persisted wall time is for later cross-process recovery.

Only a fresh engine observation can establish the writer barrier. A successful pause call alone is insufficient; the same owned container must be observed paused before comparing/replacing. A pause error may occur after the engine actually paused, so failure cleanup must inspect and release the owned container too. A retention stop removes writers, never triggers start, and is not an error after the fence has been established. An initially paused sandbox without a marker is externally owned: no pause, no unpause, no marker claim, and its state is preserved.

Check the five-second budget before and after potentially blocking publication phases and before irreversible transitions, including comparison, staging, replacement and broker registration. Expiry before replacement completes `failed / publish_timeout` without workspace change. Expiry after a visible replacement but before a consistent completion returns the nonterminal `interrupted / publish_timeout` result while retaining the obligation and whole workspace successor for recovery; it is not routed through terminal cleanup that would discard the journal. Never resume sandbox writers while a detached worker can still mutate the workspace. A timer/future cancellation does not cancel a synchronous engine or filesystem operation.

The fenced pipeline's established result is preserved across release handling: slow or failed unpause does not retroactively turn a published/conflict result into a timeout. Release and final outcome bookkeeping may finish after the budget; no further workspace publication phase starts after observed expiry. Existing state durability exceptions retain their visible-successor semantics. This is the user's safe-boundary timing policy, not a guarantee that actual pause lasts at most five seconds.

On every success, refusal, timeout or interruption, attempt release only for the fence owned by this attempt and the same container identity. Positive observation of unpaused, stopped or absent permits removal of the owned marker; unknown state or failed unpause leaves it for task 15.3. Do not target a replacement container found by name. Marker IO uses the existing safe Office directory primitives, private file modes and durability barriers, with owned-inode cleanup. Cleanup errors are reported without masking the primary result or exception. Emit one paused-window duration record for each attempted owned pause, identifying whether release was observed; elapsed time with a retained marker is not a claim that the sandbox resumed.

The monotonic publication budget includes fence preparation. `paused_duration_seconds` is an upper-bound interval from pause request through release handling, identified by `duration_basis`; `publication_elapsed_seconds` reports the broader attempt. `release_observed`, `marker_retained` and `cleanup_failed` distinguish release observation, visible marker presence and cleanup durability. Neither elapsed interval claims precise engine-paused time.

Required evidence distinguishes phase-clock behavior from wall-clock behavior: exact-five-second boundaries on both sides of replacement/registration, a genuinely delayed blocking dependency, primary-result preservation, marker write/remove faults, pause-success-despite-error, unpause/observation uncertainty, external pause, retention stop and container identity replacement. A process smoke uses a real filesystem writer governed by fake-engine pause state and observes complete publication or retained conflict bytes. Real-engine/image acceptance and recovery execution remain separate.

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

`fence.json` records when the pause began. OCU's startup sweep and the existing idle-reclamation poll take the chat lock and, for a marker older than five seconds, attempt to unpause the owned sandbox and remove the marker only after observing it not paused. Recovery cannot steal the fence from a live publisher that still owns the lock; slow engine/filesystem operations may delay lock acquisition or release under the user-approved safe-boundary policy. Once the lock is available and the engine accepts unpause, recovery clears a stale pause on the next poll. A paused sandbox without a marker was not paused by a publish and is left alone.

The same poll sweeps Office sessions, so that no state is left without an exit:

- A session in `opening`, `editing`, `saving` or `closing` with no callback and no request for longer than a configured liveness interval (longer than the ticket lifetime) is checked against DocumentServer. If DocumentServer no longer knows its key the session becomes `orphaned`. If DocumentServer cannot be reached nothing changes.
- A session in `saving` for longer than a configured save timeout whose key DocumentServer still knows returns to `editing` with reason `save_timeout`.
- A journal entry left by a crash is driven again (D11), before the chat's sessions are checked. The same order holds on a request: an entry of a session that is about to become `orphaned` is driven to its outcome first, so an orphaned session never holds one and an entry is removed only by its outcome. The orphaning then applies to the state the outcome left. The key check concerns every session whose editor is still expected: `editing`, `saving`, `closing`, and `conflict` without the receipt of a final callback. Such a session becomes `orphaned`; its conflicting content stays stored and unpublished and is offered like any other unpublished content. A session the outcome put in `closed` or `error`, or in `conflict` with the receipt of a final callback (a pending conflict, whose editor has ended), stays there. Versions an orphaned session stored without publishing are offered at the next open (D13).

The retention guard, the cleanup cron and recovery do not check a lease. The retention guard only stops containers, which removes writers and cannot corrupt a replace; the following `unpause` finds no running sandbox and the marker is removed. Cold backup requires every writer including OCU to be stopped, so no publish is in flight. The upstream cleanup cron is disabled in the overlay.

#### Session sweep boundary

Task 13.3 adds `office/sweep.py` to the existing `_idle_reaper` tick, off the application event loop. It runs independently of sandbox candidate discovery and failures; neither startup grace nor sandbox stop decisions change. Disabled Office returns before Office discovery or DocumentServer contact. No second timer or configuration setting is added.

Enumerate canonical chat directories under the existing data root and use the canonical store's no-follow checks to discover Office state. Do not create missing chat/Office state, follow linked control directories, enumerate workspace files or require `.meta.json`/`.idle.json`. Isolate a corrupt/unreadable chat so later chats and sandbox reclamation still run, reporting errors without session keys or credentials.

Sessions persist `last_activity_at` and `saving_started_at` as finite, nonnegative Unix seconds. Creation initializes activity; successful join, status, save and close requests refresh it for eligible live records. Request refusal, unknown/foreign identity and final records retain their existing no-mutation guarantees. Ended conflicts receive no activity refresh; their existing D13 status notice still applies. The save allocation atomically sets both times when entering `saving`; status or join never moves the save-start deadline. Callback activity is a later callback-handler responsibility, not a placeholder route in this slice. An absent clock supplies no expiry evidence and disables only its corresponding predicate; a present numeric zero is a valid Unix timestamp. Malformed present values fail explicitly rather than resetting age. The sweep itself never refreshes activity. Historical records lacking both clocks cannot expire automatically until a legitimate request establishes activity; this slice does not infer activity from filesystem metadata or introduce a migration.

For `opening`, `editing`, `saving` and `closing`, check the key when `now - last_activity_at` is strictly greater than the liveness interval, or when `saving` and `now - saving_started_at` is strictly greater than the save timeout. An exact boundary is not expired; a backward clock does not expire a future timestamp. One bounded existing key lookup serves both rules. Unknown key sets `orphaned` / `editor_state_lost`; known key changes only an overdue `saving` session to `editing` / `save_timeout`; unavailable changes nothing. `conflict` and final states are never swept.

The synchronous worker holds the canonical chat lock across read, eligibility, bounded lookup and targeted store update, following the existing join/close lookup pattern. Preserve baseline, notice hints, all sequences and pending allocations, save intents, documents, receipts, journal and version/workspace bytes. In particular a timed-out save retains its allocation for a late callback; accepting a subsequent save allocates a new sequence. No-op outcomes do not rewrite state. A second worker reads the first worker's committed transition; it cannot publish a stale snapshot.

Activity bookkeeping is separate from D13 notice bookkeeping: a successful live status may update activity even when notice metadata is unchanged, but the cache hit must still read no content. Existing exact-state tests must continue to check every non-activity field, not discard state-conservation assertions.

Required evidence: poll-driven known/unknown/unavailable matrix, all excluded states unchanged, strict time boundaries, recent requests preventing liveness expiry without postponing a save timeout, pending/history conservation and a new save after timeout; Office-only and unsafe/missing directory discovery; errors not suppressing later work; disabled poll preserving sandbox behavior; and a real two-process lock barrier showing one durable transition with an unrelated committed update preserved. Runtime smoke launches the packaged two-worker command and observes the running poll; unit tests supply clock control and direct IO traps.

Journal replay before orphaning and stale-fence recovery belong to tasks 15.3/16.1; do not add stubs for them. The existing package-directory COPY owns new Office modules, while all app-reload inventories must include them.

#### Publish recovery slice boundary

Task 15.3 adds one recovery owner for persisted fences and journal entries, invoked at startup, by the existing idle poll before each chat's session read, and before another publish for that chat. Reuse the Office-state enumeration from task 13.3, including chats without `.meta.json` or `.idle.json`; no new scheduler or sandbox-discovery dependency. Preserve disabled-Office no-discovery behavior, canonical non-symlink chat identity, no recreation of deleted state and per-chat failure isolation. Session timeout/key policy remains unchanged.

Recovery takes the canonical chat lock before inspecting or changing ownership. Validate the private marker's schema, recorded container identity and finite wall-clock timestamp through no-follow Office descriptors. A marker is stale only when its age is strictly greater than five seconds; the live publisher's `>= 5` monotonic budget is a different boundary. Young or malformed markers do not grant permission to resume writers. A live publisher retains the lock, so recovery cannot release its fence even when elapsed wall time exceeds five seconds.

Inspect and, if necessary, unpause the recorded original container rather than looking up a replacement by chat name. Remove only the owned marker after positive unpaused/stopped/absent observation and directory durability handling. Unknown state or unsuccessful release retains recovery responsibility; an external pause without a marker stays external. A stopped or absent sandbox is not restarted. Marker recovery and journal recovery share the existing safe file and engine-observation conventions.

Validate every obligation's document/version/session binding and any prepared target/temp fields. Keep the obligation present throughout replay; do not delete and recreate it to bypass prepared-entry refusal. Cleanup is confined to the recorded publication temporary name under its validated parent, but a valid name is not ownership evidence: exclusive creation can have failed against a foreign regular file or symlink after that name was journaled. Missing temporary content is normal. Present content is removable only when surviving durable ownership evidence proves it belongs to that obligation; otherwise preserve both content and journal and block dependent publication/session sweeping for that chat. Later chats continue.

The user [approved the necessary staging-protocol prerequisite inside issue #137](https://github.com/DankerMu/open-webui/issues/137#issuecomment-6007445205), preserving automatic recovery rather than accepting an ordinary crash window requiring manual intervention. Establish a private, recovery-owned staging anchor and durable journal binding before exposing its workspace temporary; retain evidence that lets a fresh process compare the shared entry with the owned anchor. No-clobber exposure preserves a pre-existing shared file or symlink. A matching live anchor prevents inode reuse from turning a substituted entry into a false match. Name syntax, content equality, mtime or an inode number recorded after shared-file creation alone do not establish this authority.

The private anchor has its own ownership and crash protocol: a collision or substituted private entry is never adopted merely because its name matches. Crashes around anchor creation, durability and journal binding must leave the original obligation automatically driveable; harmless private leftovers cannot become a new undecided publication or a reason to delete unrelated content. Retain the anchor through the shared temporary's interruption-sensitive lifetime, and order final completion and anchor cleanup so a second crash cannot lose deletion authority. A currently absent shared temporary needs no deletion authority and does not prevent recovery. Genuinely foreign, corrupted or unprovable pre-existing ownership remains fail-closed; every ordinary crash generated by the new legal protocol must converge.

The implemented journal `staging` binding has integer `schema_version: 1`, `anchor_name` equal to `temporary_name`, a distinct `.publish-owner.<32 hex>` `witness_name`, integer `device`/`inode` and boolean `retired`. Allocate empty private anchor/witness links and persist the binding before writing version bytes. During cleanup, hold a verified open inode pin, establish and sync shared absence, durably set `retired: true`, then unlink the verified private names. An uncertain retirement commit is reread without destructive cleanup. Fresh recovery never adopts or deletes retired names. Crashes before binding or after retirement may leave harmless private names; automatic obligation convergence does not promise a garbage collector or complete private-directory cleanup. Immutable version blobs never share the mutable staging inode.

Office private storage and outputs are sibling trees under the chat root, but a common pathname prefix does not prove hard-link feasibility. Check filesystem/capability boundaries explicitly before shared exposure, refuse unsupported or cross-device linking without altering foreign content, and add no silent copy fallback. Preserve the existing single publisher, bounded reads, target/ancestor validation, workspace permissions and atomic replacement; the staging prerequisite is the sole approved extension into tasks 15.1/15.2.

Prepared recovery establishes and freshly observes one writer fence before inspecting or removing the recorded shared temporary, and reuses it through replay and final cleanup. The host chat lock alone does not stop a sandbox process from substituting that name between inspection and unlink. Failed or uncertain recovery pause preserves the original journal and staging. For a missing recorded parent, descriptor-held ancestor revalidation plus inspection of the exact missing component must prove absence before private retirement; generic or contradictory `ENOENT`, permission failure or a substituted ancestor is not proof. Confirmed absence then reaches the existing `path_missing` outcome without recreating directories.

Under the appropriate writer fence, compare the current safe workspace bytes with the verified immutable version. If they already match, finish targeted registration and the published Office successor without replacing or rewriting the workspace file. Otherwise run the existing publication transaction again from persisted-index path resolution and baseline comparison. A crash after registration may cause recovery to register again: the existing broker operation advances the revision each time, so recovery promises a consistent nonregressing revision, not exactly-once registration across crashes. Once the journal completes, repeating recovery changes neither revision nor bytes.

Drive surviving obligations before a newly requested publish and re-read the resulting baseline. Same-document versions require deterministic dependency order rather than persisted object-key order. Separate orchestration from the one internal publication transaction so recovery cannot recursively invoke itself or introduce a second publisher. Pre-replace failure, postreplace interruption and visible-successor durability retain D11's conservation rules; an interrupted result is not a reason to discard the journal.

The poll reads sessions only after that chat's recovery has established outcomes. An unresolved obligation cannot be followed by a key lookup or orphan transition for that chat. This slice preserves the current final Office publication metadata update; callback-duplicate/request-side orphan triggers, outcome-to-session mapping and `last_published_seq` remain task 16.1. Resolve/restore result semantics and backup waiting remain their later tasks.

`recover_publications(chat_id, now=None)` is the no-create, lock-held recovery entrypoint. `sweep_office_publications(now=None)` reuses Office discovery at startup after the idle grace sweep; `sweep_office_sessions(now=None)` recovers each chat before its session read. Public `publish(chat_id, journal_id)` drives unrelated and older same-document survivors first, preserves the requested entry's own result, and processes newer same-document survivors in dependency order afterward. The internal transaction engine remains single.

Requested-result preservation is phase-specific: a prerequisite refusal still blocks the request, but after its transaction returns, an expected later `RecoveryRequiredError` or successor interruption returns the already-established requested result and retains later responsibility. This includes a marker retained by failed requested release and the post-successor fence check. Normal admissible successors still run. Unexpected IO, durability, corruption and programming failures are not hidden by this rule; `recover_publications` and the poll continue to refuse unresolved recovery before session work.

The new before-any-publish contract supersedes fixtures that seeded invalid inert sibling journal records solely to test collection conservation. Replace those records with admissible recovery fixtures or explicit malformed-obligation refusal tests; retain all unrelated session/receipt/document and byte/path assertions. Do not add a production exception for test records or silently drop prepared-state coverage.

Required evidence: crash points after preparation, marker installation, pause, staging, replacement, registration, release and final-state persistence; never-started entries; no-second-replace completion; baseline conflict; old-before-new ordering; Office-only chat discovery; strict marker-age boundaries; failed-once unpause; corrupt/young/replaced markers and containers; external pause; per-chat isolation; disabled poll; and recovery-before-session-read. Actual killed-process/fresh-process smoke and concurrent-worker lock evidence supplement deterministic fault injection. Real-engine/image/LAN and power-loss certification remain outside this source slice.

### D13. Conflicts, content waiting to be published, and the change notice

The user's content is always stored as a version before a conflict is reported. `POST .../resolve` then publishes the session's latest stored version, which may be newer than the one that first met the conflict, and accepts:

- `save_as` (default): publish to a new, deduplicated file name next to the original, claimed without replacing as in D3; when the original directory is gone or is not safe (it or a parent is a symlink), the new file goes to the workspace root instead, so nothing is written through a link. The new file is a new document whose first version has source `conflict`; the session continues on it.
- `overwrite`: store the current workspace content as a version (source `workspace`), then publish over it. The UI asks for a second confirmation. It is refused with `unsafe_path` when the file fails the safe read.

When the original path no longer exists only `save_as` is accepted; a deleted path is never recreated under its old name. When the workspace files directory itself is gone, neither action can place a file: the resolve is refused with `workspace_missing` and the session becomes `error` with that reason, the version kept, as at an unattended close. Resolving a conflict whose editor has already ended closes that session; editing again is an ordinary new session on whichever file the user opens.

Nobody is present when the publish at close meets a conflict, so the content must come back to the user without an action at that moment (user decision):

- **The file still exists but changed** (`baseline_mismatch`): the conflict is kept on the document and the conflict dialog is shown the next time that file is opened.
- **The file is gone** (`path_missing`): there is no entry to open, and `save_as` is the only action the rules allow anyway. The broker performs it at once: the version is published as a new file under a deduplicated name and the session is `closed`. The new file appears in the Files listing. If the workspace files directory itself no longer exists, nothing is created; the session is `error` with reason `workspace_missing` and the version is kept.
- **An original parent below the workspace root is a symlink**: under the [user ruling](https://github.com/DankerMu/open-webui/issues/107#issuecomment-6017088624), the final callback automatically saves a new copy in the safe workspace root, even if the persisted index still contains the original identity. This does not follow the link to test the leaf. A symlink at the leaf itself still yields a pending conflict; ordinary saves retain step 4's generic rule.
- **The publish failed, or the session was orphaned with auto-saved content** (DocumentServer restarted): the document's newest version is unpublished. When a file is opened for editing and its newest version is unpublished while no session is open, the UI offers to restore that content or to start from the current file. Restoring uses the restore route; starting from the current file leaves the unpublished versions in history, and the new session's `workspace` version becomes the newest one, so the offer is not repeated. This is what makes the 5-minute loss bound hold in practice.

  After a DocumentServer restart the old session is still stored as `editing` until something checks its key, so the versions read reports it as open and no offer is made. The create request is where the key is checked (D9), and it is therefore where the offer is guaranteed: a create that orphans the session while the newest version is unpublished is refused with `unpublished_version`, the host page reports the refusal, and the parent runs the open check again, which now finds no open session and makes the offer. Restore makes the same key check before it refuses with `session_open`, so history can restore the content without opening the editor first. The versions read itself never contacts DocumentServer; it applies the restore-epoch check, which is a local file read.

#### Version-listing boundary

Task 17.2's listing slice adds only the authenticated GET. Use the guard's
canonical chat identity and the outputs broker's active file-id lookup; do not
reconcile, hash workspace bytes or create Office history for an empty document.
An active non-Office workspace file also has an empty history, not a type error.
Unknown, malformed, tombstoned and other-chat identities reveal no history.

Hold the existing chat lock across identity validation, state read, epoch handling
and response projection. Reuse the version validator, published pointer and open
session/final receipt owners. Return only the specified public fields, never
document keys, receipt bodies, paths to private storage or source tickets.
Published flags are historical; the currently published number comes from the
document pointer, not from the highest true flag. No pagination or new limit is
introduced; existing store bounds apply.

The [approved priority](https://github.com/DankerMu/open-webui/issues/142#issuecomment-6048481919)
permits already accepted publication recovery before epoch orphaning. It creates
no new intent and contacts no DocumentServer. Reuse the canonical recovery and
orphan owners, including final-outcome protection; reread the requested identity
after recovery because save-as may move its session. Unresolved recovery returns
503 `publish_pending` with its responsibility intact. Ordinary same-epoch reads
do not drive unrelated obligations, refresh activity or perform workspace notice
checks. Corrupt state, unreadable epoch and durability failures remain explicit.

Evidence covers ordered history/flags, empty and rejected identities, live and
ended conflicts, orphaned unpublished content, forgotten-key zero-contact,
changed/unchanged/unreadable epochs, final states and accepted save/resolve/final
recovery. Real HTTP reads observe persisted state and workspace conservation,
then a killed-worker obligation and changed epoch demonstrate the narrow recovery
exception. Sibling status/create/callback/sweep/publication contracts stay intact.
Restore, gateway, UI, key lookup, dependency and deployment changes are non-goals.

The guard that follows a session after its frame is gone (D15) tells the user how the close ended: saved, saved as a new file with its name, conflict waiting at the next open, or failed. The session status carries `saved_as`, the `file_id` and path of the new document a `save_as` created for the session (manual or automatic), or null.

While a session is open, `GET .../sessions/{session}` checks the one file being edited: `stat` first, hash only if size or mtime changed since the last check, and reports `workspace_changed` when the hash differs from the baseline. The last-checked size and mtime are cached in the session record; that bookkeeping is not a user-visible change, so the row stays non-mutating in the proxy table. The notice is a convenience. Safety comes from step 4 of D11, which always hashes. Hashing happens only at session creation, at publish and in this poll; the regular reconcile is unchanged, so the Plan 1 blind spot for same-size edits in the sidebar preview remains.

#### Unattended-close publication boundary

Task 16.3 extends the existing publisher and its final obligations from status 2
and unpublished status 4. Deleted paths use the original safe directory; removed
or symlinked original parents use the workspace root. Never recreate the old
basename or a missing directory. An absent outputs root yields
`error` / `workspace_missing`, retaining the unpublished source version.

The claim uses the existing upload no-replace helper. Select an unoccupied,
unindexed name starting at `name (2).ext`; an already occupied first candidate
selects the next free number. Registration must create a new identity, not inherit
a stale active entry. No reconcile runs inside publication.

Keep the source document, selected version and receipt bound throughout recovery.
The final Office successor creates the new document's version 1 with parent null,
source `conflict` and published true, updates the session's file_id, baseline,
monotonic publication sequence and `saved_as`, closes it and removes its obligation.
Preserve the old document's history, receipt identity and document_key. Invalidate
the notice cache on the identity change; share immutable content, not its inode
with the mutable workspace.

Durable copy intent and private ownership precede visible claim. Recovery must
cover a claim that succeeds before its name is returned or journaled, and a
registration that commits before Office completion. Reuse the owned copy without
another file, history entry or registration increment. Equal bytes alone never
prove ownership. Revalidate pinned parents and retain ownership until the atomic
successor is durable; preserve foreign replacements and unresolved obligations.
Ordinary process crashes recover automatically, not by a manual-repair fallback.

Must preserve: callback admission/ACK, final receipt replay, ordinary save and
leaf-symlink conflicts, missing-chat no-create, pending conflict create responses,
fence budget/release and ordered recovery. Sibling seams: claim helper, outputs
index/listing, version blobs, callback receipts, status notice, create and sweep.
Tests and actual HTTP/killed-worker smoke observe those files and public responses;
claim, registration and final-state crash cuts include fresh-process replay.
Resolve/restore APIs, UI, upload-helper and broker index/rename/register primitive
changes, and deployment are non-goals.

The [approved identity handoff](https://github.com/DankerMu/open-webui/issues/107#issuecomment-6027936626)
orders pending Office recovery before Files reconciliation. The Files composition
entrypoint holds the canonical chat lock continuously across both operations.
A separate recovery call followed by an unlocked gap is insufficient: another
publisher could expose a copy and crash before the scan acquires the lock.
Reuse the existing recovery engine; an absent Office tree is a no-op for this
peripheral caller, not permission to create Office state or weaken strict callers.

If publication remains undecided, Files returns the existing sanitized unstable-read
503 with Retry-After and does not scan or mutate the index, including conditional
requests. Corrupt Office state fails explicitly with sanitized 500. Ordinary
rename, revision, cursor and ETag behavior is unchanged without pending publication.
The broker stays an Office-independent scan/register primitive; every production
Files reconciliation caller goes through the coordinated composition seam.
No persistent reservation, identity migration, second index writer or retry loop.

Evidence includes equal-content copy interruption followed by Files as the first
request in a fresh worker with startup recovery disabled, and content matching
another removed document with history. Files exposes a distinct new identity only
after the same owned copy and Office successor complete. A two-worker lock barrier
proves no publication can enter between recovery and scan. Retain no-Office,
normal-rename, auth, conditional refusal, undecided recovery and corrupt-state cases.

#### Explicit conflict-resolution boundary

Task 17.1 adds the resolve request owner and concrete route before the existing
fallback. Keep guard-first, disabled/absent-chat behavior, worker-thread store IO
and the canonical chat lock. An empty body or object without `action` selects
`save_as`; malformed JSON, non-object bodies and other actions return 422.
Session validation and epoch admission precede any new resolve obligation.
Pre-existing obligations retain D11's recovery-before-orphan ordering.

Freeze the session's latest stored user version and committed sequence under
the lock before capturing workspace content. Resolve allocates neither a new
`save_seq` nor a callback receipt. Its accepted journal binds action, source
version and sequence; request retries recover that responsibility before
considering a new action. A completed session cannot produce a second copy.

Explicit save-as uses the existing destination planner, no-replace claim,
private inode witness and atomic document/session successor even when the
original still exists. It leaves original bytes and history unchanged.
For overwrite, the same writer-excluded fence contains the safe read, durable
workspace capture and replacement. Reuse a matching historical workspace hash;
otherwise preserve it as a published `workspace` version.

Under the [lineage ruling](https://github.com/DankerMu/open-webui/issues/107#issuecomment-6036933329),
append the frozen user content as a `restore` version after capture, reusing
the immutable blob and the canonical latest-hash deduplication. The restore
parent names the selected user version. Never renumber history. A durable
capture-only phase must not become the user version selected by retry, join or
final callback: commit the version metadata and journal binding together, or
retain a validated incomplete obligation that blocks those consumers until
the user-content successor is established. Recovery must not duplicate either
capture or restore, nor overwrite intervening workspace bytes without retaining
them. No separate session latest-version pointer or version constructor.

Successful completion marks the selected user content published, points the
document at the restore version (or creates the save-as document), updates
baseline/cache/sequence, sets `closed` iff a final receipt exists and otherwise
`editing`, and removes the obligation in one Office successor.
Ordinary publish failures retain `conflict`; missing workspace is the specified
`error` exception. Preserve no-recreation, symlink refusal, free-space floor,
safe-boundary timeout and visible-successor durability semantics.

Sibling surfaces: source tickets and join, no-change save/status 4, callbacks,
epoch/orphan admission, startup/poll/Files recovery, status and broker listing.
Required evidence exercises those consumers after overwrite, double resolve
under separate processes, running/stopped fencing, every refusal and fresh
recovery after durable intent, version capture, replacement, registration and
save-as claim. Scope excludes the versions/restore routes, broker/upload
primitives, gateway, UI and deployment. Rollback requires draining accepted
resolve obligations before downgrading their reader.

#### Targeted status notice boundary

Task 13.2 adds an advisory observation, not a conflict decision. After the existing identity, projection and epoch checks, only a still-open session is inspected. An epoch orphan or final record receives no workspace IO or notice write. The notice never changes `state`, `reason`, baseline, sequence counters, pending allocations, versions, receipts, journal or workspace bytes, and never prevents save admission.

Resolve `file_id` through the existing persisted outputs index on each open-session check; do not reconcile or fall back to the document's informational path. Missing/tombstoned identity means changed. Corrupt index remains an explicit `state_corrupt` error; an unreadable index fails explicitly rather than masquerading as a missing file. Reading broker metadata is not scanning other workspace files.

Reuse the unchanged descriptor-safe reader primitives for path validation, opening and hashing. The status owner opens only the resolved file through that canonical no-follow traversal, takes `(st_size, st_mtime_ns)` from the validated regular-file descriptor, and hashes that same descriptor only on a cache miss. Do not implement a second path walker/hash or stat a path and reopen it for content. The safe-read API/implementation, creation path, outputs broker and publish path remain unchanged.

The session stores `last_checked_size` and `last_checked_mtime_ns`. Both absent, or both null after an unsafe/unavailable sample, mean no usable prior observation. A valid pair contains a nonnegative integer size and an integer nanosecond timestamp; booleans and partial/malformed pairs are corruption. With no sample, the first status hashes. With an equal pair, return the prior `workspace_changed` without reading content; a changed pair hashes and compares with the session's existing `baseline_sha256`. Every created session already owns that baseline; a missing/malformed baseline is corruption, never permission to adopt current workspace bytes.

Cache metadata must describe the bytes actually hashed. Check descriptor metadata around the existing stable-read primitive and reject an inconsistent observation instead of caching the pre-read metadata beside a different sample. Missing, symlinked, non-regular, unreadable, unstable or over-limit files report changed and invalidate the pair, so a later safe file is inspected again even when its size/mtime matches an older sample. The existing per-file byte limit bounds a cache-miss read; no new limit or reader policy is introduced.

Hold the canonical reentrant per-chat lock across the state read, observation and targeted state update. Notice ownership is restricted to the boolean and its two cache fields; D12 request activity joins those fields in one atomic successor, preserving the latest unrelated records rather than publishing an old whole-state snapshot. Ended conflicts suppress only the activity assignment. A fully unchanged notice and activity need no state rewrite. Store corruption, precommit failure and postreplace durability failure retain their explicit errors; they are not converted into a positive change notice.

Terminal or epoch-orphaned sessions may retain matching pending allocation metadata. Late command responses must not mutate them, and status bookkeeping must not clear those fields. A baseline writer in the later publish/restore slices must invalidate the notice pair when changing the comparison baseline; this slice does not implement those writers.

The equal-size/forged-mtime blind spot is intentional: establish a prior check, modify the bytes, restore the exact sampled metadata, and the poll repeats its prior result without reading. Identity remains `file_id`; size/mtime are only cache hints. Publish-time hashing remains the safety check.

Required evidence: first sample and no-read cache hits for both prior boolean values; size/new-mtime changes; forged metadata; missing/moved, symlinked leaf/parent and non-regular files with target-read traps; recovery after an invalid sample; no other workspace-file IO or DocumentServer call; save acceptance despite a positive notice; final/epoch-orphan no-IO preservation; and two workers preserving a callback-like version/receipt commit alongside notice bookkeeping. Negative controls must reject unconditional hashing and bookkeeping that erases unrelated/pending state. Packaged HTTP smoke exercises the same public status/save boundary without claiming callback implementation.

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

#### Office host-shell slice boundary

Tasks19.1/19.2 add the framed Office shell and its own policy to the existing preview
mode switch and response builder. A single `embed=office` receives Office configuration
only when `office.config.enabled()` is true. With Office disabled, preserve the ordinary
preview response and visible invalid-embedding behavior; the Office-prefix404 gate does
not classify `/preview`. Other modes and repeated/unknown values receive no Office origin.

The shell renders only its editor container and own status/error text. It mounts none of
the Files/runtime components, starts no request or timer, and installs no parent protocol
in this slice. It ignores both message families. Files-only keeps its existing protocol
and ignores Office messages. Unframed Office and invalid modes visibly refuse without
requests or messages. Loading the existing local shell assets is not an Office request.

Only the configuration module's browser-origin name constant supplies the external
authority. Treat its value as one HTTP(S) origin, not an arbitrary CSP or HTML fragment;
malformed or CSP-inexpressible configured authority fails explicitly without reflecting
credentials or loosening the policy. Bracketed IPv6 literals are valid URLs but are not
supported CSP host sources; a DNS origin resolving to IPv6 remains eligible. This is
the new serialization boundary, not a change to Office startup validation. Expose
neither service/model/MCP credentials nor signing material.

For enabled Office responses, bind the configuration script to a fresh response nonce.
Scripts admit self, that nonce and the configured origin; nested frames admit only that
origin; connections remain self. Keep the runtime style/image/font allowances and deny
base/object/form targets, with same-origin ancestors. Runtime policies remain unchanged.

The browser harness must serve captured production headers and HTML, not reconstruct a
policy. A local allowed origin supplies a positive script/frame canary; a distinct origin
supplies blocked script/frame/connection probes with observed CSP violations and no
server arrivals. Observe idle and cross-protocol silence, invalid/top-level errors and
screenshots without accepting unrelated console errors. Preserve all existing cases.

The decision record `ocu-office-editor-frame` records the third trust class: trusted
host code may load the explicitly configured editor API, while nested document rendering
uses the separate DocumentServer origin. Generated documents remain opaque and existing
read-only/runtime frames keep their policies. No gateway or parent sandbox change belongs
to this slice; rollback reverts shell and policy together, with no persisted-state change.

#### Office host-protocol slice boundary

Task20.1 mounts `static/office-editor.js` only as the valid Office mode's behavior
owner. Install its listener before posting one exact `ocu:office-ready` to the page
origin. Validate source, origin, chat, exact keys, file identity and safe-integer
generation before synchronously accepting the one open; latch ownership before
any await. No second open, including after refusal or error, creates a session.
The original opened file and generation remain the report identity.

Create once through `ocuFetch`, encoding chat/file as path segments and retaining
its prefix/header behavior. The create response lacks reason, publication sequences
and `workspace_changed`; read the returned session once through its status GET
before deriving those values. This initial snapshot is not a recurring poll.
The same status-application path consumes supplied persisted status; task20.2 owns
the later polling loop. Do not fabricate a clean join or a conflict reason from
the abbreviated create response. A failed snapshot reports error with the known
session id; a final snapshot does not open an editor.

Only the existing admission pairs are final refusal: unknown_file404,
unsupported_type415, file_too_large413, unsafe_path/corrupt_document422,
storage_low503 and unpublished_version409. Other creation failures, including
documentserver_unavailable502, transport and malformed replies, report error.
Preserve the broker's nonempty reason where available; absent response information
gets a fixed local failure reason. Neither failure nor refusal closes another tab.

Load `/web-apps/apps/api/documents/api.js` from the server-provided browser origin,
never from a message, query or broker-supplied script URL. Preserve the signed
document, editorConfig, key, callback, permissions and token fields; attach local
event callbacks without rewriting those fields. A bounded API-load deadline,
failed request, missing constructor or throwing constructor reports a visible
error. A late script completion cannot turn that failure into an editor.

Editor readiness does not synthesize a broker state. A modification event marks
uncommitted local content; the editor's false modification event only means data
reached its editing service and cannot clear workspace dirty state. Persisted
states, publication sequences and change notices come from the status snapshot.
Closed is never dirty; conflict remains dirty. Synchronous constructor error
callbacks, including measured connection-loss code -18, cannot be overwritten by
a later success path or mapped to refused.

Save/close execution, save-sequence coverage tracking, recurring status polling,
auto-save and full teardown remain task20.2. No successful no-op command handler,
retry, new broker behavior or timer loop belongs to task20.1. Update the valid
Office shell's ready/listener assertions rather than weakening invalid-mode
silence or its policy/secret checks. Refresh the existing frame decision's
implementation facts and README after runtime proof; no new decision is needed.

#### Office host-lifecycle slice boundary

Task20.2 extends the same host owner. Keep exact command source/origin/chat/key
validation and require the accepted open's generation. A page still creates
only one session. The existing Office component effect returns the host's
disposer; that is lifecycle wiring, not a shell, mode or policy change.

One status-read owner serves initial hydration, periodic observation and
post-command refresh. Reads do not overlap; an older in-flight observation
cannot overwrite a later accepted mutation or revive a final/disposed host.
Use a one-second poll delay after completion, not overlapping intervals.
Keep one five-minute auto-save timer while editing. Ordinary editing polls
must not reset its deadline; leaving editing or requesting close stops it.
An unsuccessful close retains the editor and restores eligibility for the
editing timer after status confirms that state.

Track local modification generations separately from publication sequences.
Capture the generation at save dispatch and bind it to the broker-returned
save sequence only after acceptance. A status whose committed sequence covers
that allocation acknowledges only that captured generation, not later edits.
Reconcile the same rule if the committed status arrives before the save reply.
Another tab's sequence advancement alone cannot acknowledge this tab's edits.
No-change saves do not manufacture dirty state; committed persist-only content
remains dirty while committed is above published. Keep failed or outstanding
coverage conservative and preserve the existing closed/conflict rules.

Publishing and persist-only requests retain their actual intent. Only the
specified session_not_editing refusal attributable to an outstanding auto-save
queues a publishing retry; keep one queued intent and dispatch it once editing
resumes. Repeated polls cannot multiply that request. Close supersedes queued
publishing intent. Do not add generic mutation retries or idempotency claims.

Save-error correlation stays in the existing broker session owner. A 409
session_not_editing caused by a saving session includes `blocking_save_seq`
from its pending save at the rejecting admission check, under the canonical
chat lock. Other not-editing refusals omit that field. A save502
documentserver_unavailable includes the actual request's allocated `save_seq`,
even when a newer mutation has superseded it before response delivery.
Creation and restore errors retain their existing response shape.

One explicit publishing intent retains candidate local auto-save attempts that
were outstanding at dispatch or started while its response is unresolved. The
refusal's positive safe `blocking_save_seq` must equal a candidate's actual
sequence from its202 or502 response. Pending identity is not permission to
retry; missing, malformed or mismatched evidence fails closed.
Only202 acceptance binds modification coverage; a502 allocation does not.
A newer explicit Save replaces any older intent, including an installed queue.
Background persistence does not advance explicit-command authority. A matched
intent survives later foreign allocations until editing resumes, unless a newer
explicit command, final state or retirement supersedes it. Candidate references
belong only to that unresolved or queued intent, not a session-wide history.
No allocation is predicted from a baseline or inferred from a later status.

A rejected save/close is a recoverable command failure, not the host's terminal
localError latch. Surface a non-null reason with the broker's current state,
retain dirty and the editor, and keep the reason across ordinary successful
polls until another command is accepted. A failed status read is terminal
error. Persisted save_timeout or callback refusal remains usable editing;
uncommitted modifications remain eligible at the next auto-save tick.

Close stops auto-save immediately but destroys the editor only after a valid
accepted close response. Poll thereafter until a final persisted state.
Opening may close directly to closed; ended conflict may remain conflict:
consume actual broker status rather than fabricate closing from a click.
Final closed/error/orphaned or terminal host failure stops both timers and
future commands. Teardown is not a close request.

The idempotent disposer marks the owner retired before releasing anything,
then removes its listeners/timers, aborts all owned requests and API loading,
and destroys its editor once. Every await continuation and SDK callback checks
retirement. If disposal occurs synchronously inside the editor constructor,
destroy the returned instance instead of retaining it. Component cleanup and
pagehide call this same path; late responses, decoded bodies, scripts and
timers cannot create an editor, request, timer or message after retirement.

Verification extends the existing real-module harness and inherited browser
harness, not a second state-machine implementation. Cover ten issue criteria,
edits arriving during saves, commit-before-reply ordering, stale observations,
retry attribution/deduplication, rejected close and constructor-time disposal.
The parent-owned smoke uses the actual host/static modules and native framed
messages/HTTP with controlled broker/SDK dependencies, then removes real frames
with pending work and observes silence. Retain full preview/CSP/secret checks.
Real DocumentServer persistence and deployment acceptance remain separate.

#### Editor entry and frame slice boundary

Tasks 24.1 and 24.2 implement the parent authority boundary and its executable browser path together. The selected-file action area is the entry seam; file rows and their existing accessible names remain unchanged. A saved chat, enabled workspace and literal true Office feature flag admit only broker types docx/xlsx/pptx. Display classification never grants edit eligibility. Editing does not call launch, including for stopped workspaces.

The B1 record's outer-frame capabilities become two code constants: `allow-scripts allow-same-origin` and an empty permission-policy string. The editor uses the validated current-chat preview URL with `embed=office`, not a broker-supplied URL. Existing generated, read-only Office and runtime policy classes are untouched. A distinct local edit activation owns its frame; revision, path, unrelated files, streaming and the first session id never replace that frame.

One new module owns current-frame binding, exact protocol validation, the one-open handshake and the 10-second ready deadline. It reuses the chat-keyed Office store's generation functions rather than inventing another counter or state owner. Generations remain monotonic for that chat across retries/remounts. A fresh activation resets its file/session/state/reason/dirty/workspaceChanged/savedAs snapshot explicitly through the existing store API; the generation alone does not reset these fields.

Invariant: only a message belonging to the currently live frame and activation may alter that chat's Office state or cause a parent response. Require exact source, page origin, expected frame URL, exact keys, chat/file/generation, known state, boolean dirty/workspace_changed and the documented nullable session/reason types. State before the accepted ready handshake and duplicate ready messages do no work. Store the original opened file id, never replace it from later session or destination metadata.

Deadline expiry retires authority before showing a failure/retry; a late ready cannot revive it. Retry creates a fresh frame. Controller disposal detaches owned listeners, cancels timers and retires generation authority. The group 27 leave guard owns close-before-removal for user departure; disposal itself does not initiate a second close. Test ready/deadline ordering and stale callbacks without changing the existing preview protocol.

The browser harness keeps its five existing configured spec files, including the tree case, and adds Office as the sixth. It registers the seven existing Office scenarios and enables the delivered feature flag only in its isolated service environment. After a context is available, actual configured `playwright test --list` output must prove each required file contributes tests before the execution subprocess starts. Missing Office matching fails naming that file with no pass line; missing Office scenario data fails the Office case rather than manufacturing a chat.

Sibling surfaces are selected-file entry eligibility, module/store authority, both child message types, every frame retirement path, delivered stub host/session requests, browser context/scenario provisioning, discovery and existing A-T01 consumers. Browser proof observes a real proxied session creation, editing and the parent-accepted store state without a production test hook or a premature status bar. The screenshot is stub-editor integration evidence, not real DocumentServer edit/save certification.

Versions preflight, status/save controls, maximize/history/conflict UI and the group 27 leave guard build on this authority boundary. Frame cleanup remains distinct from user departure intent. New strings use the existing generation process. The owning decision and Office plan document this seam after runtime proof; rollback is the reviewed source commit with the Office flag disabled, not a compatibility implementation.

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

#### Office client and store slice boundary

Task 23.2 adds exactly the parent's four gateway operations: session status,
versions, restore and resolve. Use same-origin cookie credentials under `/ocu`;
encode each chat/file/session segment and put `X-Requested-With: ocu-workspace`
on restore and resolve. Session creation, save and close remain child-owned.

Reuse `WorkspaceRequestError` without changing the existing workspace mapping.
The governing issue ruling is: "the Office client passes the reason of the
broker's response body through unchanged, with the HTTP status: no allow-list
and no folding of 404 into `not_found`". An absent, non-string or unreadable
reason yields `request_failed`; transport failure uses status 0. Invalid JSON
on success yields `invalid_response` with the response status. No response
schema validator, retries or reason translation is added by this slice.

Invariant: Office state and generation belong to exactly one chat. Beginning
or retiring a generation affects only that chat; an update for a retired or
absent generation changes nothing. Making chat B current does not retarget an
in-flight chat A result. The new store follows the workspace generation pattern,
not a global active-chat pointer, and never imports `artifactContents`.

Sibling surfaces are the shared error class, gateway listing transport, workspace
generation helpers and the later frame/close-guard consumers. Existing modules
remain unchanged. New modules deliberately have no component callers until
the following slices; this is the issue's explicit boundary, not unused fallback
code. Store field/API names are implementation choices documented for consumers.

#### Status and save-control slice boundary

Task 24.3 consumes the existing chat-keyed, generation-bound Office snapshot; the frame module remains the only child-message validator. A focused presentational status component keeps WorkspaceArtifact below its size limit. Projection has one implementation, either local to that component or a small genuinely shared helper, not a second state store.

Display is a projection of the latest accepted state, never a click/request latch. In editing, a non-null reason takes precedence over dirty/clean and displays failure while Save stays enabled. Otherwise editing dirty is unsaved and editing clean is saved. Saving and closing display saving regardless of dirty; opening, conflict, error and orphaned have distinct opening/conflict/failed/expired text. Before the first accepted state, no saved/saving claim is invented and Save is disabled. No-change saving→editing with dirty false never displays unsaved.

The existing controller gains the save operation consumed by this bar. It posts exactly `{type: 'ocu:office-command', chat_id, generation, command: 'save'}` to the page origin only for its currently attached, opened, URL-matching frame and current generation in editing. It sends no file_id, HTTP save request or close command, and does not mutate displayed state. A stale click after saving or retirement does no work.

Validated refused and closed reports retire the editor through its existing cleanup path and return to the selected file's read-only preview/download. Refusal explanation remains associated with that selected file's accepted snapshot after frame removal; it cannot appear for another chat/file or a replacement activation. Known creation reasons are unsupported_type, file_too_large, corrupt_document, unknown_file, storage_low, unsafe_path and unpublished_version. Required validation reasons receive explicit localized messages; unknown reasons retain their literal value in an escaped, localized refusal fallback. Unpublished_version receives no pre-open recovery in this slice. No refused session is closed or followed.

Orphaned keeps its admitted frame and displays expired with Open again. That action reuses the captured-identity activation mechanism: a fresh frame/generation opens the original file id, including after same-ID reclassification; the broker decides whether creation can still proceed. It does not make never-admitted non-Office files eligible for fresh Edit. Old-frame messages cannot affect the new activation.

The workspace-changed notice follows the accepted boolean only while the editor context remains present; it neither disables editing/Save nor survives closed/refused retirement as an orphaned banner. Existing feature/chat/view/selection revocation, ready timeout/Retry, same-ID retention and read-only restoration remain intact. Status and commands must bind to the current activation rather than display or act on a different retained chat snapshot.

Sibling surfaces are the status projection, command sender, existing validator/store, component retirement/render order, read-only fallback and delivered host's exact command keys. Mounted tests drive real messages through the controller; a presentational component test alone cannot prove command authority or retirement. Existing browser first-open captures actual status-bar presentation without changing the browser spec; browser save/refusal scenarios remain task 24.4.

No history, maximize, conflict dialog, versions preflight, special unpublished recovery, close-progress/report/guard or beforeunload lands here. New text uses generated localization catalogs. The current Office client-store decision owns projection and dispatch; rollback disables the Office feature and reverts this slice without a second implementation.

#### Save and refusal browser-proof boundary

Task 24.4 adds two cases to the existing Office browser spec, retaining first-open proof. Each uses an isolated scenario chat and the existing owner authentication, proxy, fixture selection and private request recorder. No production hook or alternate stub is introduced.

The save case observes actual Unsaved after the host's modification control, actual Saving after the parent Save action, then Saved only after the host receives a confirming status response. A test-local gate may hold all GETs for the exact chat/session status path; it must not fabricate bodies, intercept other paths or leave an earlier in-flight status response able to bypass the window. The real save POST must reach the stub and return its accepted save_seq while the gate is closed. Assert Saving and absence of Saved during that window, then release real traffic and correlate status last_published_seq with the accepted sequence before accepting Saved. All routes, subscriptions and pending gates are released in failure cleanup. No sleeps, timeout inflation or retries substitute for ordering.

The stub completes publish synchronously inside the save request; this proves the UI waits for reported confirmation, not an asynchronous broker persist/publish implementation. Version records do not contain save_seq; sequence evidence belongs to save and status responses. Any state trace is secondary to rendered-state assertions and real network responses, never a replacement for them.

The refusal case uses office_unsupported and observes the actual creation response 415/unsupported_type. Require its explicit parent message, absent editor, usable read-only preview and an actual download with fixture bytes. Scope private records to the case's chat and start offset; require no close arrival, including after the fallback actions. A present link or frame alone does not prove usability.

Sibling surfaces are the host's message producer, parent controller/store/status projection, gateway HTTP requests, stub status and request record, and preview/download fallback. They are exercised, not edited. Existing first-open, A-T01 and other configured cases remain. Browser console handling may recognize only an expected 415 diagnostic tied to the exact refusal endpoint; all other console/page errors fail.

Screenshots cover the save confirmation window/final Saved and refusal fallback under .run/ui-evidence. Evidence explicitly remains stub-level. The owning Office plan receives the verified browser boundary after smoke proof; rollback reverts only these tests and documentation, not runtime behavior.

#### Maximize layout boundary

Task 25.1 adds a localized maximize/restore action to the existing Office status bar. WorkspaceArtifact owns component-local layout state; the controller and chat-keyed Office store retain their existing authority. The status bar and current editor stay in one existing rendering branch, never a second conditional copy. Layout toggles must not change editorKey, src, policy, generation or session, and must not detach/reparent the iframe. A manual popover promotes that existing wrapper to the browser top layer without changing its DOM parent.

The overlay contains the same status and Save controls. Save keeps its current reported-state eligibility and command path; maximize does not invent a state, save, close or session request. Editor retirement/replacement clears layout state so refused/closed, timeout, feature revocation, selection/view/chat changes and unmount cannot leave an orphan overlay or make the next activation maximized. No new navigation guard, keyboard shortcut or browser Fullscreen API is added.

Actual viewport geometry and hit testing govern layout acceptance. Fixed positioning with a local z-index remains underneath the Navbar and Controls separator. The selected mechanism uses native manual-popover presentation and explicit viewport geometry, not a higher local z-index or an ancestor edit. The popover attribute is absent in normal sidebar mode so native hidden-popover styles cannot hide the editor. Restore, retirement, replacement and teardown remove top-layer and popover attribute state. No light-dismiss behavior, generic overlay framework, second controller or dependency is added.

Unit tests may model the native popover primitive, but production must not silently fall back to the known-obstructed fixed-only layout when that primitive is absent. Real-browser tests prove top-layer presentation, unchanged live Document and no reload. At points previously covered by the Navbar and resize separator, hit testing must reach the overlay or its descendants, never accept the obstructing element as an alternative. Existing Drawer Escape/leave behavior remains outside this slice; no new keyboard guard is introduced.

Mounted tests retain the iframe reference through maximize and restore, assert no additional open message, exercise existing Save in the overlay and reject Fullscreen API calls. Browser proof additionally retains a marker or Document reference inside the iframe: WindowProxy or DOM-node equality alone does not rule out reload. Require no navigation/reload, unchanged editing session/generation and exactly one creation arrival for the isolated case.

The browser case explicitly saves sidebar and overlay screenshots, measures expansion beyond the desktop sidebar and checks reachable controls at desktop and narrow widths. Restoring returns the existing editor to its ordinary layout. Existing first-open, save-confirmation, refusal and A-T01 cases remain; no test-discovery, scenario, retry or timeout change.

Sibling surfaces are the selected-file wrapper, Office status controls, existing frame action/controller/store, desktop Controls/Drawer ancestors and browser host/request record. Existing Files/Browser/Terminal layouts and generated/read-only sandbox policies remain unchanged. Owning Office documentation records the measured mechanism after smoke proof; rollback reverts this layout slice without a compatibility implementation.

#### Version-history boundary

Task 25.2 uses the existing parent Office client for versions and restore; it adds no message command, store authority or server route. The status bar exposes history while editing; the selected editable Office file exposes it without an editor. Opening either entry issues one versions read and never creates a session. Existing literal feature flags, saved-chat and canonical gateway admission remain required.

The history surface remains inside the selected-file wrapper, including its native top layer when maximized. It must not portal beneath that layer, change layout mode, detach the editor or alter its key, document, session or generation. Version Restore is distinguishable from layout Restore. The view shows broker number, time, source and each row's literal published flag; the workspace source does not imply publication. The B-T14 fixture explicitly marks workspace false, save true and autosave false.

Each opening captures chat and file identity. Selection, chat, view, feature revocation or dismissal invalidates that opening; late reads or mutation completions cannot populate another view, reopen it or trigger a reload for a retired opening. Same-ID metadata/revision changes do not restart its read. This identity belongs to the local history UI, not a second editor store.

Restore is disabled with an explanation precisely while this page has an editor frame open on the document; a listing's remote open_session never disables it. Pending mutation also disables repeated submission. One chosen version produces one restore request through the existing mutation-header client, then one authoritative list reload. Refusal preserves every displayed row and reports the broker reason, including session_open. A successful mutation followed by a failed read is reported as a refresh failure after restore, never as mutation refusal or an optimistic fabricated row.

Sibling surfaces are both entry points, the delivered Office client and error type, history component lifetime, live editor/status projection, native maximized wrapper, and the existing stub versions/restore contracts. No list publication flag, Office status or workspace revision is inferred from a successful click.

Required proof: mounted real-client/fetch-boundary tests cover both entries, exact row fields/flags, local frame versus remote session, one mutation/header and authoritative reload, refusal conservation, stale results, duplicate clicks, feature-off/non-Office absence and unchanged live iframe. The existing browser suite remains unchanged; an external disposable browser walk proves actual history rendering and reachable controls in sidebar and maximized layout, with screenshots and no unexpected errors. It is not real-broker acceptance.

Owning Office plan/decision records the history lifecycle after smoke proof. Rollback reverts this UI slice with the feature disabled; no compatibility path, deletion/pruning, conflict dialog, unpublished preflight or close guard is added.

#### Conflict-resolution boundary

Task 26.1 adds one parent-owned conflict component using the delivered resolve client. It consumes the accepted chat/file/generation/session context and latest state/reason; it must not depend on querying the iframe for session identity. WorkspaceArtifact admits and retires the component with the current editor context. Its existing selected-file action bar moves intact into a focused presentation component to make room under the unchanged 800-line gate; no compressed markup, second bar implementation or unrelated preview extraction.

The dialog remains inside the selected-file wrapper so maximized top-layer presentation cannot hide it. Save as new file is the primary/default action. Selecting overwrite sends nothing; only a second explicit confirmation sends overwrite. A changed reason of path_missing removes overwrite and invalidates an outstanding overwrite confirmation. There is no merge, discard or destructive cancel operation.

Visibility, confirmation, pending/error and terminal refusal belong to the conflict UI, not a new editor store. Dismissal sends nothing and preserves the existing conflict text with an explicit reopen control. Repeated reports within the same conflict episode must not reopen a dismissed dialog. Leaving conflict and entering a genuinely new episode re-arms presentation. At most one resolve is in flight for the captured context; retired or superseded completions cannot alter another dialog, selection or activation.

Ordinary refusal shows the literal broker reason and retains the dialog. A workspace_missing refusal closes it, reports that the files are gone and content is retained, and prevents any further resolve for that affected context, including repeated conflict reports. Success closes the dialog without writing an invented editing/saved state. Host polling remains the authority for subsequent state; repeated old conflict while awaiting that report cannot cause another automatic resolve.

Save-as may return a new file_id/path, but the accepted editor binding remains the file_id from its original open message. Never select that new file, rewrite activation identity, change generation/key/src or recreate the frame from the resolve response. Existing Files reconciliation discovers the deduplicated new entry; the original entry and content remain unchanged.

Sibling surfaces: accepted-message controller/store, Office status projection, history controls, extracted selected-file bar, delivered client/error mapping, host status polling, Files reconciliation, native maximized wrapper and existing office_conflict stub. No message schema, backend, stub or harness configuration change. The component may be reused by the later pre-open slice, but that trigger and its decision logic are not implemented here.

Required proof: actual mounted parent/client tests cover all issue branches, default action, declined/accepted second confirmation, path_missing transition, dismissal/reopen, workspace_missing suppression, refusal conservation, duplicate submits and retired request completions. Existing selected-file/Office/history/preview regressions prove the extraction. A permanent browser case uses office_conflict: real save enters conflict; default save-as sends one authenticated resolve with mutation header, then host reports editing/not dirty and Files shows original plus a distinct deduplicated file. Preserve the same iframe and live Document through status and listing refresh; save a dialog screenshot with no unexpected browser errors. Exercise dialog reachability inside the maximized wrapper without replacing the frame.

Owning Office documentation records the state/identity boundary after smoke. Rollback reverts this UI slice with the Office feature disabled; no compatibility implementation or automatic overwrite fallback.

#### Open-time admission boundary

Task 26.2 adds one focused preflight owner between explicit Edit and the existing frame activation. Capture chat/file and a user-activation token at admission; read versions through the delivered parent client. Decide only from that response: ended-session conflict first, otherwise no-session unpublished newest version, otherwise open. No session is created by the parent. The preflight owner may hold local request/prompt state but is not another editor store or generation controller.

The existing conflict component also accepts the frame-less session identity from open_session. Its actions, confirmation, dismissal/reopen and refusal behavior remain shared with live conflicts. Pending admission checks the captured file and activation rather than inventing an editor generation. Resolving an ended-session conflict closes the prompt and returns to the file entry with no editor; the next explicit Edit starts a fresh check on whichever file the user chooses (D13). A resolve response never selects or opens its returned save-as file.

The unpublished-content dialog is named Unpublished content and offers Restore the unpublished content, Start from the current file, and Close. Restore uses the response's newest version number exactly once; only accepted success opens the captured file. Refusal retains the choices and literal reason. Start-current sends no restore and leaves history to the broker. Dismissal opens nothing and sends no further request. Failed versions reads fail closed with Retry; a missing or failed response is never treated as an empty history.

A validated refused/unpublished_version report for a frame created by this activation consumes one automatic recheck allowance: retire frame/controller authority, suppress this first special refusal and read versions afresh through the same decision path. The allowance belongs to the user activation, not the frame generation; replacement frames cannot reset it. A second refusal retires the frame and shows an error with explicit Retry. User retry begins a new activation; old refused snapshots or late messages cannot consume its allowance. Other refusal and ready-timeout behavior remains unchanged.

Admission survives same-file metadata changes but not selection, chat, view, feature/base revocation, dismissal or destruction. Check current admission synchronously before mutations and before opening from a completion; stale reads/restores/resolves cannot open an editor, replace another prompt or start a follow-up request. Coalesce in-flight Edit/read/restore/resolve actions. No browser-persisted decision cache, background versions polling or automatic restore is added.

Sibling surfaces are Edit and captured Retry/Open again, selected-file lifetime, existing frame retirement and status projection, reusable conflict UI, history restore, delivered client, Files reconciliation and both existing stub scenarios. Keep WorkspaceArtifact under its unchanged size gate by owning preflight outside it, not by compressing source or broadly extracting preview/editor lifecycle. Adapt existing test fixtures to the new versions-before-frame contract without deleting their behavior assertions.

Required proof is mounted real-parent/client behavior for precedence, both choices, no-prompt branches, pending-conflict resolution without a frame, read/restore failures, one recheck then terminal retry, duplicates and retired completions. Two permanent cases in the existing Office browser surface exercise real office_unpublished restore and office_stale refusal-to-start-current ordering, retain version history and reach accepted editing. Save each prompt screenshot and assert zero unexpected errors. All prior first-open/save/refusal/maximize/history/conflict and sandbox cases remain. Owning docs follow smoke; rollback reverts this slice without a compatibility path.

#### Leave-guard ownership and delivery

Task 27.1 replaces the interim no-close departure behavior. Keep live frame/generation authority in the editor controller and the delivered Office store unchanged; a new guard owns captured departure operations, transient chat-keyed reports, native unload registration and session followers.

Capture chat, opened file/name, session and generation before any close or removal. All five user triggers enter the same guard: chat switch, sidebar close, explicit editor close, different file and different view. Add the missing editor-close action on the existing Office surface. Chat/ChatControls changes remain imports and calls at their existing lifecycle/action sites, not inline Office state, message, request or timer logic.

Posting a message is not delivery: browser message tasks can be discarded with an iframe, and a child's closing snapshot may precede its close POST. Normal departure must retain the original live document long enough for authoritative close acceptance, without fixed sleeps, a second close endpoint or a made-up ACK. A broker closing state permits frame removal and continued background following; terminal outcomes also permit departure. A pre-existing editing conflict is not evidence that close has completed: use the delivered ended-session evidence rather than treating the old conflict as an acknowledgment. Failure to establish acceptance within the bounded budget remains unconfirmed. Unexpected forced teardown must still preserve the captured session follower; it cannot promise to undo teardown or a server-accepted write.

The progress deadline is 15 seconds from an attachment's first close attempt, informed by B1's 5.337–5.358-second observation and explicit polling/network margin. Use one nonoverlapping follower per chat/session and a one-second cadence; duplicate hooks for the same generation join one departure and send one close. A newly attached generation's explicit departure sends its own close, as required for every editor departure; the broker's repeated-close allocation rules remain unchanged. An older response or pre-existing closing state cannot certify that newer frame's command was processed merely because a later GET was started. Keep captured generation-specific continuations separate from session-level polling. A deadline terminates hung-request authority, records unconfirmed and releases only the still-authorized departure once; late completions cannot replace that result or navigate. Do not change the delivered client API to gain cancellation.

The report is exactly saved, saved as a new file with the basename from saved_as.path, conflict waiting, failed with literal reason, or unconfirmed. Only an authoritative status read establishes saved; closed with an unconfirmed publication is not success. Transport/read errors do not establish a saved or broker-failed outcome. Preserve the last uncertainty reason while following within the same deadline; no automatic re-close. A refused frame is removed without close or following, even if a previous snapshot carried a session id.

Reports survive panel removal in the guard, not artifactContents or a second live editor store. Reuse the existing notification mechanism, bind each notification to its owner and hide an old chat's report while another chat is active; replay that owner's result on return. A late A result changes none of B's status, files, selection or dialogs. A new activation or newer departure cannot be overwritten by an earlier operation of the same chat. Do not optimistically change file identity, select saved_as, mount an editor or open conflict UI; existing reconciliation discovers the saved file.

Register beforeunload only for the current, still-mounted editor's latest dirty:true state; clean, refused, retired and absent editors remove it. Native refresh/tab-close uses the browser prompt and does not promise that unload awaits asynchronous saving. A dismissed native prompt leaves the current editor usable. All subscriptions, timers and notifications have explicit teardown ownership; completed followers stop and cannot be revived by late host messages.

Sibling surfaces: controller start/attach/detach/dispose, preflight refusal/retry, live conflict/history, both sidebar layouts and close paths, chat navigation/unmount/new-chat entry, selected file/view actions, status client, delivered host close flow and workspace reconciliation. Preserve same-ID metadata/frame continuity, opaque generated-content policy, fixed editor sandbox, saved-chat admission and all existing Office browser oracles.

Execution: freeze fixture and review; qualify one accepted-session departure RED; implement guard and callers; exercise all triggers/outcomes/late transitions; independently run a real browser delivery smoke and the unchanged regression suite before documentation and merge. Required disposable browser proof holds a genuine close response and observes the close request arrival, frame lifetime and owner report; mocks that merely count postMessage calls are insufficient. Task 27.2 supplies permanent B-T12/save-as browser coverage separately.

Rollback reverts the guard slice and its hooks as one unit, with no persisted state or migration. No dependency, server, stub, browser harness, discovery or timeout-gate change is authorized. Keep task 27.2 and the shared Office change open.

The user authorized a bounded Chat.svelte size exception because its necessary imports and guard registrations conflict with the frozen oversized-file no-growth rule. Record the exact formatted ceiling and an exit condition in constraints.yaml; scoped lint may apply that ceiling only to the exact path, never skip its lint/complexity checks or exempt sibling files. Prove acceptance at the ceiling, refusal above it, unrelated-file enforcement and continued lint/complexity refusal. WorkspaceArtifact and new modules/tests remain under the ordinary limit through responsibility-based reuse, not compressed formatting.

The user also authorized a minimal optional close-request hook in common Drawer/ResizableSidePanel where required to distinguish explicit Escape/backdrop/drag close from disposal. The guard owns asynchronous acceptance; common components own only requesting close and applying accepted visibility. Unconfigured callers retain their original synchronous close behavior. Component destruction or initial mobile-to-desktop layout resolution must not enter Office departure or persist open:false. Prove hydrated open preferences survive initial layout resolution without a close PUT, genuine close still dispatches/retains once, and unconfigured common callers still close normally. No presentation/layout change is part of this seam.

#### Leave-browser acceptance boundary

Task 27.2 adds permanent cases to the existing Office browser spec, reusing its authenticated route, scenario provisioning, file and frame helpers. Keep independent fresh chats for native refresh, dirty sidebar close, dirty chat switch/return and automatic save-as. Use real visible controls; never force a click or import a production mutator to construct the expected state. Existing discovery and all 31 cases remain unchanged.

Pause genuine close/status transport only to expose progress and ordering; release the original response unchanged. For dirty sidebar close and chat switch, capture A's original file id and bytes before editing, observe Saving and the same live frame before the close reaches the broker, then exactly one authenticated close arrival, status reads for the captured session, terminal published status and owner-bound Saved. In B compare its file list, selection, Office surface and dialogs; return to A with no editor and the same listed/selected file id. Verify independently expected content: these direct-close cases must record no save POST, and returned bytes equal captured original bytes plus the stub's `-close-{save_seq}` transformation. If a case intentionally exercises persist, derive its expected autosave content from the recorded persist sequence instead. Fetched SHA-256, reconciled listing hash and the version selected by `published_version` must all match those expected bytes. Prove explicit Edit is needed for a fresh editor. Screenshots capture progress, destination/return state and outcomes.

The delivered stub completes close synchronously: its POST returns closed and all later GETs are terminal. The guard admits navigation from that terminal read. Consequently this browser fixture does not manufacture a closing response to claim A's terminal result arrives after entry into B. It proves real departure and owner isolation; the genuinely delayed-terminal-after-switch invariant retains the mounted evidence delivered by task 27.1. Any late old response exercised here must be described as old-response isolation, not a delayed close outcome.

For refresh, a clean editor and an absent editor reload without a native dialog. A dirty editor reached through real user interaction raises beforeunload; dismiss it and prove the same document remains dirty and usable. Native unload is not an asynchronous persistence guarantee. For office_save_as, capture original bytes/id before opening, use the delivered missing-original scenario, leave dirty through a real control, and require the saved-as report's report (2).docx name. After ordinary reconciliation, require `listing.file_id === terminalStatus.saved_as.file_id`, different from the original id, and `listing.path === terminalStatus.saved_as.path === 'report (2).docx'`; no report.docx may remain. Fetch the listed canonical URL and require bytes equal captured original bytes plus the delivered `-saved-as` transformation, with fetched, listing and published-version hashes all bound to that independent expectation.

Each case saves step screenshots and asserts zero unexpected page/console errors. Test-only changes use characterization qualification: the parent runs the real cases GREEN, then a disposable boundary fault such as withholding close or substituting an incorrect saved-as destination must trigger the corresponding semantic assertion; restore and run the unmodified suite GREEN. No fault injection enters production or the committed success path. The acceptance claims are restricted to local proxy/stub integration. Rollback removes these cases/helpers and their documentation, not the delivered guard.

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

#### Bootstrap slice contract

Task29.1 requires explicit operator inputs `ENABLE_OCU_OFFICE_EDIT` (`true` or
`false`, case-sensitive) and `OCU_OFFICE_DOCSERVER_ORIGIN`. Missing or empty inputs
are errors; the WebUI application's default-false flag is a separate boundary.
The origin uses the existing WebUI absolute-origin validator. Origin equality
compares scheme, hostname and effective port, including implicit HTTP/HTTPS ports.
Diagnostics name the input without echoing its value.

`OCU_OFFICE_PROXY_PORT` defaults to `8083` when unset; an explicit value must be a
decimal port in 1–65535. `OCU_OFFICE_FONTS_DIR` defaults to
`<DEPLOY_ROOT>/data/office-fonts` when unset and accepts an explicit directory path.
Explicit empty values are refused. Both pass the existing dotenv-safety check.
The fixed control-plane addresses are `http://documentserver` and
`http://computer-use-server:8081`; task30.1 uses the service name `documentserver`.
The browser origin is an operator input, not inferred from the WebUI address.

Generate the JWT with `openssl rand -hex 32` after the existing output-occupancy
guard, independently of the five existing secrets. A command failure or empty
result names `OCU_OFFICE_JWT_SECRET` and publishes neither output. The secret
appears only in the protected runtime file, never the admin file, logs or version
report. Flag on/off changes only the flag among non-generated values.

Create an absent operator-font directory without adding any font; leave an
existing directory's bytes and metadata untouched. Preserve the existing
bootstrap publication and cleanup protocol. The copied-bootstrap integration
caller receives the two new required inputs; no other deployment consumer is
changed. Compose wiring, preflight and font mounts remain tasks30.1–30.3.

#### Compose service slice contract

Task30.1 adds the always-present `documentserver` service to the existing core
stack, using `DOCUMENTSERVER_IMAGE` without a build, profile, host publication
or host/shared network mode. Its only network is the existing control-plane
default network; the control-plane URL remains `http://documentserver` (port80).
The port guard requires this service exactly once and rejects any additional
network, not only the sandbox bridge. The proxy still publishes one port.

Use three project-scoped named volumes: `documentserver-data` at
`/var/www/onlyoffice/Data`, `documentserver-cache` at `/var/lib/onlyoffice`, and
`documentserver-logs` at `/var/log/onlyoffice`. The pinned upstream
[9.4.0.129 storage guidance](https://github.com/ONLYOFFICE/Docker-DocumentServer/blob/8da03c96b1eaa13be94bdbe46c530b3109aea99e/README.md#storing-data)
and its Community Dockerfile distinguish certificates, document cache and logs;
persisting only the certificates path would not preserve the cache. These are
DocumentServer-owned data volumes, not host binds or broker workspace volumes.
Database/message-broker volumes from the upstream Enterprise layout are not
added. Font mounts remain task30.3; backup membership remains task33.

Native Compose v2 resolves the actual base-plus-overlay files with the same
three project directories and file ordering as `up.sh`. Verification supplies an
empty explicit env file, a temporary HOME/DOCKER_CONFIG and a synthetic
environment allowlist; no operator `.env`, credential config, daemon, image pull
or image build is needed. Missing Compose is a failed prerequisite, not a skip.
Tests compare resolved OCU keys to the four existing `office/config.py`
constants and check the WebUI flag, in both flag states.

The release map, intended documents (including custom-image variants) and fake
engine core-service table migrate together. Actual guard/startup refusal tests
observe no service start or network/firewall/image mutation on invalid topology
or image identity. Native resolution proves configuration and stable named-volume
bindings, not a running editor or data surviving actual container recreation;
those deployment gates remain with the real-image acceptance owner.

#### JWT preflight slice contract

Task30.2 uses the upstream image's canonical `JWT_ENABLED: "true"` and
`JWT_SECRET` populated from `OCU_OFFICE_JWT_SECRET`. The pinned
[Community entrypoint](https://github.com/ONLYOFFICE/Docker-DocumentServer/blob/8da03c96b1eaa13be94bdbe46c530b3109aea99e/run-document-server.sh#L385-L399)
applies that one enable control to browser, inbox and outbox and that one secret
to their signing/validation settings. There are no independent direction-specific
environment controls to configure or emulate.

Deployment preflight requires all eight stored names: `DOCUMENTSERVER_IMAGE`,
`OCU_OFFICE_JWT_SECRET`, `OCU_OFFICE_DOCSERVER_URL`,
`OCU_OFFICE_DOCSERVER_ORIGIN`, `OCU_OFFICE_SELF_URL`, `OCU_OFFICE_PROXY_PORT`,
`OCU_OFFICE_FONTS_DIR` and `ENABLE_OCU_OFFICE_EDIT`, with either flag value.
Existing required-setting diagnostics and their relative order remain intact.
The flag accepts only `true` or `false`; the port is decimal in 1–65535 and the
browser origin follows the bootstrap absolute-origin rule. Image identity remains
owned by the existing release binding; no image default is introduced at startup.
Font-directory existence and listener inputs remain tasks30.3 and31.

Bootstrap and deployment admission share one implementation of the existing
origin and port validators. Extract them atomically without changing bootstrap's
accepted spellings, effective-port equality, defaults, error messages, secret
generation or output ownership. The proxy renderer's separate grammar is untouched.
Copied-source fixtures carry the helper so imported checkout execution remains
self-contained.

After resolving the actual Compose documents and before provisioning or starting
anything, require DocumentServer's resolved `JWT_ENABLED` to equal the string
`true`. Its resolved `JWT_SECRET` must be nonblank and equal both the supplied
bootstrap secret and OCU's resolved `OCU_OFFICE_JWT_SECRET`. Missing, disabled,
malformed or divergent values are admission failures. Check the documents whose
frozen snapshots are used for startup; do not re-resolve after admission. Errors
name the setting without echoing any input value or dumping environment blocks.
On refusal, retain existing engine state and remove only owned temporary snapshots.

Native Compose and controlled-engine entrypoint evidence prove configuration and
admission, not actual image JWT enforcement. Signed-request/image acceptance stays
with the real-image verification owner.

#### DocumentServer listener slice contract

Task31 uses container port8083, published through the required
`OCU_OFFICE_PROXY_PORT`, independently of the editing flag. The proxy reads
`OCU_OFFICE_PROXY_UPSTREAM` from `OCU_OFFICE_DOCSERVER_URL`; the canonical
`http://documentserver` origin means HTTP port80. Only this new upstream input
may omit the port; existing renderer input grammars remain unchanged.

The separate server uses cookie-only, bodyless authentication at an internal
location, then forwards the original request URI to its fixed DocumentServer
upstream. Auth401 remains401, auth403 denies403 and other failures deny500.
The internal auth location cannot be requested directly. Clear Authorization,
Cookie, X-OCU-Internal-Token, X-Chat-Id, X-User-Id and X-User-Email on the
DocumentServer hop, including client forgeries. Overwrite Host and
X-Forwarded-Host with the browser Host (including its published port),
X-Forwarded-Proto with the listener scheme, and X-Forwarded-For with the client
address. Do not trust client-supplied forwarding headers. The forwarded host
contains the public port rather than nginx's container listen port.

Preserve method, body, raw path/query and WebSocket upgrade; use explicit
3600-second read/send idle timeouts. Native evidence includes a connection
idle for more than60seconds followed by a successful ping/pong. The listener
does not interpret OCU paths: they still go only to DocumentServer. Neither
the gateway route table nor its existing owner/mutation policy changes.

The guard requires two distinct host-port mappings to container8082/8083 and
both fixed listener/upstream pairs. The smoke judges the two distinct TCP
port mappings, requiring one wildcardIPv4 entry per mapping and accepting
one optional wildcardIPv6 twin, not counting address-family entries as separate
ports. Missing, extra,
duplicated-family, wrong-target, wrong-host-port and non-proxy publications
remain failures. Every in-repo single-publication fixture migrates atomically.

Rollback is the paired source revision, not a dual-policy compatibility mode.
Rendering failures retain the prior private configuration; guard failures
precede startup. No image is built or run by source verification.

### D18. Release and backup

DocumentServer is the seventh role in the release inventory, of kind `pull` like PostgreSQL: identity recorded as image configuration digest and archive SHA-256, verified at import and at every start. No derived image is built.

The inventory's `format_version` rises to 2. A version-2 inventory has seven roles and the `font_bundle` field (D19); every inventory load — the release command line (build, import, verify), the deployment entry, and recovery when it restores or activates a retained release — requires version 2 and refuses a version-1 inventory (six roles, no font bundle) by naming the format version. No second format is carried. The only release with a version-1 inventory is the Plan 1 release, which never went live (user decision, 2026-10-02), so no retained release and no recovery set of that format exists.

#### Release-role cutover

Task28.1 uses the role key `documentserver` and runtime identity
`DOCUMENTSERVER_IMAGE`. The existing pulled-image planner/exporter owns it.
Its default is the selected upstream9.4.0 OCI index reference
`onlyoffice/documentserver@sha256:e3da62a847b9a5d51a11f73cfea1d9c13c3be3809614490d4edddcf01dcf919b`;
the index is not an image configuration digest. The existing linux/amd64 pull
and inspection path obtains the platform-specific configuration identity.

The tracked release module declares the default; planning reads that literal
from the selected committed source snapshot, not the running checkout.
Reuse the existing literal-assignment parser and pulled provenance fields:
the declaration file occupies the existing `build.dockerfile` field, as the
PostgreSQL compose declaration does. No fake Dockerfile or new inventory field
is introduced. DocumentServer provenance must identify that declaration,
its sole image-reference argument/default, no build overrides, and the matching
`upstream-image` material. Built-image provenance is rejected. Registry digests
remain optional metadata, never a substitute for configuration/archive identity.

The role order and runtime-variable map include all seven images. The service
map deliberately remains unchanged until the DocumentServer compose service
lands: a valid seven-image inventory must start with the existing compose set.
Bootstrap writes the seventh release assignment into its protected runtime
output; recovery clears stale captured identity and persists the selected
reference through its existing identity-key owner. The recovery-set format
number, writer/container inventory and deployment entry remain unchanged.

Task28.1 accepts the seven-role version2 inventory without a font bundle;
task28.2 adds that required field before any release deployment. Version1 is
rejected by every loader in both slices. Rollback uses another supported
complete release, not a format1 compatibility path or an in-place downgrade.

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

- **Pin.** `deploy/fonts/fonts.json`, tracked in the OCU repository, names each upstream archive (URL and SHA-256), the font files taken from it (name, SHA-256, size) and the licence file. The pinned release fonts are not tracked: they exceed the repository's 500 KB limit. Existing unrelated font assets are preserved; this change adds no font binary.
- **Build.** `release.py build` runs `deploy/fonts/prepare_fonts.py`, which downloads the pinned archives, checks every SHA-256 and writes `fonts.tar` holding exactly the listed files and the licence text. The inventory records it in the top-level field `font_bundle` (`path`, `sha256`), the shape `source_bundle` already has.
- **Import.** `import_release` copies `fonts.tar` into the stage, checks its SHA-256 against the inventory, extracts regular files only into `fonts/` in the install root, checks each file against `fonts.json` of the release's source, and removes the archive.
- **Start.** The release font directory is always `fonts` beside the installed inventory that `OCU_RELEASE_MANIFEST` names. The deployment entry derives `OCU_RELEASE_FONTS_DIR` from that at every start and exports it for compose, which mounts it read-only; it is not a stored setting, so nothing has to be remapped when a restore or a rollback selects another release root. The release check that `deploy/up.sh` already runs before any service starts (source, runtime binding, local images) also checks that this directory holds exactly the files of `fonts.json` with their SHA-256. A missing directory would otherwise be mounted empty and Chinese text would silently render in a fallback font.
- **Restore and rollback.** At activation recovery imports the selected release into its own root and publishes the inventory into the deployment root, with `source` as a link into the selected root. It places `fonts` beside the published inventory the same way, as a link to the selected root's `fonts/`.

A second, operator-owned directory (`OCU_OFFICE_FONTS_DIR`) holds fonts supplied by the deploying organisation (仿宋\_GB2312, 方正小标宋简体, 楷体\_GB2312; licences held by that organisation, recorded by B1 as stated) and is mounted the same way. Bootstrap creates it empty; the operator copies the supplied fonts into it. DocumentServer regenerates its font list at start. Neither repository nor the release package contains the supplied fonts. 宋体 and 黑体 are substituted by the two shipped families; substitution effects are recorded as fidelity notes.

Alternative rejected: a derived DocumentServer image with the fonts in a layer. It would reuse the existing build-material path, but the plan fixes the upstream image as unmodified, and the role would stop being a pulled image.

#### Font package cutover

Task28.2 completes the version2 contract: `font_bundle` is required everywhere an inventory is loaded. There is no fontless version2 compatibility path and no version3.

The pin contains an `archives` list. Each archive records its HTTPS release URL, SHA-256, byte size and selected `files`; each file records its archive member, flat installed name, SHA-256 and byte size. Selected installed names are unique across archives. Sans2.004 and Serif2.003 provide Regular/Bold SC OTFs and their licence texts, preserving common Office bold formatting without shipping every weight. Each family retains a separately named licence file.

`prepare_fonts.py` owns pin parsing and archive-to-bundle preparation. The build uses the selected committed pin, not the executing checkout's pin. Downloads and decompressed selected members are bounded by their pinned sizes. Only selected regular ZIP members enter the bundle; output TAR member order and ownership/timestamps are deterministic. The release's existing private publication stage contains failures.

Import verifies the copied bundle before Docker loads, using the pin from the reconstructed, verified source. Installed members must be regular files with exact names, sizes and hashes; duplicates, extras, directories, links and escaping names are rejected. The successful installation retains `fonts/`, not the bundle archive. Delivery verification checks this same material contract, rather than merely accepting the new inventory field.

Startup reads the pin from the already verified executing source and checks the `fonts` entry beside the manifest before deployment mutation. A plain directory is valid for an ordinary installation. A recovery link is valid only when it names the verified selected source root's sibling `fonts` directory; following an unrelated link with identical bytes does not establish ownership. Files inside the directory may not be links. The shell exports the lexical manifest-adjacent path after successful checking; Python-child environment changes cannot supply the export.

Recovery reuses the selected-root receipt and private inventory publication. It checks existing `fonts` entries before publishing or replacing anything, never overwrites a foreign directory/link, and verifies selected fonts when reusing an already imported release. Interrupted owned selection can resume; no second ownership receipt or release identity is introduced.

Verification uses small locally served archives and separately measured real upstream inputs. The synthetic pin is committed before fixture source identities are computed. Every source/delivery builder, including retained and hybrid builders, receives the same mandatory material contract. The tracked-file oracle rejects the pinned release-font names anywhere in either repository and font binaries under `deploy/fonts/`; change-scope verification rejects newly added font binaries elsewhere, without requiring deletion of existing assets.

#### Font mount slice contract

Task30.3 mounts release fonts at `/usr/share/fonts/truetype/ocu-release` and
operator fonts at `/usr/share/fonts/truetype/ocu-operator`. Both are long-syntax
binds with `read_only: true` and `bind.create_host_path: false`; neither hides
the upstream font tree or overlaps the other. Preserve the three named
DocumentServer data/cache/log volumes and allow no additional configured host bind.
The pinned Community Dockerfile places fonts under `/usr/share/fonts/truetype`;
the [official font instructions](https://helpcenter.onlyoffice.com/docs/installation/docs-install-fonts-docker.aspx)
use `/usr/share/fonts/`, and the pinned entrypoint regenerates fonts at startup.
This selects mount destinations without claiming actual renderer acceptance.

Resolve a relative `OCU_OFFICE_FONTS_DIR` against the deployment entry's invocation
working directory and export an absolute path before checking it or resolving
Compose. This keeps the checked and mounted source identical when the Compose
project directory differs. Preserve the stored spelling; do not infer bootstrap's
historical cwd or introduce an absolute-only restriction. Existing directory
symlinks remain accepted. Absolute stored paths avoid cwd-dependent activation.

Before engine mutation, require the operator source to be an existing directory;
missing, dangling and regular-file paths fail naming the setting. Empty directories
are valid. Do not create the source, modify its contents/metadata or auto-create it
during bind mounting. The operator makes this directory available on a restored
host at the retained configured path; it is not captured, remapped or recreated
by recovery.

Release-font derivation and ownership stay with task28.2. Verify a real restore
and activation using the selected release's manifest-adjacent `fonts` link and
inspect the executed frozen core mount sources. No stored configuration carries
`OCU_RELEASE_FONTS_DIR`. Native Compose checks the actual mount structure; controlled
engine startup proves configuration selection, not font loading in a running image.

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

#### Office listing URL compatibility

The Office listing producer uses the existing URL-quoting convention for logical path segments, preserving path separators and the configured public prefix. Spaces and parentheses in deduplicated names are encoded in URL data, not changed in logical path, file_id or stored content. Do not special-case a name or normalize malformed responses in the consumer.

Both conflict save-as and automatic close save-as share this producer. Their emitted URL must satisfy the unchanged workspaceFileUrl/listWorkspaceFiles consumer and retrieve the entry's bytes through the existing prefix-stripping gateway. Original-file conservation remains scenario-specific: conflict save-as retains the original; automatic close save-as keeps the old path absent. Existing session, revision, version and file-serving behavior is unchanged.

The owning HTTP smoke checks the complete canonical URL and fetches that returned URL after the same single prefix removal the gateway performs, comparing bytes/length/hash and retaining original identity checks. A disposable browser proof invokes the real unchanged workspace client against authenticated gateway responses for both scenarios and downloads the returned resource. It reuses the existing isolated harness without altering discovery, routes or headers.

Captured conflict-browser failure supplies integration RED; a new owning smoke assertion must also fail before the producer fix. After this prerequisite merges, resume the preserved conflict UI and rerun its original complete browser case. No claim of a real DocumentServer, deployment or completed conflict UI is made by this producer-only repair.

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

Task18.1 changes only successful file responses at the existing download handler:
inline and forced-download branches each emit exactly one `Cache-Control: no-store`.
It does not introduce middleware that would also change archives or denials.

Preserve body bytes, MIME inference, active-type inline filename encoding, passive
disposition behavior and forced attachment semantics. All five active inline MIME
types retain exactly the fixed CSP and nosniff; passive and forced-download
responses retain absence of those isolation headers. Preserve file path admission,
authorization, archive payload/headers, 401 and 404 responses without new cache policy.

The governing invariant is fresh successful file bytes without weakening inherited
isolation or changing unrelated response surfaces. Sibling surfaces under evidence
are the separate archive handler, auth denial, missing-file handling, both XML MIME
variants and Files listing/preview consumers; their implementations remain unchanged.

Extend the existing header tests, not a second header suite. Record RED for the
missing cache policy before changing the handler. Verify exact raw header count,
current bytes after same-size replacement and restored mtime, including requests
carrying the first response's validators. Capture unchanged archive/error behavior
before implementation and compare it afterward through an actual local HTTP server.
No real editor or deployment is required for this isolated response contract.

## Risks / Trade-offs

- **B1 can invalidate the editor choice after the specs are written.** → B1 is a DAG root and gates every Office task; B0 is independent and still delivers value.
- **Permanent divergence from upstream OCU on 25 files.** → Accepted by the user. The change is mechanical (a path string) and confined to one commit set, so a rebase conflict is resolvable by re-applying the rename.
- **A model writes to an old path by habit.** → The write fails loudly (`/mnt/user-data` is not writable); the system prompt names only the new path.
- **The Agent can modify or delete an uploaded original.** → Intended. WebUI keeps the attachment; the first edit session stores the pre-edit content as a version.
- **WebUI's stored attachment and content already injected into the model context go stale after an edit.** → Out of scope (Non-Goals); stated in the user notes.
- **Pause freezes user processes.** → Target below one second; five-second safe-boundary budget, not a hard wall-clock guarantee. Blocking calls can extend the pause; owned-marker recovery proceeds after the chat lock is available.
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
