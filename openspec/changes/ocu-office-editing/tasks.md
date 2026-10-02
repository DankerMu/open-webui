# Tasks

Prefixes: `[webui]` = this repo; `[ocu]` = sibling checkout `open-computer-use` (branch `<tool>/plan2-<slug>` off `main` at `9c35a8c`; tests in the OCU repo root `tests/`, run with the command in its `AGENTS.md`); `[deploy]` = OCU repo `deploy/` overlay (tests in `tests/deploy/` and `deploy/proxy/tests/`). Every production file ships with its test file in the same task (AGENTS.md § TDD). A decision record named in a task lives in this repository's `docs/decisions/` and ships under `make decisions-verify` with the same issue, also when the code is in the OCU repo. Work packages: B0 = groups 1–7, B1 = group 8, B2 = groups 9–12, B3 = groups 13–16, B4 = groups 17–23, B5 = groups 24–31. Groups 9–31 depend on group 8 (design D1). Fixture-level vocabulary: `.claude/skills/subagent-workflow/references/issue-risk-contract.md`.

## 1. [ocu] Single workspace files mount (spec: ocu-unified-files)

- [ ] 1.1 `docker_manager.py`: bind the chat's host `outputs` directory read-write at `/mnt/user-data/files` and stop mounting `/mnt/user-data/uploads` and `/mnt/user-data/outputs`; update the recovery mount map in `deploy/recovery_resources.py`. Verify: `tests/orchestrator/test_lifecycle.py` asserts the created container's mount set (one user-data bind, read-write, no legacy binds) and `tests/deploy/test_recovery.py` asserts the map; both pass.
- [ ] 1.2 Sandbox `Dockerfile`: create `/mnt/user-data/files` owned by the sandbox user, leave `/mnt/user-data` root-owned and not writable by that user, stop creating the two legacy directories, and move the skill-usage log to the new path. Verify: `tests/integration/test_workspace_lifecycle.py` gains cases run against a locally built `linux/amd64` image — the new path is writable, the legacy paths do not exist, creating a legacy path fails — and their output is attached to the PR.
- [ ] 1.3 Decision record `ocu-unified-workspace-files` (design D2, D3: one directory, no legacy paths, accepted upstream divergence). Verify: `make decisions-verify` and `make doc-gate` pass.

Suggested fixture level: expanded - file IO and path layout of a shared mount, legacy compatibility deliberately broken.
Minimal mergeable slice: 1.1 (server mount and recovery map with their tests) - green alone because the tests use the fake engine and no caller depends on the legacy binds in tests; 1.2 needs an image build and follows; 1.3 is documentation.

## 2. [ocu] Path references in prompt, tools, skills and docs (spec: ocu-unified-files)

- [ ] 2.1 Replace the legacy sandbox paths with `/mnt/user-data/files` in `system_prompt.py`, the `mcp_tools.py` tool text, the agent configuration and README embedded in the sandbox `Dockerfile`, and the public skills that name them (`file-reading`, `sub-agent`, `webapp-testing`, the example skill); state once that uploaded and generated files share this directory. Verify: the existing prompt and tool tests are updated to the new path and pass.
- [ ] 2.2 Update the OCU docs and diagrams that name the legacy paths, and add a repository test that fails on any tracked reference to `/mnt/user-data/uploads` or `/mnt/user-data/outputs` outside a short explicit allowlist. Verify: the guard test passes and fails when a legacy reference is reintroduced (shown once in the PR).

Suggested fixture level: compact - text and documentation only; the behaviour they describe is owned by group 1.
Minimal mergeable slice: 2.1 (prompt, tool text, image-embedded config, skills) - green alone because it changes strings covered by existing tests; 2.2's guard can only pass after 2.1.

## 3. [ocu] Uploads into the workspace directory with import receipts (spec: ocu-unified-files)

