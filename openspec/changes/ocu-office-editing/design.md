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

## Decisions

### D1. One change, one epic, in the WebUI repository

As in Plan 1 (its D2). Issues carry `[webui]`, `[ocu]` or `[deploy]` and the label `plan2`. Work packages: B0 workspace unification, B1 release verification, B2 broker core, B3 publish, B4 frontend, B5 deployment and acceptance. B0 and B1 are independent roots. Every B2+ task depends on B1; every task that relies on the shared directory depends on B0.

Alternative rejected: a separate change for B0 first. It costs a second full pipeline run, and the Office broker's editable root is defined by B0 anyway.

### D2. One shared directory, mounted at `/mnt/user-data/files`

The host directory `{BASE_DATA_DIR}/{chat_id}/outputs` is the single workspace files directory. It is bind-mounted read-write at `/mnt/user-data/files`. `/mnt/user-data/uploads` and `/mnt/user-data/outputs` are not created in the image and not mounted; `/mnt/user-data` is owned by root and not writable by the sandbox user, so a habitual write to an old path fails instead of landing in the container layer. `/home/assistant` stays the Agent's private working directory on its named volume.

Every reference to the old paths is updated: the sandbox image's directory setup and embedded agent configuration, the system prompt, `mcp_tools` text, the three public skills that name them, the recovery mount map, tests and docs. The host directory keeps its name so the outputs broker, `/files`, `/api/outputs`, the proxy rows and the WebUI client are unaffected.

Alternatives rejected: mounting one directory at both old paths (no prompt changes, but a copy from one path to the other truncates its own source); two writable directories (every single-root assumption of Plan 1 changes and the split stays visible); renaming host directory and HTTP interfaces too (rework of accepted Plan 1 surface for no visible gain). The name `workspace` is avoided because the system prompt already uses it for `/home/assistant`.

### D3. Uploads land in the same directory; attachments are imported once

`POST /api/uploads/{chat_id}/{path}` writes into the shared directory under the per-chat lock. The bytes go to a dot-prefixed temporary file in the target directory; the final name is then claimed with a no-replace operation (a hard link to the final name, which fails when any entry already exists there, followed by removal of the temporary name). A plain rename is not used: sandbox writers do not take the lock, and a rename would replace a file the Agent created in between. If the name is taken the next deduplicated name (`name (2).ext`) is tried and the response returns the final name. The outputs broker detects the addition on its next reconcile; no explicit registration is needed.

Attachment sync: the tool sends the WebUI file id with each upload (`X-OCU-Attachment-Id`). OCU keeps import receipts in `{chat}/.ocu/imports.json` (attachment id → stored name, time). An id with a receipt is acknowledged without writing. `GET /api/uploads/{chat_id}/imports` (internal token, not proxied) returns the imported ids so the tool uploads only attachments that have none. The tool syncs whenever the tool call carries attachments, not only when the command text mentions an uploads path. If the read of the imported ids fails the tool uploads every attachment; the server-side receipt check keeps that safe. The file is placed and its receipt written inside one locked section; a crash between the two leaves a file without a receipt, and the next sync imports the attachment again under a deduplicated name. That is accepted: the failure produces a duplicate, never a loss.

`GET /api/uploads/{chat_id}/manifest` and `.../list`, their two proxy rows and the standalone SPA's upload list are deleted: the files are in the Files listing. A direct request to OCU for either path gets 404 or 405 (the upload `POST` route still claims the path shape); no handler is kept only to turn 405 into 404.

The MCP resource surface (`uploads.py`, `mcp_resources.py`, URI `file://uploads/{chat_id}/…`) keeps its URI shape and reads the shared directory instead of the removed host `uploads` directory, skipping hidden names. Without this it would silently become empty.

Alternative rejected: skip when a same-named file exists. It re-imports a file the user deleted or renamed and silently ignores a different attachment with the same name.

#### Name-claim slice boundary

Task 1.1 changes the upload handler and one importable no-replace claim helper, with paired tests. It retains the chat's `uploads` destination, existing guard, traversal rejection, response fields and manifest/list consumers. The `filename` field reports the stored name; `size` and `md5` describe that file's bytes.

Invariant: publishing an upload never replaces or writes through an existing final directory entry, including an entry created by a writer outside the lock. The existing per-chat thread/filesystem lock serializes server workers; hard-link creation arbitrates the final name against unlocked writers.

Sibling surfaces are lifecycle operations sharing `_combined_lock`, manifest/list readers, the deployed attachment tool, and later `save_as` callers of the helper. No consumer is migrated in this slice. Tests cross the upload HTTP boundary and exercise separate processes as well as threads. Failure injection covers temporary-file cleanup; traversal rejection must leave external content unchanged. Receipts, mount changes, proxy routes and Office callers are non-goals.

