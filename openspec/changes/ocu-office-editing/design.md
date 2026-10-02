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
- Prefixes: `[webui]` = this repository; `[ocu]` = sibling checkout `open-computer-use` (branch `<tool>/plan2-<slug>` off its `main` at `9c35a8c`, tests in its `tests/`); `[deploy]` = OCU `deploy/`.

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
- Runtimes without `docker pause` (rootless cgroup limits, Kata, gVisor) and the stop → commit → start fallback.
- Showing or editing `/home/assistant` (the Agent's private scratch area).
- Migrating an environment that already holds chat data; the acceptance machine is wiped.
- Writing human edits back to WebUI's own file store or refreshing content already injected into a model context.
- Renaming the host directory `outputs` or the HTTP interfaces `/api/outputs`, `/files`, `/api/uploads`.
- Compatibility symlinks for the old sandbox paths.
- Capacity design for the 20-person production machine.
- Pruning of stored versions.
- Extending the per-chat lock to tool execution.
- Server-side re-check of ownership when a DocumentServer callback arrives.

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

### D4. ONLYOFFICE Docs Community v9.4.0, gated by B1

Unmodified upstream image, AGPL v3, branding kept. B1 produces a dated record: image identity, licence terms read, official minimum vs measured headroom on the acceptance machine, open/edit/export of deterministic DOCX/XLSX/PPTX samples, behaviour at the 20-connection cap and whether usage is queryable, delay between last close and the status-2 callback, whether the image's shutdown-preparation command saves and closes open documents, whether the editor works when the proxy withholds the WebUI cookie, whether `forcesave` echoes `userdata`, that the editor's own save command produces no callback with user-initiated force save off, the minimal iframe sandbox and permission set the editor needs, and the fonts loaded. If B1 fails, work stops and returns to the plan; there is no automatic switch to Collabora.

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

When a session is created the workspace file is hashed; if that content is not already a version of the document it is stored with source `workspace`. This captures what the Agent or an upload produced, so history always holds the pre-edit content and an overwrite never destroys the only copy.

Versions are not deleted automatically. Before storing a blob the broker checks free space against a configured floor and refuses with an explicit error when below it.

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
| Every 5 minutes when the editor reported a modification since the last save request, driven by the editor host page | persist only; shown in history as auto-saved, not published                   |
| Leaving the editor (chat switch, sidebar close, editor close)                                                       | session close; when the final callback reports changes: persist, then publish |
| Page refresh or tab close with unpublished changes                                                                  | browser-native `beforeunload` prompt                                          |

The WebUI status bar button is the only save. The editor's own save command (Ctrl+S) is left as DocumentServer ships it with user-initiated force save off: it flushes the edit to DocumentServer and produces no callback, so it neither persists nor publishes. The host page cannot intercept it, because the editor runs in DocumentServer's own cross-origin frame, and a callback the broker did not request would have no `save_seq` and no way for the host page to know what it covered. The status bar therefore keeps showing unsaved after Ctrl+S, which is true; the content is published by the next save, or when the user leaves the editor. Known limitation, recorded in the user documentation.

A save or a close that finds nothing new since an auto-save still publishes: when DocumentServer reports nothing to save (or status 4), the session's latest stored version is published if it is not already. Otherwise an auto-saved version could never reach the workspace file.

`autoAssembly` stays off. The documented loss bound is 5 minutes: after a DocumentServer crash or restart, input since the last auto-save may be lost and the session becomes `orphaned`. There is no discard action; undo is a restore from history.

Alternative rejected: the plan's two-level model (save persists, a separate action publishes). A user who saves and then asks the Agent to continue would have the Agent read the old file.

### D9. Session, key, ordering, callback statuses

Session states: `opening → editing ⇄ saving`, `closing → closed`, plus `conflict`, `error`, `orphaned`. One open session per document; a second tab of the same user joins it with the same `document.key`. The key is stable for the life of the session and a new session gets a new key. A session records the restore epoch current at its creation (D18); a mismatch makes it `orphaned`.

The broker increments `save_seq` when it requests a save or a close and passes it to DocumentServer in the command's `userdata` together with the intent (`publish` or `persist`). A callback whose `save_seq` is lower than `last_committed_seq` is rejected and never moves a version backwards. A repeated callback with the same `save_seq` and content hash returns the first result. A status-6 or status-7 callback without a `save_seq` the broker issued is rejected. The final callback (status 2 or 4) carries no `userdata`; it takes the `save_seq` allocated by the close request, or the next one when the session ended without a close request (tab closed, browser crash). A save is accepted only while the session is `editing`, so one save is outstanding at a time; the host page waits and retries when an auto-save is in flight.

| Status | Handling                                                                          |
| ------ | --------------------------------------------------------------------------------- |
| 1      | update participants                                                               |
| 2      | final close with changes: persist, then publish; session `closed` (or `conflict`) |
| 3      | record final-save failure; session `error`                                        |
| 4      | closed without changes; session `closed`                                          |
| 6      | forcesave result: persist; publish when the recorded intent is `publish`          |
| 7      | record forcesave failure; session stays `editing` with the error surfaced         |
| other  | change nothing; record a diagnosable error                                        |

`POST .../close` records the intent only; the session ends when DocumentServer reports status 2 or 4. If another tab is still connected, DocumentServer reports status 1 with the remaining participant and the session returns to `editing`. The host page destroys its editor only after the close request was accepted, so that status 1 cannot arrive before the close is recorded. When a document is reopened and DocumentServer no longer knows the session's key, the session is `orphaned` and a new one is created.

At the connection cap a new session is refused with an explicit reason. How the cap is detected (DocumentServer's own refusal or a queried count) is fixed by the B1 record.

### D10. Persist pipeline

Validate the callback (JWT, session, `save_seq`) → download only from the configured DocumentServer server-to-server origin, rejecting any other host, validating every redirect hop, with timeout and size limit → check size, type and OOXML container structure → stage and fsync → store the version blob and the save receipt under the lock. The callback is acknowledged as successful only after the version is durable; anything else returns an error so DocumentServer retries.

### D11. Publish: fence, compare, atomic replace

Always under `_combined_lock(chat)`:

1. Run the outputs broker's reconcile (the lock is re-entrant), so a rename made since the last listing is in the index, and resolve the document's path from its `file_id`. An id that no longer resolves is a conflict (D13) and the publish ends here. Otherwise write the journal intent (document, version, target path, temporary file name, expected baseline hash).
2. If the sandbox is running: write `fence.json`, `pause`, reload and verify `State.Paused`. A pause failure is a publish failure; the version stays stored and the publish can be retried.
3. Hash the current workspace file at the resolved path.
4. If the file is missing there or the hash differs from the session baseline: conflict (D13), nothing is written.
5. Otherwise write the blob to a dot-prefixed temporary file in the target directory opened with `O_CREAT|O_EXCL|O_NOFOLLOW`, fsync, `lstat` every parent component (a symlink or a resolved path outside the chat's directory aborts), `os.replace`, fsync the directory.
6. Register the write with the outputs broker so the entry's hash and `revision` are updated in the same locked transaction.
7. `unpause`, remove `fence.json`, write the journal completion, set the session baseline to the published hash.

Reconcile and resolve run before the pause so that directory scanning and hashing of unrelated files do not count against the pause window. A rename in the gap between resolve and pause leaves no file at the resolved path and becomes a conflict, which is safe.

Target window under pause: below 1 second. Past 5 seconds the publish is failed and the sandbox is unpaused. When the sandbox is not running the same steps run without pause; `launch` takes the same lock and therefore waits.

On startup and before any publish the journal is inspected: an intent without completion is completed if the workspace file already equals the version, otherwise it is discarded and the session keeps its unpublished version. Either way the temporary file the intent names is removed.

There is no retry route. After a failed publish the version stays stored: following a save the session is `editing` with the failure as its reason, and saving again publishes it; following a close the session is `error`, and the version can be published by a restore from history.

Restore runs the same fence. It first stores the current workspace content as a `workspace` version if that content is not yet a version, then publishes the chosen one as a new version. It is refused while a session is open on the document and when the path no longer exists.

The outputs broker gains two operations used here: resolve a `file_id` to its current path (a read of the persisted index; no scan, no hashing), and register a host-side write for a path. Registering a path that has no active entry creates one with a new `file_id`; this is how a `save_as` copy (D13) gets its identity.

### D12. Stale-fence recovery, and why nothing else needs to yield

`fence.json` records when the pause began. OCU's startup sweep and the existing idle-reclamation poll take the chat lock, and if they find a marker older than the 5-second limit they unpause the sandbox and remove the marker. A broker crash therefore cannot leave a sandbox frozen for longer than one poll interval.

The retention guard, the cleanup cron and recovery do not check a lease. The retention guard only stops containers, which removes writers and cannot corrupt a replace; the following `unpause` fails harmlessly. Cold backup requires every writer including OCU to be stopped, so no publish is in flight. The upstream cleanup cron is disabled in the overlay.

### D13. Conflicts and the change notice

The user's content is always stored as a version before a conflict is reported. `POST .../resolve` then accepts:

- `save_as` (default): publish the version to a new, deduplicated file name next to the original (in the workspace root when the original directory is gone), claimed without replacing as in D3; the session continues on the new document.
- `overwrite`: store the current workspace content as a version (source `workspace`), then publish over it. The UI asks for a second confirmation.

When the original path no longer exists only `save_as` is accepted; a deleted path is never recreated under its old name. A conflict met by the unattended publish at close is kept on the document and offered the next time that file is opened. Resolving a conflict whose editor has already ended closes that session; editing again is an ordinary new session on whichever file the user opens.

While a session is open, `GET .../sessions/{session}` checks the one file being edited: `stat` first, hash only if size or mtime changed since the last check, and reports `workspace_changed` when the hash differs from the baseline. The last-checked size and mtime are cached in the session record; that bookkeeping is not a user-visible change, so the row stays non-mutating in the proxy table. The notice is a convenience. Safety comes from step 4 of D11, which always hashes. Hashing happens only at session creation, at publish and in this poll; the regular reconcile is unchanged, so the Plan 1 blind spot for same-size edits in the sidebar preview remains.

### D14. Revocation

A user who has lost access is denied new requests by the proxy, and tickets expire. The final callback of a session that was already open still publishes to the same chat: the content was written while authorized and chat ownership cannot move. If the chat's workspace files directory is gone while its Office state remains, the version is kept and no file or directory is recreated. If the chat's whole data directory is gone, the session is unknown and the callback creates nothing; the handler checks for the directory before taking the per-chat lock, because taking the lock would recreate it. Logout is not an immediate revocation (Plan 1 deviation, unchanged).

### D15. Editor embedding

A new iframe class in `WorkspaceArtifact`, separate from the generated-document frame and the trusted preview frame. Its `src` is the OCU preview page in a new mode (`?embed=office`), which loads the DocumentServer JS API from the DocumentServer origin and creates the editor from the signed configuration returned by session creation. The frame is created once per edit action and is never keyed by `revision`, path or mtime, so a publish does not rebuild the editor; the session id, which the child page obtains after the frame exists, does not rebuild it either. Editing again after a session ended uses a new frame. Its sandbox attribute is fixed in code and never derived from `$settings.iframeSandbox*`; the exact token list comes from the B1 record.

Messages, exact key sets, validated by source, origin, chat and generation as in the Plan 1 preview protocol:

| Direction      | Message              | Fields                                                                                    |
| -------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| child → parent | `ocu:office-ready`   | `type, chat_id`                                                                           |
| parent → child | `ocu:office-open`    | `type, chat_id, file_id, generation`                                                      |
| child → parent | `ocu:office-state`   | `type, chat_id, file_id, generation, session_id, state, dirty, workspace_changed, reason` |
| parent → child | `ocu:office-command` | `type, chat_id, generation, command` (`save` or `close`)                                  |

A page instance accepts one `ocu:office-open`; a command must carry that open's generation. `file_id` in state messages is always the one from the open, also after a `save_as`. `dirty` means unpublished content exists; the auto-save timer instead fires when the editor reported a modification since the last save request. `session_id` and `reason` are null when there is nothing to report.

The host page owns session creation, the status poll, the 5-minute auto-save timer and the save/close calls. On `close` it also destroys the editor instance, because DocumentServer sends the final callback only after the participant has left. The parent owns versions, restore and resolve calls and the status display. When the frame is destroyed before the session has ended (chat switch, sidebar close), the parent's guard module keeps the session id and reads the session status through its own client until a final state or the progress timeout. The read-only Files embedding and its protocol are not changed.

### D16. WebUI surface

- `WorkspaceArtifact`: an 编辑 action on DOCX/XLSX/PPTX entries; while editing, a status bar with state text, save, history, maximize.
- Maximize is an overlay inside the WebUI page, not the Fullscreen API.
- History lists versions with source and published flag and offers restore; restore is refused while a session is open on the document. History is reachable from the file entry when the file is not being edited, as well as from the status bar.
- Unsaved-state guard: `beforeunload` while unpublished changes exist; chat switch and sidebar close send `close` and show progress. The hooks in `ChatControls.svelte` and `Chat.svelte` are minimal calls into a new module.
- Feature flag `ENABLE_OCU_OFFICE_EDIT`, default false, exposed through the config features object like `enable_ocu_workspace`. With the flag off no edit entry is rendered and no Office request is made. A value that is neither true nor false fails startup (AGENTS.md: misconfiguration fails loud); the existing workspace flag's lenient parsing is not changed here.
- A new client module `src/lib/apis/ocu/office.ts` and chat-keyed store state beside the workspace store.

### D17. DocumentServer placement and origin

DocumentServer is a compose service on the control-plane network only, with no host publication and no Docker socket. The proxy publishes a second port whose listener forwards to DocumentServer, including WebSocket upgrade. Every request on that listener passes session authentication (`/api/v1/auths/` with the browser cookie; cookies are not port-scoped). Browsers therefore see DocumentServer on a different origin from WebUI, so script running in the editor origin cannot read WebUI's `localStorage` token. The listener uses the WebUI session cookie for the authentication subrequest only and does not forward it to DocumentServer, a third-party image that has no use for the user's WebUI credential; B1 confirms the editor works without it.

The deployment has one shape. Once B5 lands, DocumentServer, the second listener and the second port are always present, whether the WebUI flag is on or off; the flag only decides whether WebUI offers editing. A conditional service would make the proxy configuration, the port guard, the smoke and the release inventory each carry two variants, and nginx refuses to start when a rendered upstream does not resolve. Cost accepted: DocumentServer uses memory while the flag is off.

JWT is enabled in both directions with a secret generated by bootstrap. The broker reaches DocumentServer's command service and download URLs on the control-plane address; DocumentServer reaches the broker's two control-plane routes the same way. The port guard changes from exactly one proxy publication to exactly two.

Alternatives rejected: a same-origin path prefix (the editor frontend, which renders documents an injected Agent can craft, would share WebUI's origin); a subdomain (needs LAN DNS, which the deployment does not have).

### D18. Release and backup

DocumentServer is the seventh role in the release inventory, of kind `pull` like PostgreSQL: identity recorded as image configuration digest and archive SHA-256, verified at import and at every start. No derived image is built.

Backup first asks DocumentServer to save and close every open document, using the shutdown-preparation command the image ships (B1 confirms it for this image), so the final callbacks persist and publish while OCU is still running; a failure of that step fails the backup. It then stops DocumentServer with the other writers. Checking that users' sessions ended as expected is a runbook step, not a machine gate. DocumentServer's data volume is not part of the recovery set. The broker's state and versions are inside the chat-data component already. Restore writes a new restore epoch under the chat-data root; the broker treats every session created under an older epoch as `orphaned`, so no pre-restore callback is replayed.

One-version rollback verifies the images that the selected release's own inventory records: six for a release that predates DocumentServer, seven afterwards. A rollback across B0 also needs the sandbox containers created by the newer release removed by the operator (their mount set differs); the workspace volumes and chat data stay.

### D19. Fonts

The release carries open-source CJK fonts in a directory mounted into DocumentServer. A second, operator-owned directory holds fonts supplied by the deploying organisation (仿宋\_GB2312, 方正小标宋简体, 楷体\_GB2312; licences held by that organisation, recorded by B1 as stated) and is mounted the same way. DocumentServer regenerates its font list at start. Neither repository nor the release package contains the supplied fonts. 宋体 and 黑体 are substituted; substitution effects are recorded as fidelity notes.

### D20. Acceptance machine

The existing 4 vCPU / 7.4 GiB / 33 GiB machine with 4 GB swap. Its memory plan assumes one running sandbox at a time instead of two. OCU has no setting that limits concurrent sandboxes and this change adds none: the figure is an operating constraint of the acceptance run, recorded with the deviation, not an enforced limit. The machine is below DocumentServer's official minimum; B1 records both figures. It is an acceptance environment, not a capacity proof.

### D21. Verification strategy

PR CI runs broker tests against recorded callback fixtures and a fake Docker client, proxy renderer tests, Vitest component tests and Playwright against the deterministic stub. A local `make verify-office` target starts a real DocumentServer and runs the three-format round trip; its evidence is pasted into PRs. The B-T01–B-T16 matrix runs on the acceptance machine. Exported files are reopened by the script with a second implementation, LibreOffice headless; a missing LibreOffice fails the target. Desktop Office is supplementary evidence only.

### D22. `/files` cache policy

`GET /files/{chat_id}/{path}` responses carry `Cache-Control: no-store`, so a preview after a publish cannot come from a cache keyed on mtime and size.

## Risks / Trade-offs

- **B1 can invalidate the editor choice after the specs are written.** → B1 is a DAG root and gates every Office task; B0 is independent and still delivers value.
- **Permanent divergence from upstream OCU on 25 files.** → Accepted by the user. The change is mechanical (a path string) and confined to one commit set, so a rebase conflict is resolvable by re-applying the rename.
- **A model writes to an old path by habit.** → The write fails loudly (`/mnt/user-data` is not writable); the system prompt names only the new path.
- **The Agent can modify or delete an uploaded original.** → Intended. WebUI keeps the attachment; the first edit session stores the pre-edit content as a version.
- **WebUI's stored attachment and content already injected into the model context go stale after an edit.** → Documented limitation.
- **Pause freezes user processes.** → Window under 1 second, hard limit 5 seconds, stale-fence recovery on the next poll.
- **A same-size, forged-mtime Agent edit is not noticed while editing.** → The publish-time hash still catches it; only the convenience notice is missed.
- **DocumentServer below its official minimum on the acceptance machine.** → Recorded deviation; the acceptance run keeps at most one sandbox running; production capacity is not claimed.
- **The 20-connection cap.** → New sessions are refused with a clear message; exact detection is a B1 output.
- **Two workers and file state.** → Every transition is a locked read-modify-write of one file; no in-memory session state.
- **A second published port widens the LAN surface.** → Session authentication on the listener, DocumentServer JWT, and DocumentServer itself still publishes nothing.
- **Version blobs grow without pruning.** → Content-addressed, free-space floor checked before every store, refusal instead of partial writes.

## Migration Plan

1. B0 ships with a rebuilt sandbox image and the updated OCU server and tool. On the acceptance machine existing chat data, containers and volumes are removed before the first start; no migration runs.
2. B1 runs against an isolated DocumentServer and produces the verification record and a go/no-go.
3. B2–B4 land behind `ENABLE_OCU_OFFICE_EDIT=false`. B5 adds DocumentServer to the overlay, the release inventory and backup, then enables the flag on the acceptance machine and runs the matrix.
4. Rollback: turn the flag off; read-only preview and all stored versions remain; published files stay usable. Rolling back B0 means the previous sandbox image and server, and recreating sandbox containers.

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

- How version history should be pruned or exported once disk use matters.
- What the production machine for 20 users must provide; capacity is a measurement that has not been made.
- Whether and how a human edit should be reflected in WebUI's own file store and in content already extracted for retrieval.
- Upgrading an environment that already holds chat data to the single-directory layout.
- Fidelity recording format for pagination and font-substitution differences beyond the B1 notes.

## Open Questions

- The exact iframe sandbox tokens and permission-policy features the editor needs — answered by the B1 record; the spec fixes that the list is constant and code-defined.
- Whether the connection cap is detected by DocumentServer's refusal or by a queried count — answered by the B1 record; the spec fixes the refusal behaviour.
- The measured delay between the last tab closing and the status-2 callback — answered by the B1 record; it sets the progress timeout shown by the UI, not the protocol.