- [ ] 3.1 `POST /api/uploads/{chat_id}/{path}` writes into the shared directory under the per-chat lock through a dot-prefixed temporary file and a no-replace claim of the final name (hard link, not rename), never overwrites, and returns the final (possibly deduplicated) name; `uploads.py` and `mcp_resources.py` list and read the shared directory, skipping hidden names, with the `file://uploads/{chat_id}/…` URI shape unchanged. Verify: new tests cover a fresh name, a collision, two concurrent uploads of one name, a same-named file created by a writer that holds no lock between the check and the claim, a symlink occupying the name, traversal rejection, the MCP resource listing, and that the uploaded file appears in `GET /api/outputs/{chat_id}`.
- [ ] 3.2 Import receipts: honour `X-OCU-Attachment-Id`, persist receipts beside the broker index, add `GET /api/uploads/{chat_id}/imports` behind the internal token, and teach `auth_guard` the route shape. Verify: tests show a second upload with the same id writes nothing, an edited / renamed / deleted import is neither overwritten nor recreated, a colliding name is deduplicated, and the imports route rejects a missing token.

Suggested fixture level: expanded - file writes into shared state, overwrite safety, a new guarded route.
Minimal mergeable slice: 3.1 (endpoint target and deduplication) - green alone because the tool still works against it; 3.2 adds receipts on top.

## 4. [ocu] Tool attachment sync imports once (spec: ocu-unified-files, ocu-tool-auth)

- [ ] 4.1 `openwebui/tools/computer_use_tools.py`: read the imported ids, upload only attachments without a receipt and send their WebUI file id, and sync whenever the tool call carries attachments instead of matching path text. Verify: `tests/test_tools.py` proves an already imported attachment is not uploaded again after the stored file changed, a new attachment is uploaded once with its id, every request carries the internal token, and the manifest endpoint is no longer called.

Suggested fixture level: expanded - shared tool entrypoint, credential carrier, overwrite behaviour.
Minimal mergeable slice: atomic - reading receipts and sending the attachment id are one behaviour; either half alone re-uploads every attachment under a deduplicated name on each call.

## 5. [ocu] Remove the upload read endpoints and the SPA upload list (spec: ocu-unified-files)

- [ ] 5.1 Delete `GET /api/uploads/{chat_id}/manifest` and `.../list`, their helpers and guard entries. Verify: the auth-guard matrix and path-traversal tests are updated, both paths return 404, and the remaining suite passes.
- [ ] 5.2 Remove the upload list block from the standalone preview's status panel; the upload action stays and refreshes the Files listing. Verify: the preview tests are updated and pass; a screenshot of the standalone panel is attached.

Suggested fixture level: compact - deletion of unused read paths after group 4 stopped calling them.
Minimal mergeable slice: 5.1 (server endpoints) - green alone because group 4 removed the last caller; 5.2 is the independent SPA cleanup.

## 6. [deploy] Proxy table without the upload read rows (spec: ocu-reverse-proxy)

- [ ] 6.1 Remove the manifest and list rows from `deploy/proxy/routes.json` and update the renderer's reviewed row count and table pin. Verify: `deploy/proxy/tests/` pass, including a case that the two paths return 404 without an upstream request and that the upload POST row still forwards.

Suggested fixture level: expanded - reviewed default-deny gateway table and its pin.
Minimal mergeable slice: atomic - the table, its row count and its pin are validated together by the renderer; a partial change does not render.

## 7. [webui] Stub, pin and smoke for the unified directory (spec: ocu-stub, ocu-proxy-smoke)

- [ ] 7.1 `scripts/ocu-stub.py`: drop the manifest and list routes and make uploads appear in the outputs listing under a deduplicated name; bump the OCU pin in `constraints.yaml`; update `scripts/smoke-proxy.py` and `smoke/proxy/*.hurl` so the upload chain no longer reads the manifest or list and the removed rows are asserted as 404 without upstream contact. Verify: `make smoke-stub` and `make smoke-proxy` pass.
- [ ] 7.2 Extend `e2e/ocu-workspace.e2e.ts`: a file uploaded through the proxied upload row appears in the Files panel. Verify: `make verify-ui-ocu` passes with a screenshot.

Suggested fixture level: compact - deterministic test infrastructure following an already reviewed table.
Minimal mergeable slice: 7.1 (stub, pin, hurl) - green alone because the pinned table and the stub change together; 7.2 adds one browser case.