### D4. ONLYOFFICE Docs Community v9.4.0, gated by B1

Unmodified upstream image, AGPL v3, branding kept. B1 produces a dated record: image identity, licence terms read, official minimum vs measured headroom on the acceptance machine, open/edit/export of deterministic DOCX/XLSX/PPTX samples, behaviour at the 20-connection cap and whether usage is queryable, delay between last close and the status-2 callback, the origin of the download address in status-2 and status-6 callbacks, the editor event that signals the connection cap, the memory and swap present on the acceptance machine, whether the image's shutdown-preparation command saves and closes every open document, the command's name, and whether a restart clears the shutdown-preparation mode, whether the editor works when the proxy withholds the WebUI cookie, whether `forcesave` echoes `userdata`, whether the editor's own save command produces a callback with user-initiated force save off, the minimal iframe sandbox and permission set the editor needs, and the fonts loaded. Five observations are assumptions this design is built on, and each must hold for a go: `forcesave` echoes `userdata`; a shutdown-preparation command exists that saves and closes every open document; a restart clears that mode; the editor's own save produces no callback; the editor works without the WebUI cookie. If B1 fails, work stops and returns to the plan; there is no automatic switch to Collabora.

### D5. The broker is an in-process package with per-chat file state

`computer-use-server/office/`. State for a chat lives in `{BASE_DATA_DIR}/{chat_id}/.ocu/office/`:

- `state.json` — documents, sessions, save receipts and the commit journal; schema-versioned; every read-modify-write under `_combined_lock(chat)`; written by temp file, fsync, `os.replace`, directory fsync (the outputs broker's pattern).
- `versions/{sha256}` — immutable version blobs, content-addressed.
- `staging/` — downloads in progress.
- `fence.json` — the stale-fence marker (D12).

`.ocu` is outside the mounted directory, so the sandbox cannot read or alter history. State and blobs share one filesystem, so there is no cross-store transaction; the journal covers the one multi-step operation (publish).

Alternatives rejected: PostgreSQL (new dependency, migration job, backup extension, two-store crash consistency); SQLite (still two stores, new failure modes under two workers). Cost accepted: no cross-chat query.

### D6. Versions and terminology

`revision` keeps its Plan 1 meaning: the per-chat change counter of the outputs broker. The broker's immutable snapshots are **versions**. A document is keyed by the Plan 1 `file_id`. A version has a per-document monotonic number, parent, SHA-256, size, source (`workspace`, `save`, `autosave`, `close`, `restore`, `conflict`), time and a published flag. `conflict` is the source of the first version of the new document that a `save_as` creates.

When a session is created the workspace file is hashed; if its content differs from the document's newest version, a version with source `workspace` is recorded (the blob is shared when the content was stored before). This captures what the Agent or an upload produced, so history always holds the pre-edit content and an overwrite never destroys the only copy.

Persisted content whose SHA-256 equals the document's latest version adds no version record; the save receipt points at the existing version. A version is `published` when the workspace file was replaced by it, or, for a `workspace` version, because it is the workspace content.

Versions are not deleted automatically. Before storing a blob the broker checks free space against a configured floor and refuses with an explicit error when below it.

Every host-side read of the edited workspace file (the capture at session creation, the status poll's hash, the hash inside the fence, the captures before an overwrite and a restore) opens the file without following a symlink, checks that it is a regular file inside the chat's workspace files directory and that no parent component is a symlink. A file that fails the check is never read: creation, overwrite and restore refuse with `unsafe_path`, the status poll reports `workspace_changed`, and a publish treats it as a baseline mismatch.

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

Connection cap. When the B1 record shows that usage can be queried, the broker checks it before creating a session and before a join and refuses with `connection_limit`. In every case the host page also maps the editor's own refusal (the event the B1 record names) to `refused` with reason `connection_limit`; it sends `close` when the session was not a join, which ends a never-opened session as above.

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
- **The 20-connection cap.** → New sessions are refused with a clear message, by the broker when usage can be queried and by the host page when the editor itself refuses; exact detection is a B1 output.
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
- Whether the connection cap is detected by DocumentServer's refusal or by a queried count — answered by the B1 record; the spec fixes the refusal behaviour on both paths.
- Which origin DocumentServer puts in a callback's download address — answered by the B1 record; the spec accepts both configured origins and always fetches from the server-to-server one.
- The measured delay between the last tab closing and the status-2 callback — answered by the B1 record; it sets the progress timeout shown by the UI, not the protocol.