## 8. [deploy] B1 release verification of DocumentServer (spec: ocu-office-verification)

- [ ] 8.1 Run the pinned DocumentServer image in isolation and write the dated verification record with every item of design D4: image identity, licence terms read, official minimum against measured headroom on the acceptance machine, open / edit / export of deterministic DOCX, XLSX and PPTX samples, behaviour at the connection cap and whether usage is queryable, delay to the status-2 callback, whether the image's shutdown-preparation command saves and closes open documents, whether the editor works when the proxy withholds the WebUI cookie, whether `forcesave` echoes `userdata`, that the editor's own save command produces no callback with user-initiated force save off, the minimal iframe sandbox and permission set, and the fonts loaded with their source. Verify: the record exists with each item filled or explicitly marked not measured, and `make doc-gate` passes.
- [ ] 8.2 Decision record `ocu-office-editor-selection` stating go or no-go and citing the record. Verify: `make decisions-verify` passes; on no-go the epic is updated and no group 9–31 issue starts.

Suggested fixture level: none - measurement and documentation; no runtime behaviour in either repository.
Minimal mergeable slice: atomic - the go/no-go decision is the gate and is only meaningful with the record it cites; both are documentation in one PR.

## 9. [ocu] Office broker store (spec: ocu-office-store)

- [ ] 9.1 `office/` package with the per-chat state file: schema version, locked read-modify-write through the shared per-chat lock, atomic durable replace, explicit failure on corruption that preserves the prior state. Verify: tests cover two processes updating one chat without loss, a corrupt file, a failure before replace, and restart persistence.
- [ ] 9.2 Versions and receipts: content-addressed immutable blobs, per-document numbering, sources and the published flag, the `workspace` version taken when content is unknown, the free-space floor, save receipts. Verify: tests cover identical content stored once, numbering, refusal below the floor without partial blobs, and receipt lookup by sequence and hash.
- [ ] 9.3 Decision record `ocu-office-file-store` (design D5: per-chat files instead of a database). Verify: `make decisions-verify` passes.

Suggested fixture level: expanded - persisted shared state, file format, concurrency across worker processes.
Minimal mergeable slice: 9.1 (state file and locking) - green alone because nothing reads it yet; 9.2 builds on its API; 9.3 is documentation.

## 10. [ocu] DocumentServer configuration and client (spec: ocu-office-sessions, ocu-office-callback, ocu-auth-guard)

- [ ] 10.1 Office configuration: DocumentServer control-plane address, browser-facing origin, JWT secret, size limit and free-space floor, validated at startup — Office editing is enabled when the address is configured, there is no separate switch; an address with a missing or blank secret exits non-zero, and no address needs none of the others. Verify: startup tests for each combination, including the packaged multi-worker entrypoint.
- [ ] 10.2 JWT signing and verification, source-ticket signing and verification with expiry and binding, and a command-service client (`forcesave` with `userdata`, key lookup). Verify: tests against a fake DocumentServer HTTP endpoint cover a valid round trip, a tampered token, an expired ticket, a ticket for another document, and command error codes.

Suggested fixture level: expanded - secrets, authentication tokens and production configuration.
Minimal mergeable slice: 10.1 (configuration and fail-loud validation) - green alone because no route uses it yet; 10.2 adds the token and client helpers.

## 11. [ocu] Session API (spec: ocu-office-sessions, ocu-auth-guard)

- [ ] 11.1 `POST /api/office/{chat}/documents/{file}/sessions` and `GET /api/office/{chat}/sessions/{session}`: type, size and container validation, one open session per document with join, stable key, signed editor configuration with server-to-server addresses and no secret, `auth_guard` coverage of `/api/office/`, 404 for every route when Office editing is disabled. Verify: `TestClient` tests for each error, join from a second request (B-T05), the configuration's contents, the guard matrix, and the disabled case.
- [ ] 11.2 `POST .../save` and `POST .../close`: `save_seq` allocation, intent `publish` for a user save and `persist` for auto-save, the forcesave command, close as recorded intent, refusal at the connection cap as fixed by the B1 record, `orphaned` when DocumentServer no longer knows the key or the restore epoch differs. Verify: tests with the fake DocumentServer cover each path (B-T15 refusal, B-T10 expired ticket and denied new operation).
- [ ] 11.3 Status change notice: the status response checks only the edited file — `stat`, hash on change — and reports `workspace_changed` against the session baseline. Verify: tests for unchanged, size-changing, same-size with changed mtime, and deleted file; no other file is read.

Suggested fixture level: expanded - new public API on a guarded shared entrypoint, persisted session state, auth.
Minimal mergeable slice: 11.1 (create / join and status) - green alone because it only reads and creates state; 11.2 and 11.3 extend the same routes.

## 12. [ocu] DocumentServer callback and persist (spec: ocu-office-callback, ocu-auth-guard)

- [ ] 12.1 `GET /office/source/{ticket}` and `POST /office/callback/{chat}/{session}` with ticket and DocumentServer-JWT authentication, exemption from the internal-token carrier, sandbox-subnet rejection, and no proxy exposure. Verify: tests for a valid ticket, expired and foreign tickets, a bad signature, a sandbox-subnet peer, and an internal token offered instead of the proper credential (B-T09).
- [ ] 12.2 Status handling 1 / 2 / 3 / 4 / 6 / 7 and unknown, ordering by `save_seq`, idempotent repeats, callbacks for unknown, closed or orphaned sessions. Verify: recorded callback fixtures drive tests for each status, out-of-order and duplicate delivery, with no version regression (B-T04, B-T08).
- [ ] 12.3 Persist pipeline: download only from the configured DocumentServer control-plane origin with redirect validation, timeout and size limit; size, type and OOXML container checks; success acknowledged only after the version and receipt are durable. Verify: tests for an arbitrary URL, a redirect to another host, an oversized body, a non-OOXML body, and a storage failure that returns an error to DocumentServer.

Suggested fixture level: expanded - an unauthenticated-by-token control-plane entrypoint, outbound fetch, file writes.
Minimal mergeable slice: 12.1 (routes and their authentication) - green alone because unauthenticated handling changes nothing; 12.2 and 12.3 add the handling behind it.

## 13. [ocu] Outputs broker: resolve and register (spec: ocu-outputs-broker)

- [ ] 13.1 Resolve a `file_id` to its current relative path from persisted state, failing explicitly for unknown and tombstoned ids, without starting a sandbox. Verify: broker tests for an active id, a renamed file, a tombstone and an unknown id.
- [ ] 13.2 Register a host-side write for a path inside the caller's locked transaction: refresh the hash from content, increment the counter once, stamp the entry, also when the size is unchanged; reject paths outside the root, symlinks and hidden names. Verify: broker tests for a same-size write, a size change, and each rejection; concurrent reconcile does not lose the revision.

Suggested fixture level: expanded - persisted shared index with a monotonic counter relied on by WebUI.
Minimal mergeable slice: 13.1 (read-only resolution) - green alone because it adds a read over existing state; 13.2 adds the write path.

## 14. [ocu] Publish inside the fence (spec: ocu-office-publish)

- [ ] 14.1 Publish for a sandbox that is not running: under the per-chat lock run the outputs reconcile, write the journal intent, resolve the path, compare the workspace hash with the baseline, replace atomically through an exclusive no-follow temporary file with a parent-component check, register with the outputs broker, write the completion. Verify: tests for a clean publish, a baseline mismatch and a missing path (nothing written), a symlinked parent and an escaping path (aborted), a same-size publish that bumps the revision (B-T07, B-T13), and a concurrent launch that runs only after the publish (B-T06).
- [ ] 14.2 Publish for a running sandbox: pause, verify paused, replace, unpause; a pause failure fails the publish and keeps the version; more than 5 seconds paused fails and unpauses. Verify: fake-engine tests for each path and for a retention stop arriving during the window (B-T06).
- [ ] 14.3 Recovery: the stale-fence marker cleared by the startup sweep and the idle-reclamation poll with the sandbox unpaused, and startup completion or discard of an interrupted journal entry. Verify: tests that kill the publish at each step and restart (B-T06, B-T11); the sandbox is never left paused and the file is never half-written.
- [ ] 14.4 Decision record `ocu-office-publish-fence` (design D11, D12: two states, pause as the only barrier, no lease for retention or recovery). Verify: `make decisions-verify` passes.

Suggested fixture level: expanded - concurrency with sandbox writers, atomic file replace, crash recovery, path safety.
Minimal mergeable slice: 14.1 (not-running publish) - green alone because it needs no engine call and is the base of the running path; 14.2 and 14.3 extend it; 14.4 is documentation.

## 15. [ocu] Conflicts, versions and restore (spec: ocu-office-publish, ocu-office-sessions)

- [ ] 15.1 Connect persist to publish: a save or close with intent `publish` publishes the persisted version, sets the session baseline to the published hash, or puts the session in `conflict`; an unattended close-time conflict stays on the document and is reported at the next open. Verify: tests through the callback route for save, close, conflict and reopen.
- [ ] 15.2 `POST .../resolve`: `save_as` under a deduplicated name with the session continuing on the new document, `overwrite` after storing the current workspace content as a version, only `save_as` when the path is gone. Verify: tests for each action and for the refused `overwrite`.
- [ ] 15.3 `GET .../versions` and `POST .../restore`: list with source and published flag; restore creates a new version and publishes it, refused while a session is open on the document. Verify: tests for the listing, a restore, and the refusal (B-T14 at source level).

Suggested fixture level: expanded - publish and overwrite decisions on user data, new public routes.
Minimal mergeable slice: 15.1 (persist-to-publish wiring) - green alone because it uses only the callback route and group 14; 15.2 and 15.3 add independent routes.

## 16. [ocu] File responses are not cached (spec: ocu-file-headers)

- [ ] 16.1 `GET /files/{chat_id}/{path}` responses carry `Cache-Control: no-store`; the existing content-security and MIME behaviour is unchanged. Verify: `tests/test_files_headers.py` asserts the header on active and passive types and the unchanged headers.

Suggested fixture level: compact - one response header on an existing route.
Minimal mergeable slice: atomic - one header and its test.

## 17. [ocu] Editor host page (spec: ocu-office-editor-embed)

- [ ] 17.1 The preview page's `embed=office` mode: requires a parent frame, renders only the editor container, carries a content policy that admits the configured DocumentServer browser origin and no other external origin, exposes no token or secret, and shows a visible error for an invalid, repeated or unframed embed value. Verify: preview shell tests for the emitted HTML, policy and each error case; the Files and runtime embed tests still pass.
- [ ] 17.2 `static/office-editor.js`: the four-message protocol with exact key sets and origin, chat and generation checks; session creation through the request wrapper; editor creation from the signed configuration; state reporting including `dirty` and `workspace_changed`; `save` and `close` commands; status polling; the 5-minute auto-save while dirty; teardown that releases timers, listeners and the editor. Verify: module tests with a fake editor API cover a valid open, each rejected message, the auto-save timer, a failed API load reported as `error`, and no late effect after teardown.

Suggested fixture level: expanded - a new embedded entrypoint on the trusted origin with a cross-frame protocol and content policy.
Minimal mergeable slice: 17.1 (the shell mode and its policy) - green alone because the mode renders an empty container until the module exists; 17.2 adds the behaviour.

## 18. [deploy] Proxy table: Office rows (spec: ocu-reverse-proxy)

- [ ] 18.1 Add the seven Office rows of design D7 to `routes.json`, the `{file}` and `{session}` single-segment placeholders to the renderer, and the new row count and pin. Verify: `deploy/proxy/tests/` cover owner forwarding of each row with the internal credential and chat identity, the mutation guard on the five POST rows, placeholder rejection of traversal and encoded separators, and 404 without upstream contact for `/office/source/…`, `/office/callback/…` and the imports route.

Suggested fixture level: expanded - reviewed default-deny gateway table, authentication mapping and its pin.
Minimal mergeable slice: atomic - rows, placeholder validation and pin are checked together by the renderer; a table that does not match its pin does not render.

## 19. [webui] Stub Office fixtures and gateway smoke (spec: ocu-stub, ocu-proxy-smoke)

- [ ] 19.1 `scripts/ocu-stub.py`: deterministic Office session, status, save, close, resolve, versions and restore fixtures with controllable conflict, refusal and orphaned states, and an `embed=office` host page that speaks the message protocol without a real editor. Verify: `make smoke-stub` covers each fixture.
- [ ] 19.2 Bump the OCU pin in `constraints.yaml` to the commit holding the Office rows and add `smoke/proxy/office.hurl`: owner success, anonymous 401, non-owner 404, mutation guard 403, and the unproxied control-plane routes. Verify: `make smoke-proxy` passes.

Suggested fixture level: compact - deterministic test infrastructure following an already reviewed table.
Minimal mergeable slice: 19.1 (stub fixtures) - green alone because the stub is exercised by its own smoke; 19.2 needs the pinned table of group 18.

## 20. [webui] Feature flag, client and store (spec: ocu-office-workspace-ui)

- [ ] 20.1 `ENABLE_OCU_OFFICE_EDIT` (default false) exposed as `enable_ocu_office_edit` in the config features object beside `enable_ocu_workspace`, and set in the harness environment. Verify: a backend test asserts the feature value for both settings, and `make smoke` passes.
- [ ] 20.2 `src/lib/apis/ocu/office.ts` (session status, versions, restore, resolve, with the mutation header and the existing error mapping) and a chat-keyed Office store module. Verify: Vitest covers request shape, error mapping, generation handling and that no state crosses chats.

Suggested fixture level: expanded - a config surface in the upstream spine (`main.py`) and a new client on guarded routes.
Minimal mergeable slice: 20.1 (the flag) - green alone because nothing reads it yet; 20.2 adds modules without callers.

## 21. [webui] Edit entry and editor frame (spec: ocu-office-workspace-ui)

- [ ] 21.1 `WorkspaceArtifact`: the 编辑 action on DOCX / XLSX / PPTX entries behind the flag, and a third iframe class with a code-fixed sandbox attribute (token list from the B1 record), identity `file_id` + session, and validation of child messages by source, origin, schema, chat, file and generation; logic in a new module. Verify: Vitest covers flag off (no action, no request), frame creation, a publish-driven revision change that keeps the frame, each rejected message, and that the generated-document and trusted-preview frames keep their policies.
- [ ] 21.2 Status bar: state text for unsaved, saving, saved, conflict, failed, expired and refused; the save button; the workspace-changed notice; strings through the existing localisation mechanism. Verify: Vitest covers each state and that "saved" appears only after a confirmed publish.
- [ ] 21.3 `e2e/ocu-office.e2e.ts` through the proxy and the stub: open the editor, reach editing, save, see saved. Verify: `make verify-ui-ocu` passes with screenshots and zero unexpected console errors.

Suggested fixture level: expanded - iframe sandbox policy on a Critical Path component.
Minimal mergeable slice: 21.1 (edit action and frame) - green alone because the frame works without the status bar; 21.2 and 21.3 follow.

## 22. [webui] Maximize, history and conflict dialog (spec: ocu-office-workspace-ui)

- [ ] 22.1 Maximize as an in-page overlay that keeps the same editor frame. Verify: Vitest asserts the frame element survives maximize and restore; an e2e screenshot of both states.
- [ ] 22.2 Version history: list with source and published flag, restore action, disabled while a session is open on the document. Verify: Vitest for the list, the restore call and the disabled state.
- [ ] 22.3 Conflict dialog: `save as new file` as default, `overwrite` behind a second confirmation, only `save as` when the path is gone. Verify: Vitest for each branch and an e2e case driven by the stub's conflict state.

Suggested fixture level: compact - isolated UI on top of the existing client and frame; no new policy or entrypoint.
Minimal mergeable slice: 22.1 (maximize) - green alone because it only changes layout; 22.2 and 22.3 are independent dialogs.

## 23. [webui] Unsaved-state guard (spec: ocu-office-workspace-ui)

- [ ] 23.1 A guard module: `beforeunload` only while unpublished changes exist; chat switch and sidebar close send `close`, show saving progress and never apply a late result to another chat; `ChatControls.svelte` and `Chat.svelte` gain only calls into the module. Verify: Vitest covers each trigger and the late-result case; the diff of the two upstream files contains no Office logic.
- [ ] 23.2 Extend `e2e/ocu-office.e2e.ts` with B-T12: switch chat, close the sidebar, refresh, reopen the old chat. Verify: `make verify-ui-ocu` passes with screenshots.

Suggested fixture level: expanded - hooks in upstream spine components listed as Critical Paths.
Minimal mergeable slice: 23.1 (module and hooks) - green alone because it is covered by component tests; 23.2 adds the browser walk.

## 24. [deploy] Release inventory with a DocumentServer role (spec: ocu-offline-image-delivery)

- [ ] 24.1 `release.py`, the start-time identity checks and the version record: DocumentServer as a seventh, pulled role recorded by configuration digest and archive SHA-256, exported unmodified. Verify: release tests for a complete seven-role inventory, a missing or replaced DocumentServer image, a DocumentServer role recorded as built, and a new release built with six roles rejected.

Suggested fixture level: expanded - release integrity checks that gate every deployment start.
Minimal mergeable slice: atomic - the role list, the identity check and the version record read one inventory; a role present in one and absent in another fails the existing drift check.

## 25. [deploy] Bootstrap provisions DocumentServer settings (spec: ocu-retention-env)

- [ ] 25.1 `bootstrap-test.sh`: generate the JWT secret, emit the second proxy port, the DocumentServer control-plane and browser-facing addresses, the WebUI Office flag from one operator input, and the font directories, with every DocumentServer setting emitted whether the flag is on or off; reject a missing image reference, a failed secret generation, a flag value that is neither true nor false, and a DocumentServer origin equal to the WebUI origin. Verify: bootstrap tests for the generated outputs (mode 0600, no secret in logs or the version report), each rejection, and the existing no-overwrite contract.

Suggested fixture level: expanded - production configuration and secret generation.
Minimal mergeable slice: atomic - the settings are consumed as one consistent set by compose, the proxy and OCU; a partial set fails their validation.

## 26. [deploy] DocumentServer service and guard membership (spec: ocu-documentserver-service, ocu-compose-port-matrix)

- [ ] 26.1 Compose: the DocumentServer service on the control-plane network only, without host publication or Docker socket, with its data volume and the two font mounts, always present; OCU receives the DocumentServer address and secret. `check-ports.sh` requires the service exactly once, with no publication, on the control-plane bridge and never on the sandbox bridge. The proxy still publishes one port in this group. Verify: `tests/deploy/` assert the resolved configuration and reject a missing or duplicated service, a DocumentServer publication including loopback, and a sandbox-bridge membership.
- [ ] 26.2 Ship the open-source CJK font directory with the release and mount it and the operator-owned directory; neither repository nor the release package holds an operator-supplied font. Verify: a release test asserts the font directory's presence and that no supplied font name is in the package; the mounts are asserted in the resolved configuration.
- [ ] 26.3 Decision record `ocu-documentserver-origin` (design D17: own origin through a second proxy port, one deployment shape). Verify: `make decisions-verify` passes.

Suggested fixture level: expanded - production topology and a reviewed port guard.
Minimal mergeable slice: 26.1 (service and guard membership) - green alone because the compose file and the guard that checks it change together and the frozen compose snapshot tests pass; 26.2 adds mounts to an existing service; 26.3 is documentation.

## 27. [deploy] Second proxy listener and port (spec: ocu-reverse-proxy, ocu-compose-port-matrix)

- [ ] 27.1 A second listener that forwards to DocumentServer with session-only authentication, WebSocket upgrade and idle timeouts above 60 seconds, the forwarding headers DocumentServer needs, and no internal credential, chat identity or WebUI session cookie sent upstream; the two listeners never forward to each other's upstream. The proxy's compose service publishes the second port and `check-ports.sh` requires exactly two proxy publications. Verify: renderer and native proxy tests for an authenticated request, an anonymous 401, a WebSocket handshake, an unexpected auth response failing closed, and header contents received by a recording upstream; guard tests reject one and three proxy publications and a listener not wired to DocumentServer.

Suggested fixture level: expanded - a new authenticated listener in the gateway and a changed port guard.
Minimal mergeable slice: atomic - the listener, its authentication, the published port and the guard's count are one cut: a listener without authentication is an open path to DocumentServer, a published port without a listener or a listener without its port fails the guard, and the guard cannot accept both one and two publications.

## 28. [deploy] Overlay smoke with DocumentServer (spec: ocu-overlay-smoke)

- [ ] 28.1 `smoke_deployment.py`: exactly two proxy publications, DocumentServer among the required running services, and a refused connection on a direct DocumentServer address. Verify: smoke tests with the fake engine for each assertion, including a timeout that is not accepted as a refusal.

Suggested fixture level: expanded - deployment acceptance checks.
Minimal mergeable slice: atomic - one checker's assertions about one deployment shape; asserting two ports without requiring the service behind the second one would certify a broken deployment.

## 29. [deploy] Backup and restore with DocumentServer (spec: ocu-backup-rollback)

- [ ] 29.1 `recovery.py`: before stopping writers, ask DocumentServer to save and close open documents with the command the B1 record names, failing the backup when that step fails; DocumentServer among the writers stopped and verified before capture, its data volume excluded from the set, and per-chat membership without an uploads tree. Verify: recovery tests for the preparation step's order and its failure, a running DocumentServer blocking capture, the set's membership, and the excluded volume.
- [ ] 29.2 Restore writes a new restore epoch under the chat-data root; rollback verifies the images the selected release's own inventory records; `BACKUP-RESTORE.md` describes the save-and-close step, the invalidated sessions after restore, and the removal of sandbox containers when rolling back across the single-directory layout. Verify: recovery tests assert the epoch changes on restore, Office state and version blobs restore byte-identical, and a six-role previous release is accepted; the documented commands match the CLI.

Suggested fixture level: expanded - backup and restore of user data, rollback behaviour.
Minimal mergeable slice: 29.1 (preparation, writers and membership) - green alone because it only tightens capture; 29.2 adds the epoch that group 11 reads.

## 30. [webui] Real-editor verification target (spec: ocu-office-verification)

- [ ] 30.1 `scripts/verify-office.sh` and `make verify-office`: start a real DocumentServer and the broker locally, run open → edit → save → reopen for DOCX, XLSX and PPTX, reopen each exported file with a second implementation, stop what was started, and exit non-zero when Docker or the image is missing; add the Verification Matrix row and state that the target is not part of PR CI. Verify: the target passes locally with its output attached to the PR, fails loudly with the image absent, and `make doc-gate` passes.

Suggested fixture level: expanded - a new script entrypoint that starts services and judges saved files.
Minimal mergeable slice: atomic - AGENTS.md forbids a Verification Matrix row whose command does not exist and `make doc-gate` checks the pair, so the script, the target and the row land together.

## 31. [webui] Acceptance run and final documentation (spec: ocu-office-verification)

- [ ] 31.1 Prepare the acceptance machine (wiped chat data, swap active, font mount, Office flag on; at most one sandbox running during the run, as an operating constraint), run B-T01–B-T16, and retain evidence per row with untested rows stated as untested. Verify: the result table and evidence locations are posted on the epic.
- [ ] 31.2 Synchronise `AGENTS.md` (Critical Paths, Verification Matrix), `CONTEXT.md`, the decision records' zones and the plan's status with what was delivered. Verify: `make doc-gate` and `make decisions-verify` pass.

Suggested fixture level: none - evidence and documentation; no runtime behaviour.
Minimal mergeable slice: 31.1 (the run and its record) - independent of the documentation sweep, which follows the recorded results.
