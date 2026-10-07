# Tasks

Prefixes: `[webui]` = this repo; `[ocu]` = sibling checkout `open-computer-use` (branch `<tool>/plan2-<slug>` off `main`; the change was verified against `9c35a8c`, after which `main` dropped two unused definitions, `WRITER_SERVICES` and `verify_startup`; tests in the OCU repo root `tests/`, run with the command in its `AGENTS.md`); `[deploy]` = OCU repo `deploy/` overlay (tests in `tests/deploy/` and `deploy/proxy/tests/`). Every production file ships with its test file in the same task (AGENTS.md § TDD). A decision record named in a task lives in this repository's `docs/decisions/` and ships under `make decisions-verify` with the same issue, also when the code is in the OCU repo.

Work packages: B0 = groups 1–7, B1 = group 8, B2 = groups 9–14, B3 = groups 15–18, B4 = groups 19–27, B5 = groups 28–35. Every group states its dependencies in a `Depends on:` line; groups 9–35 all depend on group 8 (design D1), which the lines do not repeat. A group that names an item of the B1 record needs that item as a concrete value before it starts. Fixture-level vocabulary: `.claude/skills/subagent-workflow/references/issue-risk-contract.md`.

Dependency rule. A group that touches the shared directory, or that edits a list another group also edits as a whole — the guard's prefix list and its test matrix, the route table and its pin, the release role list, the deploy test fixtures, the stub scenario list — has a `Depends on:` path to the group that edits it before, so no two groups can merge in either order. Every Office group in the OCU server reaches the B0 cut-over (group 3) through group 11. Groups 9, 10, 18 and 23 touch neither the shared directory nor such a list and carry no B0 edge. Separate hunks in `app.py` (a new route registration, one response header) are not treated as a shared edit.

Source execution exception (user ruling, 2026-10-03): “119那边我在测试，你不用管。可以落地，先推进吧。” The requested groups may implement and merge source while the user owns B1 testing. This overrides the B1 start gate for that source queue only; it supplies no measured values, go verdict, licence judgement or release acceptance. Other DAG edges remain in force. Any implementation requiring an unavailable B1 value must name that missing input rather than invent one.

## 1. [ocu] Upload endpoint never overwrites and keeps import receipts (spec: ocu-unified-files)

- [x] 1.1 `POST /api/uploads/{chat_id}/{path}` writes under the per-chat lock through a dot-prefixed temporary file and a no-replace claim of the final name (hard link, not rename), stores a colliding name as `name (2).ext`, and returns the final name. The claim is one helper function, which groups 16 and 17 call for `save_as`. The destination directory is not changed in this group. Verify: new tests cover a fresh name, a collision, two concurrent uploads of one name, a same-named file created by a writer that holds no lock between the check and the claim, a symlink occupying the name, and traversal rejection.
- [x] 1.2 Import receipts: honour `X-OCU-Attachment-Id`, persist receipts in `{chat}/.ocu/imports.json` in the same locked section as the file, add `GET /api/uploads/{chat_id}/imports` behind the internal token, teach `auth_guard` the route shape, and never create a chat directory on a read. Verify: tests show a second upload with the same id writes nothing, an edited / renamed / deleted import is neither overwritten nor recreated, a different id with the same name is deduplicated, two concurrent uploads of one id store one file, the imports route rejects a missing token, and reading the imports of an unknown chat creates no directory.

Depends on: none.
Suggested fixture level: expanded - file writes into shared state, overwrite safety, a new guarded route.
Minimal mergeable slice: 1.1 (no-replace claim and deduplication) - green alone and safe at runtime because the deployed tool compares checksums with the manifest and the uploads directory is read-only in the sandbox, so it does not re-upload an unchanged attachment whose checksum the manifest returned. Two cases re-upload until 2.1 lands, and each then stores a copy as `name (n).ext`: two different attachments with the same name, of which the manifest can describe only one; and a manifest read that fails or times out, after which the old tool uploads every attachment. Files accumulate in both cases; nothing is lost or overwritten, where the old endpoint overwrote in place. 1.2 adds receipts on top.

### Name-claim slice risk coverage

- Public API / CLI / script entry — Selected: POST upload returns the actual stored name in `UploadResponse.filename`; endpoint tests assert bytes and response.
- Config / project setup — Not selected: no configuration or setup change.
- File IO / path safety / overwrite — Selected: fresh name, occupied file and symlink, next numbered name, traversal and external directory symlink; assert existing entries untouched.
- Schema / columns / units / field names — Selected: preserve `status`, `filename`, `size`, `md5`; test their values against stored content.
- Auth / permissions / secrets — Not selected: guard and proxy unchanged; existing authorization tests remain in the unit run.
- Concurrency / shared state / ordering — Selected: concurrent threads and separate workers, plus an unlocked writer winning a candidate name; both successful responses identify complete files containing their own bytes.
- Resource limits / large input / discovery — Not selected: no new upload limits or discovery behavior.
- Legacy compatibility / examples — Selected: destination remains `uploads`; manifest/list and deployed tool remain unchanged. Endpoint tests and existing unit suite cover consumers.
- Error handling / rollback / partial outputs — Selected: no temporary entry after success or rejection; inject a write/claim failure and assert cleanup without modifying an existing entry.
- Release / packaging / dependency compatibility — Not selected: no image or dependency change.
- Documentation / migration notes — Selected: PR documents retained destination and transitional duplicate copies; no migration or mount changes.

Run the OCU unit command in its `AGENTS.md`, including the new endpoint tests and excluding integration tests. Record the new regression cases failing against the unchanged handler before implementation, then passing with the change. An HTTP smoke uploads distinct bytes twice under one name and reads both stored files; include response names and byte comparisons in the evidence.

### Import-receipt slice risk coverage

- Public API / CLI / script entry — Selected: upload header identifies an attachment; authenticated GET imports returns `{"ids": [...]}`. Endpoint tests cover exact ids and repeated stored names.
- Config / project setup — Not selected: no settings or dependencies change.
- File IO / path safety / overwrite — Selected: receipts live under the chat's `.ocu`, outside uploads; edited, renamed and deleted imports stay unchanged; a different id deduplicates through the existing helper.
- Schema / columns / units / field names — Selected: persist attachment id, stored name and import time; preserve the upload response fields, with original import metadata on acknowledgement. Corrupt receipts fail explicitly without re-import.
- Auth / permissions / secrets — Selected: add imports to the internal-token matrix; missing token is 401 before reads and noncanonical chat ids follow the existing guard. No proxy row; gateway denial belongs to task 21.1.
- Concurrency / shared state / ordering — Selected: check, upload claim and receipt publication share one canonical lock; two separate workers importing one id produce one receipt and one file, while distinct ids are not lost.
- Resource limits / large input / discovery — Not selected: no new quotas or discovery policy.
- Legacy compatibility / examples — Selected: headerless uploads create new deduplicated files without receipt changes; uploads destination, no-replace helper and sandbox-readable permissions remain intact.
- Error handling / rollback / partial outputs — Selected: receipt-write failure is explicit, leaves prior receipts intact and may leave one complete unreceipted file; retry deduplicates, never deletes an existing upload. GET of an absent chat creates no directory, lock file or sandbox.
- Release / packaging / dependency compatibility — Not selected: no image/dependency changes.
- Documentation / migration notes — Selected: record response and receipt shape for the attachment-sync consumer; no migration or receipt pruning.

Run the existing OCU unit command, including the receipt endpoint cases and guard matrix. Capture an import-twice test red before production changes; verify all acceptance paths after implementation. Runtime evidence: real HTTP imports one id, modifies or removes its file, repeats the upload, and observes the original receipt name without resurrection; an authenticated absent-chat imports read returns an empty ids array and leaves the chat absent.

## 2. [ocu] Tool attachment sync imports once (spec: ocu-unified-files, ocu-tool-auth)

- [x] 2.1 `openwebui/tools/computer_use_tools.py`: read the imported ids, upload only attachments without a receipt and send their WebUI file id, upload everything when the read fails, and sync whenever the tool call carries attachments instead of matching path text. Verify: `tests/test_tools.py` proves an already imported attachment is not uploaded again after the stored file changed, a new attachment is uploaded once with its id, two consecutive tool calls leave one stored file, every request carries the internal token, and the manifest endpoint is no longer called.

Depends on: 1.
Suggested fixture level: expanded - shared tool entrypoint, credential carrier, overwrite behaviour.
Minimal mergeable slice: atomic - reading receipts and sending the attachment id are one behaviour; either half alone re-uploads every attachment under a deduplicated name on each call.

### Attachment-sync risk coverage

- Public API / CLI / script entry — Selected: all five public tool methods sync attached files before MCP execution, independent of command/path text; verify request order and the absence of manifest calls.
- Config / project setup — Not selected: Valves, probes and MCP transport settings remain unchanged.
- File IO / path safety / overwrite — Selected: use the existing Storage source/download cleanup path; skip receipted ids before reading their original bytes; URL-encode the upload filename segment so `#`, `?` and `%` remain filename bytes.
- Schema / columns / units / field names — Selected: consume `{"ids": [...]}`; send each attachment's top-level WebUI `id` as `X-OCU-Attachment-Id`. Never substitute a name, path or checksum for missing identity.
- Auth / permissions / secrets — Selected: imports and upload Bearer headers, existing probe/MCP carriers, token rotation and missing-token no-network behavior remain covered by the real-guard tests; no token in Valves, results, events or logs.
- Concurrency / shared state / ordering — Selected: two consecutive calls create one stored file; attachment upload completes before command execution. Server receipt arbitration owns cross-worker idempotence.
- Resource limits / large input / discovery — Not selected: no new limit, discovery policy or retry loop.
- Legacy compatibility / examples — Selected: preserve tool method APIs, MCP behavior, hint emission, source resolution and headerless server behavior; the tool no longer has a checksum/manifest identity path.
- Error handling / rollback / partial outputs — Selected: failed imports read, malformed ids response and refused redirects trigger upload-all with original attachment ids; real server receipts prevent overwriting an edited file. Preserve download cleanup and redirect refusal.
- Release / packaging / dependency compatibility — Not selected: no dependency/image change.
- Documentation / migration notes — Selected: narrow existing changelog entry; path text and tool README updates remain later tasks.

Capture a new attachment on a path-independent tool call red before implementation, then run `tests/test_tools.py` and the full OCU unit command. Use real guarded HTTP upload/receipt handlers for the failed-read no-write evidence rather than a mock echoing receipt logic. Runtime smoke invokes the actual tool sync against OCU HTTP twice, including a failed receipt read, and observes unchanged edited bytes and one stored file.

## 3. [ocu] Single workspace files mount: the cut-over (spec: ocu-unified-files)

- [ ] 3.1 One cut that switches every runtime consumer of the sandbox paths together: `docker_manager.py` binds the chat's host `outputs` directory read-write at `/mnt/user-data/files` and stops mounting the two legacy paths; the upload endpoint, `uploads.py` and `mcp_resources.py` use that directory (URI shape `file://uploads/{chat_id}/…` unchanged, hidden names skipped); `deploy/recovery_resources.py` maps the new mount set; `system_prompt.py`, the `mcp_tools.py` tool text, the tool's text and `static/browser-viewer.js` name the new path; the sandbox `Dockerfile` creates `/mnt/user-data/files` owned by the sandbox user, leaves `/mnt/user-data` root-owned and not writable, stops creating the legacy directories, moves the skill-usage log, and updates the embedded agent configuration and permission rules; the public skills (`file-reading`, `sub-agent`, `webapp-testing`, the example skill) name the new path. The tests that assert the old shape change in the same cut: `tests/orchestrator/test_sandbox_addressing.py` (the `uploads` directory is no longer created), `tests/orchestrator/test_mcp_resources.py` (resources come from the shared directory), and the `uploads`-directory fixtures in `tests/test_auth_guard.py` and `tests/security/test_path_traversal_app.py`. Verify: `tests/orchestrator/test_lifecycle.py` asserts the mount set (one user-data bind, read-write, no legacy binds); `tests/deploy/test_recovery.py` asserts the map; the prompt, tool, upload and the four named tests are updated and pass; an MCP resource listing test reads the shared directory; `tests/integration/test_workspace_lifecycle.py` cases run against a locally built `linux/amd64` image show the new path writable, the legacy paths absent and a write to a legacy path failing, with their output attached to the PR.
- [x] 3.2 Decision record `ocu-unified-workspace-files` (design D2, D3: one directory, no legacy paths, accepted upstream divergence). Verify: `make decisions-verify` and `make doc-gate` pass.

Depends on: 2, 4 (the manifest and list handlers, which read the old `uploads` directory, are gone before the upload destination moves).
Suggested fixture level: expanded - file IO and path layout of a shared mount, sub-agent permission rules, legacy compatibility deliberately broken.
Minimal mergeable slice: atomic - with only the mount changed the Agent still writes to the old path, which lands in the container layer and is lost; with only the text changed it is told to use a path that is not mounted; with only the upload destination changed attachments are invisible in the sandbox. The edits are one mechanical path change across the files that consume it. 3.2 is documentation in the same PR.

User-directed acceptance split: source implementation, non-image tests/runtime checks, reviewer closure and CI remain the source-issue merge gate. The image-dependent clauses of task 3.1 and the risk packs below are executed together under [B0 batched image acceptance #197](https://github.com/DankerMu/open-webui/issues/197). Closing the source issue does not mark those checks passed. Compatible checks reuse one built image; after the batch runs, record its evidence and clean its Docker resources. B1's measurements and go/no-go gate are unchanged.

Execution timing: no image builds or image-dependent acceptance runs during source implementation. By the user's latest direction, #197 runs only after all Epic #107 source tasks are complete; any gate lacking required measurements remains unresolved rather than receiving an inferred pass.

### Unified mount cutover risk coverage

- Public API / CLI / script entry — Selected: HTTP names and MCP URI shape stay fixed while uploads become listed workspace files. Upload `brief.docx`, assert stored bytes and listing `file_id`; serve uploaded HTML with sandbox CSP and nosniff; read the same bytes through an MCP resource.
- Config / project setup — Selected: image ownership/config, browser download target and skill-usage log use the single files path. Bind and IO roots both use `BASE_DATA_DIR`; remove the redundant `USER_DATA_BASE_PATH` setting and all configuration consumers in the same cut. Recovery tests retain mismatched-root rejection using the canonical variable; a tracked-file scan confirms no obsolete input remains. Build the actual linux/amd64 image and inspect it as the sandbox user.
- File IO / path safety / overwrite — Selected: no host uploads directory; one read-write outputs bind; preserve no-replace collision/receipt/path-escape cases after retargeting. Uploads become mode 0666 before final-name publication and server-created workspace directories mode 0777, independent of umask; staging stays private during writes and existing directories retain their modes. Prove sandbox-user in-place edit, rename/delete and nested creation, not just new-file writes. MCP excludes hidden files and hidden directory segments, including `.ocu`; ordinary nested visible files remain readable.
- Schema / columns / units / field names — Not selected: receipt schema, broker identity, host directory name and HTTP/URI names remain unchanged.
- Auth / permissions / secrets — Selected: keep guard fixtures on the shared directory; verify uploaded HTML isolation and private-home absence from listing/serving. Root-owned non-writable user-data parent makes legacy-path writes fail.
- Concurrency / shared state / ordering — Selected: preserve the existing canonical lifecycle/publication lock and worker receipt arbitration. Creation and explicit recreation have the same mount set; no automatic migration of live old containers.
- Resource limits / large input / discovery — Selected: MCP discovery filters hidden names and serves visible nested paths from outputs; no new quotas or full-content scan in the upload response path.
- Legacy compatibility / examples — Selected: deliberately remove legacy sandbox paths without aliases; preserve MCP URI and private named volume. Rendered prompt/tool text and public/example skills use the new path; recovery rejects a container carrying only the old bind pair.
- Error handling / rollback / partial outputs — Selected: an unprivileged write to either legacy path exits nonzero and leaves no file; rejected upload paths leave external bytes intact. No migration/deletion of existing data; rollback requires matching image/server and recreated sandboxes.
- Release / packaging / dependency compatibility — Selected: [#197](https://github.com/DankerMu/open-webui/issues/197) owns the full linux/amd64 sandbox build, image identity and real integration output. Missing Docker/image or skipped integration cannot close that acceptance issue; they do not block the separately verified source issue under the user's batching decision.
- Documentation / migration notes — Selected: decision record `ocu-unified-workspace-files`, implemented/architecture, with alternatives and accepted upstream divergence; correct touched module comments, removed-variable documentation and the temporary-visibility changelog. Other operator documents/diagrams, proxy and WebUI stub remain later tasks.

Red-first cases use `tests/orchestrator/test_lifecycle.py`, `test_sandbox_addressing.py`, `test_mcp_resources.py`, `test_system_prompt_endpoint.py`, `test_sub_agent_dispatch.py`, `tests/test_upload_claim.py` and `tests/deploy/test_recovery.py`; preserve the receipt, tool and authorization regression suites when retargeting their fixtures. New image semantics belong in `tests/integration/test_workspace_lifecycle.py`: created/recreated mount inspection, writable files, absent legacy paths, failed writes and private-home isolation.

Permission evidence in `tests/test_upload_claim.py` must upload under umask 077, observe complete bytes and mode 0666 at the no-replace claim, assert mode 0777 on newly created nested parents, and verify a pre-existing directory keeps its original mode. Restore process umask after the case. The real sandbox-user integration case must edit the server-uploaded file in place, rename and delete it, and create a sibling inside a server-created nested directory.

After the atomic edit, run owning modules, the full OCU unit suite and project-structure check. Real HTTP smoke uploads into outputs, observes identity and opaque HTML headers, reads an MCP resource and confirms no uploads directory. Run the direct Chromium harness with the standalone upload visible in Files. WebUI evidence: strict OpenSpec, `make decisions-verify` and `make doc-gate`. Scan shipped runtime/skill/image/tool files for legacy paths; exclude operator documentation explicitly owned by task 6.1.

The image batch builds the linux/amd64 image and runs the unit-plus-integration command without the integration ignore. Record non-skipped integration results and image/source identity in #197, link them back to the source issue, then clean only the batch's images, containers, network, volumes and attributable build cache. A failed image check requires a linked corrective PR; deferred or skipped evidence is never reported as passing.

## 4. [ocu] Remove the upload read endpoints and the SPA upload list (spec: ocu-unified-files)

- [x] 4.1 Remove the upload list block from the standalone preview's status panel and its request for the list; the upload action stays and refreshes the Files listing. Verify: the preview tests are updated and pass; a screenshot of the standalone panel is attached.
- [x] 4.2 Delete `GET /api/uploads/{chat_id}/manifest` and `.../list`, their helpers and guard entries. Verify: the auth-guard matrix and path-traversal tests are updated, both paths return 404 or 405 without file names, and the remaining suite passes.

Depends on: 2 (the tool no longer calls the manifest).
Suggested fixture level: expanded - entries of the authentication guard matrix are removed.
Minimal mergeable slice: 4.1 (the page stops requesting the list) - green alone because the endpoint still answers; 4.2 then removes handlers that have no caller. Between this group and group 3 a file uploaded from the standalone page is stored but shown nowhere on that page, because uploads still land in the old directory; that gap is accepted over the alternative order, in which the page would show a stale list of the old directory, and it affects only the standalone page, not the WebUI sidebar.

### Preview upload-list removal risk coverage

- Public API / CLI / script entry — Selected: standalone and terminal embed issue no upload list/manifest requests; status, sessions, processes and upload POST remain. Browser requests and visible controls provide evidence.
- Config / project setup — Not selected: request wrapper, embedding modes and dependency versions remain unchanged.
- File IO / path safety / overwrite — Not selected: server storage and upload naming remain unchanged.
- Schema / columns / units / field names — Not selected: no server response contract changes.
- Auth / permissions / secrets — Not selected: guard, proxy, CSP and request-wrapper behavior remain unchanged; existing browser isolation cases still pass.
- Concurrency / shared state / ordering — Selected: after upload completion, standalone invokes the existing Files refresh directly. Freeze the polling clock in the browser case so a periodic poll cannot satisfy the refresh assertion. Terminal embed must not fetch Files.
- Resource limits / large input / discovery — Not selected: no resource policy change.
- Legacy compatibility / examples — Selected: preserve upload button, terminal controls, sessions/processes, Browser/Files embed behavior and server read handlers. The shared dashboard removal applies in both standalone and terminal embed.
- Error handling / rollback / partial outputs — Selected: a removed list endpoint cannot empty the dashboard; preserve existing status/session/process error behavior and request aborts. Existing browser harness asserts no unexpected console errors.
- Release / packaging / dependency compatibility — Not selected: no image or dependency changes.
- Documentation / migration notes — Selected: attach a real standalone-panel screenshot to the PR, retaining the requested image under the existing screenshot convention if needed; state the accepted visibility gap until task 3.1.

Run `tests/orchestrator/test_preview_prefix.py` and the full OCU unit suite. Separately run `tests/orchestrator/preview_embedding_browser.cjs` with Node 22, pinned Playwright 1.62.1 and Python 3.12 containing server requirements and pytest; it is a direct browser harness, not currently invoked by the Python module. Record an old-page failure before implementation, then a passing browser run with a standalone-panel PNG and zero unexpected console errors. The screenshot must be accessible from the PR, not only a local path.

### Upload read-handler removal risk coverage

- Public API / CLI / script entry — Selected: both retired GET paths return 404 or 405 with a valid internal token; no shim handler. Test populated storage so an accidental live handler discloses recognizable metadata and fails.
- Config / project setup — Not selected: no settings or setup change.
- File IO / path safety / overwrite — Not selected: remove readers, preserve all upload and MCP path logic. Existing traversal and upload tests stay in the full run.
- Schema / columns / units / field names — Not selected: no persisted state or surviving response shape changes.
- Auth / permissions / secrets — Selected: remove only the two handler-matrix rows; retain prefix authorization. Both retired paths still reject missing credentials with 401, and existing noncanonical-id cases remain 400 before routing.
- Concurrency / shared state / ordering — Not selected: no write, lock or worker behavior change.
- Resource limits / large input / discovery — Not selected: no resource policy changes; retired scans disappear with their handlers.
- Legacy compatibility / examples — Selected: POST uploads, GET imports and MCP resources stay live; tool and preview no longer depend on the readers. Remove the preview harness's obsolete list-response stub, keep its zero-request assertions and run the browser harness.
- Error handling / rollback / partial outputs — Selected: populated-chat GET bodies contain no names, hashes or sizes; unknown-chat reads do not create directories. Keep natural router errors and existing guard precedence.
- Release / packaging / dependency compatibility — Not selected: no dependency or image changes.
- Documentation / migration notes — Selected: narrow changelog and PR boundary note. API documentation, proxy rows and WebUI stub follow in their named tasks, not this slice.

First run the new removed-path cases red against the live handlers. Then run `tests/test_auth_guard.py`, `tests/security/test_path_traversal_app.py`, the full OCU unit command and the direct preview browser harness. Runtime smoke uses real HTTP to upload a receipt-bearing file, verify imports, request each retired path with valid and missing credentials, and compare the stored bytes afterward. Record statuses and absence of metadata; no Docker or deployment claim.

## 5. [deploy] Proxy table without the upload read rows (spec: ocu-reverse-proxy)

- [x] 5.1 Remove the manifest and list rows from `deploy/proxy/routes.json` and update the renderer's reviewed row count and table pin. Verify: `deploy/proxy/tests/` pass, including a case that the two paths return 404 without an upstream request and that the upload POST row still forwards.

Depends on: 4 (the standalone page must have stopped requesting the list, or its status panel breaks on the gateway's 404).
Suggested fixture level: expanded - reviewed default-deny gateway table and its pin.
Minimal mergeable slice: atomic - the table, its row count and its pin are validated together by the renderer; a partial change does not render.

### Proxy upload-read removal risk coverage

- Public API / CLI / script entry — Selected: GET manifest/list, including encoded literal names, returns 404 without OCU contact. POST of those filenames and ordinary nested uploads preserves method, raw path, body bytes and route-derived chat identity.
- Config / project setup — Selected: the reviewed inventory becomes 20 rows. Its byte-level SHA-256 pin and count change atomically; no new render input or placeholder.
- File IO / path safety / overwrite — Selected: renderer bad-table/native-validation cases retain the previous valid configuration byte-for-byte and preserve private output/runtime modes. Only synthetic-token configs under a private temporary directory are exercised.
- Schema / columns / units / field names — Not selected: route-table schema/version and response shapes remain unchanged.
- Auth / permissions / secrets — Selected: removed GETs deny owner, foreign and anonymous callers without contacting OCU. Upload POST retains owner authentication and mutation-origin proof; null origin and foreign ownership remain denied. Token forwarding/containment cases remain.
- Concurrency / shared state / ordering — Not selected: no new shared state; renderer atomic replacement is covered by the file IO/error packs.
- Resource limits / large input / discovery — Not selected: existing larger-than-1-MiB upload body proof remains; no size policy change.
- Legacy compatibility / examples — Selected: retiring GET never reserves the filename for POST. Preserve literal and percent-encoded manifest/list uploads, all unrelated rows and default-deny methods.
- Error handling / rollback / partial outputs — Selected: invalid inventory/count/pin fails before replacing a usable config; GET method mismatch cannot fall through to the upstream upload route.
- Release / packaging / dependency compatibility — Not selected: native nginx only; no image/dependency/compose changes.
- Documentation / migration notes — Selected: describe the retired read paths in the existing proxy README; do not read or commit generated `nginx.conf` or private request recordings.

Red first: add a native removed-GET case, start the existing recording fixture and a privately rendered nginx, and observe the old table forwarding instead of returning 404. Then remove the rows and update count/pin together. Preserve the existing guarded POST, origin/ownership denial and invalid-table assertions; select a POST mutation fixture by route identity rather than a shifting array index.

Run `python3 -m unittest discover -s deploy/proxy/tests -p 'test_render.py' -v` with native `nginx -t`. Start `tests/fixture.py` and nginx on isolated loopback ports using synthetic credentials, then run `test_native.py` via unittest with `OCU_TEST_RECORD` naming the private observation file. Record statuses and zero OCU observations, not the credential-bearing records/config. Stop both processes and remove only this run's temporary directory. Run the existing project-structure check and WebUI strict OpenSpec/doc/decision gates. All image work remains deferred to #197 at the user-directed Epic boundary.

## 6. [ocu] Docs and the repository guard for the legacy paths (spec: ocu-unified-files)

- [x] 6.1 Update the OCU docs and diagrams that name the legacy paths or the removed upload read endpoints, `static/docs.html` and `computer-use-server/README.md` among them. Verify: the documents render and their links resolve.
- [x] 6.2 Add a repository test that fails on any tracked reference to `/mnt/user-data/uploads` or `/mnt/user-data/outputs` outside a short explicit allowlist. Verify: the guard test passes and fails when a legacy reference is reintroduced (shown once in the PR).

Depends on: 3, 4 (the guard can pass only when the mount, the tool text and the list handler no longer name the paths).
Suggested fixture level: compact - documentation and a text guard; the behaviour is owned by group 3.
Minimal mergeable slice: 6.1 (documents) - green alone because it changes prose only; 6.2's guard passes only after 6.1.

### Operator documentation refresh evidence

- Documentation / migration notes — Selected: update every in-scope stale path and retired upload-read description without restyling unrelated content. Merge the two Docker mount descriptions into one writable workspace; keep `/home/assistant` private and preserve unique examples and links.
- Legacy compatibility / examples — Selected: uploaded and generated files share `/mnt/user-data/files`; examples must not copy a file onto itself after the path change. Tool documentation describes receipt-based attachment sync on every tool invocation, not a legacy-path trigger. MCP resource URIs remain unchanged.
- Public API / CLI / script entry — Selected for documentation only: remove the served manifest/list descriptions, retain the upload POST, and load the real server's root documentation page with synthetic local configuration. No route behavior changes.
- Config, file IO, schema, auth, concurrency, resource limits and packaging — Not selected: prose/diagram edits do not change these mechanisms. Deployment backup docs and Office notes remain their named later tasks; image execution stays pending #197.

Before editing, inventory stale references in `docs/`, `openwebui/tools/README.md`, `computer-use-server/README.md` and `computer-use-server/static/docs.html`. After editing, the two legacy path strings and retired manifest/list endpoint strings must have zero hits in that scope, or an explicit historical exception handed to task 6.2.

Parse each changed SVG as XML and display it in Chromium, retaining screenshots and inspecting labels for clipping/overlap. Render each changed Markdown page and open its local links. Start the existing server with a temporary data root and synthetic credentials; request `/`, verify the upload POST remains described and retired read paths are absent, and inspect the rendered page with no unexpected browser errors. Stop owned processes and remove only owned runtime scaffolding.

User-approved link acceptance: run local lychee with `lychee.toml`, `--no-progress --offline`, and the explicit changed-document set; record tool version, command, counts and exit code in the PR. Follow changed-document links during the rendering pass and report external checks separately from offline internal-link validation. The existing docs-lint workflow covers `docs/architecture/**`, not this slice, so neither its execution nor coverage is claimed. CI files and configuration remain unchanged. No new permanent test is needed for this prose-only slice; the tracked-reference guard belongs to task 6.2.

### Tracked sandbox-path guard evidence

- Public API / CLI / script entry — Selected: a normal `tests/test_*.py` module runs under the existing OCU pytest command and reports every offending tracked filename.
- Config / project setup — Selected: resolve the repository from the test file, enumerate the Git index with NUL-safe filenames, and fail if Git enumeration fails; no fallback that scans untracked files.
- File IO / discovery — Selected: inspect tracked working-tree bytes without decoding or an extension allowlist, so SVGs and unusual file suffixes are covered. Do not follow tracked symlinks into external content; inspect their link text. Missing tracked working-tree files cannot silently count as a clean scan.
- Legacy compatibility — Selected: a short exact-file allowlist names the guard itself and the four existing negative-contract files: recovery, workspace integration, sub-agent dispatch and system-prompt endpoint tests. Each entry carries its purpose; no directory-wide exception or automatic allowlisting.
- Error handling — Selected: Git/read failures fail visibly rather than being treated as no matches; violations identify filenames without dumping file contents.
- Documentation — Selected: the guard's module docstring states tracked-only scope, intentional exceptions and how to run it. Other schema, auth, concurrency and packaging mechanisms are unchanged; no resource quota is added.

Run the module on the real branch. In a disposable Git fixture with the unchanged guard and branch document bytes, prove a clean tracked document passes, add each legacy literal to that tracked non-allowlisted document and require a nonzero result naming it, then restore the document and require a pass. Also prove an untracked file containing a literal is ignored and a tracked SVG or unusual suffix is not skipped. Retain the exact negative output in the PR; discard the fixture afterward. If the real branch exposes a missed reference, report it to task 3.1 or 6.1 rather than expanding the allowlist.

## 7. [webui] Stub, pin and smoke for the unified directory (spec: ocu-stub, ocu-proxy-smoke)

- [x] 7.1 `scripts/ocu-stub.py`: drop the manifest and list routes and make uploads appear in the outputs listing under a deduplicated name; bump the OCU pin in `constraints.yaml` to a commit that holds groups 3 and 5 and does not yet hold group 31 (the pin is a commit SHA, not a branch head; from group 31 on the pinned renderer needs listener inputs that this harness passes only from 34.1 on); update `scripts/smoke-proxy.py` and `smoke/proxy/*.hurl` so the upload chain no longer reads the manifest or list and the removed rows are asserted as 404 without upstream contact. Verify: `make smoke-stub` and `make smoke-proxy` pass.
- [x] 7.2 Extend `e2e/ocu-workspace.e2e.ts`: a file uploaded through the proxied upload row appears in the Files panel. Verify: `make verify-ui-ocu` passes with a screenshot.

Depends on: 3, 5.
Suggested fixture level: compact - deterministic test infrastructure following an already reviewed table.
Minimal mergeable slice: 7.1 (stub, pin, smoke) - green alone because the pinned table and the stub change together; 7.2 adds one browser case.

### Unified-directory harness risk coverage

- Public API / script entry and schema — Selected: stub upload responses use the pinned OCU `filename`, `status`, `size` and `md5` fields; multipart file bytes become a listed and retrievable file. Retire GET manifest/list only, preserving uploads with those literal names.
- Configuration / compatibility — Selected: pin one full remote OCU SHA containing the mount and 20-row gateway cuts, before the second listener. Keep the private body-digest observation contract and existing fixture scenarios, pagination, conditional reads and generated-content headers.
- File names / overwrite and shared state — Selected: serialize name claiming and state publication in the threaded stub, deduplicate against existing fixture and uploaded names, isolate chats, and leave the first file's bytes, id and revision unchanged. Listing revision advances on each successful upload; conditional requests cannot return stale 304 after it.
- Auth / secrets — Selected: real nginx plus WebUI owner/nonowner cookies prove retired GETs return 404 without an upstream arrival; accepted upload body digests match, foreign and opaque-origin writes remain denied before OCU, and no credential leaks.
- Errors — Selected: malformed multipart input fails without publishing a file. The pinned-table mismatch remains a named hard failure, never a skipped matrix assertion.
- Documentation — Selected: this fixture records the harness contract and evidence boundary. Resource quotas, durable storage, production parser hardening, packaging and dependency updates are not selected; no disk-backed upload service is introduced.

Extend `make smoke-stub` before the stub implementation and retain its semantic failure. Its green run must show retired GET 404s, multipart upload/list/retrieval, duplicate-name preservation, chat isolation and invalidated listing ETag. `make smoke-proxy` must assert owner retired GET 404s with no observation delta and upload POST body fidelity followed by the stored filename in the outputs listing. Run the existing stub-public pytest module read-only and `make verify-ui-ocu` for pinned-asset regressions; the new browser upload case belongs to task 7.2. Record exact command output, strict OpenSpec and doc/decision checks. All image execution remains deferred.

The stub smoke also submits a malformed multipart envelope and requires an explicit non-2xx response with the listing and its revision unchanged. The real OCU response shape replaces the unused `{stored, chat}` stub shape; no aliases are retained. The gateway upload probe uses multipart too, with its observation digest still covering the entire HTTP body rather than just the extracted file bytes.

### Uploaded-file browser evidence

- Test entry / auth provenance — Selected: a saved owner chat with Files open sends a real multipart upload through the pinned nginx gateway, using its authenticated browser session and the required mutation header/origin. No sidebar upload control, mocked route or direct store mutation.
- Ordering / errors — Selected: assert the filename is absent before POST, require HTTP 200 and the returned stored filename, then wait for normal workspace reconciliation to render that name inside the Files panel. Reuse existing console/page-error observation and preserve all current cases.
- Evidence documentation — Selected: retain a screenshot under `.run/ui-evidence/`, inspect it, commit one compressed copy under `docs/evidence/issue-118/` (user-approved scope exception), and embed the immutable commit URL in the PR.
- Config, file storage/path validation, schema, quotas, packaging and migration — Not selected: the case consumes the merged harness without changing it. No production, stub, smoke, CI or OCU edits.

Qualify the visible-file oracle with an omitted-POST negative control, then restore the real upload and run the full `make verify-ui-ocu` suite. Report this as test-oracle qualification, not a production regression fixed by this test-only issue. Run strict OpenSpec, doc and decision checks; do not claim real sandbox or DocumentServer acceptance.

## 8. [webui] B1 release verification of DocumentServer (spec: ocu-office-verification)

- [x] 8.1 Run the pinned DocumentServer image in isolation and write the dated verification record under `docs/` with every item of design D4. The nine items later groups consume must be concrete values: the iframe sandbox and permission lists; connection-boundary detection (a documented usage query or its absence, and a measured cap event or its observed absence at the tested boundary); the close-to-status-2 delay; the shutdown-preparation command (its name and whether it saves and closes every open document); whether a restart clears the shutdown-preparation mode; whether `forcesave` echoes `userdata`; whether the editor's own save command produces a callback with user-initiated force save off; the origin of the download address in status-2 and status-6 callbacks; whether the editor works when the proxy withholds the WebUI cookie. For the five that are design assumptions the record states whether the observation matches. Other items are filled or explicitly marked not measured with the reason. Verify: the record lists each item, the nine consumed ones hold values, and `make doc-gate` passes.
- [x] 8.2 Decision record `ocu-office-editor-selection` stating go or no-go, linking the record by relative path. It cannot be a go when a consumed item is not measured or when a design assumption does not hold: `forcesave` does not echo `userdata`, no shutdown-preparation command saves and closes open documents, a restart does not clear that mode, the editor's own save produces a callback, or the editor fails without the WebUI cookie. In each of these cases the change returns to design. Verify: `make decisions-verify` and `make doc-gate` pass; on no-go the epic is updated and no group 9–35 issue starts.

Depends on: none.
Suggested fixture level: none - measurement and documentation; no runtime behaviour in either repository.
Minimal mergeable slice: atomic - the go/no-go decision is the gate and is only meaningful with the record it cites; both are documentation in one PR.

### Isolated B1 measurement evidence

The user authorizes one local isolated DocumentServer 9.4.0 measurement campaign as an exception to the image freeze. Record the official index, platform manifest and configuration digests, runtime package version, architecture and launch settings. Do not rebuild the image or touch existing services. Use a fresh labelled internal network, synthetic JWT credentials and loopback-only browser ports; remove only owned resources afterward. Local hardware results never substitute for acceptance-machine measurements.

- Protocol / schema — Selected: actual open/edit/export of deterministic DOCX, XLSX and PPTX; inspect exported OOXML for the input marker. Record status-2/6 callback fields and download origins, exact `forcesave` userdata, and bounded Ctrl+S observations with user force-save disabled. A callback name inferred from documentation is not measured evidence.
- Auth / configuration — Selected: keep JWT enabled; reject a bad measurement credential as an oracle control. A real browser-facing proxy strips the synthetic WebUI cookie, and records only presence/absence—not credentials—while the editor opens and edits.
- Concurrency / shutdown — Selected: observe editors below and beyond the claimed connection boundary, the actual host event or absence, the documented usage query or its absence, final-close callback latency, all dirty documents through the shipped shutdown command, and a fresh editor after restart. If the release differs from the plan, retain the result and return that conflict to design rather than invent an event.
- Environment / provenance / documentation — Selected: enumerate all fifteen D4 items, sources and limitations. Measure the minimal tested outer-iframe sandbox/permission set with capability-removal controls. Inventory release fonts and their licence sources without committing font files; operator-supplied fonts and licence-fit judgement require the operator. Official minimum figures must cite the actual source.
- Production storage, migration and packaging changes — Not selected: no broker, deployment service, CI, production tests or permanent measurement target is added. Missing consumed values or failed design assumptions cannot release B2–B5.

Retain raw, credential-redacted observations and sample hashes before writing the dated B1 record and its decision record. Verify relative links with `make doc-gate`, prove removal of the B1 record breaks the decision link using a disposable copy, run `make decisions-verify`, and independently review the evidence. No-go states the failed assumption or missing prerequisite and returns to design; it is not a replacement-editor choice.

## 9. [ocu] Outputs broker: resolve and register (spec: ocu-outputs-broker)

- [x] 9.1 Resolve a `file_id` to its current relative path from persisted state, failing explicitly for unknown and tombstoned ids, without scanning, hashing or starting a sandbox. Verify: broker tests for an active id, a renamed file recorded by a reconcile, a tombstone, an unknown id and a corrupt index.
- [x] 9.2 Register a host-side write for a path inside the caller's locked transaction: refresh the hash from content, increment the counter once, stamp the entry, also when the size is unchanged; create an entry with a new `file_id` for an unindexed path; reject paths outside the root, symlinks and hidden names. Verify: broker tests for a same-size write, a size change, an unindexed path, and each rejection; a concurrent reconcile does not lose the revision.

Depends on: none beyond group 8.
Suggested fixture level: expanded - persisted shared index with a monotonic counter relied on by WebUI.
Minimal mergeable slice: 9.1 (read-only resolution) - green alone because it adds a read over existing state; 9.2 adds the write path.

### Read-only resolution risk coverage

- Public API / CLI / script entry — Selected: `OutputsBroker.resolve_file_id(chat_id, file_id)` returns the indexed relative path; a dedicated `FileIdNotFoundError` distinguishes absence from `CorruptIndexError`.
- Config / project setup — Not selected: no settings or setup changes.
- File IO / path safety / overwrite — Selected: reuse the validated, confined index reader; preserve index bytes on success and error, never open workspace content or follow workspace symlinks.
- Schema / columns / units / field names — Selected: preserve the existing index schema, active identities, tombstones and counter. Test reconciled rename, deletion followed by path reuse, and unchanged bytes/counter.
- Auth / permissions / secrets — Not selected: no HTTP route, credential or authorization change; canonical chat handling stays with the broker.
- Concurrency / shared state / ordering — Selected: canonical RLock plus flock surrounds the read; test same-thread nesting and a separate writer holding the lock while resolution waits for its committed successor.
- Resource limits / large input / discovery — Selected: retain existing bounded index validation; resolve without scanning or hashing workspace content, including when the indexed path is absent.
- Legacy compatibility / examples — Selected: run the existing broker test module; reconciliation, paging and `current_revision` are unchanged.
- Error handling / rollback / partial outputs — Selected: unknown, malformed, tombstoned and absent-index ids produce not-found; malformed/unreadable persisted state retains its existing error and bytes. No index is created on absence. A lock may create the chat directory; preventing that belongs to the Office route.
- Release / packaging / dependency compatibility — Not selected: no image, dependency or packaging change.
- Documentation / migration notes — Selected: this fixture records the public operation and source-only evidence boundary; no migration.

Run the OCU unit command from its `AGENTS.md`, narrowed to `tests/orchestrator/test_outputs_broker.py`, with red-before/green-after evidence for the new behavior. A throwaway real-filesystem smoke indexes a file, renames and reconciles it, resolves inside an already-held lock, removes and reconciles it, then observes not-found with unchanged index bytes. Docker access must fail if attempted. Do not claim DocumentServer or deployment acceptance.

### Host-write registration risk coverage

- Public API / CLI / script entry — Selected: `register_host_write(chat_id, path)` returns the registered entry, including `file_id` and `revision`; consumers are later publish/save-as tasks.
- Config / project setup — Not selected: no settings or setup changes.
- File IO / path safety / overwrite — Selected: traverse only the requested relative path with no-follow directory descriptors, reuse safe hashing and durable index publication. Reject traversal, absolute paths, foreign-chat escapes, hidden segments, target/parent symlinks, missing/non-regular targets without changing index bytes/counter or opening external content.
- Schema / columns / units / field names — Selected: update hash, size, mtime_ns and fingerprints consistently; retain active id, allocate a fresh UUID for additions, preserve tombstones and all other entries. The same-size fixture has file revision 7 and counter 9; registration yields revision/counter 10.
- Auth / permissions / secrets — Not selected: no HTTP authorization or credential change. Root confinement is covered by path safety.
- Concurrency / shared state / ordering — Selected: caller retains the canonical lock across its file write and registration; registration may reenter that lock. A real flock-contention handshake proves a second-process reconcile waits and observes the committed id/revision.
- Resource limits / large input / discovery — Selected: file size, active count and encoded index size enforce existing configured bounds before publication; failures preserve predecessor bytes. Register only the requested path, never scan unrelated files.
- Legacy compatibility / examples — Selected: broker module regression suite; unchanged reconcile detection rules and schema. A reconcile after registered size change reports unchanged and retains counter/id/revision.
- Error handling / rollback / partial outputs — Selected: existing broker error classes, corrupt-index behavior and `_write_index` durability semantics retained. Rejections and pre-replace write failures leave predecessor intact; after-replace directory-fsync failure remains explicit `CommitDurabilityError`, not a false rollback claim.
- Release / packaging / dependency compatibility — Not selected: no images or dependencies.
- Documentation / migration notes — Selected: this fixture documents the registration boundary; no migration or new durable format.

Tests cover missing-index creation only after valid registration, a new path with tombstones present, unchanged sibling entries, and a fresh process reading id/revision/hash. Run the existing OCU unit command narrowed to the broker module; qualify same-size and lock-order assertions with disposable negative controls. A real-filesystem smoke writes different equal-length bytes inside the caller lock, registers, then observes the new hash/revision from a fresh broker and an unchanged subsequent reconcile. No DocumentServer or image evidence is claimed.

## 10. [ocu] Office broker store (spec: ocu-office-store)

- [x] 10.1 `office/` package with the per-chat state file: schema version, locked read-modify-write through the shared per-chat lock, atomic durable replace, explicit failure on corruption that preserves the prior state. The server image's `computer-use-server/Dockerfile` copies the new package (it copies modules one by one). Verify: tests cover two processes updating one chat without loss in either order, a corrupt file, a failure before replace, and restart persistence; a test asserts that every top-level `.py` module of `computer-use-server/` and every directory there that holds an `__init__.py` is named by a `COPY` line of that Dockerfile (directories without Python packages, such as `bin/` and `cli-defaults/`, are outside the check).
- [x] 10.2 Versions and receipts: content-addressed immutable blobs, per-document numbering, sources and the published flag, no new record when content equals the latest version, the free-space floor, receipts for every processed callback, and the safe read of a workspace file (no-follow, regular file, inside the chat's directory, no symlinked parent). Verify: tests cover identical content stored once, numbering, refusal below the floor without partial blobs, receipt lookup by sequence and hash, and a symlinked file and a symlinked parent directory each refused without being read.
- [x] 10.3 The restore-epoch marker: read `{BASE_DATA_DIR}/.office-restore-epoch`, an absent file being the initial epoch, and compare for equality. Verify: tests for an absent file, a token, and a changed token.
- [x] 10.4 Decision record `ocu-office-file-store` (design D5: per-chat files instead of a database). Verify: `make decisions-verify` passes.

Depends on: none beyond group 8.
Suggested fixture level: expanded - persisted shared state, file format, concurrency across worker processes.
Minimal mergeable slice: 10.1 (state file and locking) - green alone because nothing reads it yet; 10.2 and 10.3 build on its API; 10.4 is documentation.

### State-file slice risk coverage

- Public API / CLI / script entry — Selected: `OfficeStore.read(chat_id)` and `OfficeStore.update(chat_id, mutate)` return independent state snapshots; mutator executes under the canonical chat lock.
- Config / project setup — Not selected: use existing `BASE_DATA_DIR`; no Office settings yet.
- File IO / path safety / overwrite — Selected: state is confined to `.ocu/office/state.json`, never follows state/control-directory symlinks and is invisible to workspace listings. First update creates only its chat's state. Real temporary storage and external-sentinel tests prove confinement.
- Schema / columns / units / field names — Selected: exact top-level keys `schema_version`, `documents`, `sessions`, `receipts`, `journal`; version integer 1, four mapping collections. Invalid JSON/top-level shape/unknown version and unreadable state raise `StateCorruptError` without rewriting; record-specific validation belongs to later slices.
- Auth / permissions / secrets — Not selected: no route, auth or secrets; filesystem confidentiality boundary belongs to path safety.
- Concurrency / shared state / ordering — Selected: two separate workers commit independent mutations in both forced orders, retaining both changes. Real nonblocking flock denial proves a mutator cannot run until the holder releases the canonical lock; same-thread nesting remains valid.
- Resource limits / large input / discovery — Not selected: no quota or discovery policy introduced; free-space admission belongs to task 10.2. Existing state is never pruned.
- Legacy compatibility / examples — Selected: existing broker/lifecycle unchanged; missing state returns the empty schema without a state file; fresh-process read equals the committed state, no in-memory cache.
- Error handling / rollback / partial outputs — Selected: invalid mutator output or callback failure preserves predecessor. Kill a writer after its temp successor is fsynced but before replace; next read is the complete predecessor. Pre-replace write errors preserve it; post-replace directory-fsync failure raises explicit `StateDurabilityError` and does not claim rollback.
- Release / packaging / dependency compatibility — Selected: every server top-level `.py` and directory containing `__init__.py` has a Dockerfile COPY source. Omit the `office/` COPY in a disposable fixture and prove test rejection; no image build.
- Documentation / migration notes — Selected: companion `ocu-office-file-store` decision, implemented/architecture, names PostgreSQL and SQLite alternatives, shared lock and no cross-chat query cost. `make doc-gate` and `make decisions-verify`.

Run the OCU unit command narrowed to the new state-store and COPY-inventory test modules. Independent real-filesystem smoke updates a chat in a subprocess, reads it in another, and proves unrelated chat/workspace bytes unchanged. HTTP `state_corrupt`, record shapes, versions, receipts behavior, epoch and real sandbox isolation are later tasks; no B1 or image acceptance claim.

### Version and receipt slice risk coverage

- Public API / CLI / script entry — Selected: store methods for a version with optional receipt, receipt-only recording/lookup, monotonic publish marking, standalone floor check and safe workspace read. No HTTP answers yet.
- Config / project setup — Not selected: caller supplies a nonnegative byte floor; task 11.1 owns its default and setting.
- File IO / path safety / overwrite — Selected: immutable no-replace content-addressed blobs; verify existing blob bytes/hash before reuse; no-follow regular-file reads through pinned parent descriptors. Root/parent/leaf symlink, traversal, hidden control paths and special-file cases return no external bytes and create no version/staging file.
- Schema / columns / units / field names — Selected: version fields and six sources match the spec; per-document numbers start at 1 and increase, parent is null for first or an existing prior number. Equal latest hash reuses that record; old content encountered later adds a new number while reusing its blob. `published` only advances to true. Receipt fields bind session, sequence, status, hash, version and answer; version+receipt share one state update.
- Auth / permissions / secrets — Not selected: no routes/credentials; file confinement covers the byte boundary.
- Concurrency / shared state / ordering — Selected: hold canonical lock across latest-state lookup, blob publication and state commit. Two processes storing distinct content retain contiguous records and both receipts; identical content does not duplicate blobs or latest records.
- Resource limits / large input / discovery — Selected: compare actual available filesystem bytes with the supplied floor; below rejects, equality admits. Standalone check works without storing content. No quotas, pruning or default floor invented.
- Legacy compatibility / examples — Selected: existing state read/update/error/lock behavior and broker tests unchanged; empty document maps remain readable. Workspace capture/session metadata are later tasks.
- Error handling / rollback / partial outputs — Selected: precommit floor/ENOSPC failures retain state bytes, leave no new final blob or receipt and clean owned temporary files. Never remove a preexisting shared blob. Preserve explicit postreplace state durability failure semantics rather than deleting content a visible committed record references. Invalid arguments/corrupt state fail before content publication.
- Release / packaging / dependency compatibility — Not selected: reuse `office/` already copied by the server Dockerfile; no new top-level module or dependency.
- Documentation / migration notes — Selected: fixture records APIs, record ownership and transaction boundary; no new decision or migration.

Run the Office store test module together with the existing package-inventory test. Tests include shared blob across two documents, nonconsecutive repeat content, three sources numbered 1/2/3, equal-latest receipt reuse, immutable published transitions, receipt status 7 without content, sequence/hash lookup after process restart, version5 with save_seq3, floor below/equal and standalone refusal, mid-blob and precommit state ENOSPC cleanup, and external-read negative controls. Runtime smoke reads and hashes a nested workspace file, stores versions/receipts, restarts the reader and confirms history plus untouched workspace bytes.

### Restore-epoch reader risk coverage

- Public API / CLI / script entry — Selected: `office.epoch.current_epoch() -> str | None`; native equality is the comparison, no separate ordering/parser API.
- Config / project setup — Not selected: read existing `docker_manager.BASE_DATA_DIR` at call time; no new setting.
- File IO / path safety / overwrite — Selected: read only `.office-restore-epoch` with no-follow/nonblocking regular-file access; no mkdir/write. Symlink, directory and FIFO fail without external reads or blocking.
- Schema / columns / units / field names — Selected: `None` is initial/absent and JSON-roundtrips as null; every stripped UTF-8 string, including `""`, is a token distinct from initial. Do not parse UUIDs/numbers or reject readable empty content.
- Auth / permissions / secrets — Not selected: no route, auth or credential.
- Concurrency / shared state / ordering — Selected: no cache; same process observes absent/A/B changes, fresh worker reads current token. Restore's atomic marker write and session comparisons remain later owners; no new writer lock.
- Resource limits / large input / discovery — Not selected: no scan, quota or new token-length policy.
- Legacy compatibility / examples — Selected: marker absent (including missing parent path) is initial and creates nothing; state/version behavior and Dockerfile package copy unchanged.
- Error handling / rollback / partial outputs — Selected: only ENOENT is absence; other filesystem errors and invalid UTF-8 raise `RestoreEpochError` with cause, never initial. Portable EACCES/EIO injection and actual directory refusal.
- Release / packaging / dependency compatibility — Not selected: package-level COPY already includes the module; run inventory test without image build.
- Documentation / migration notes — Selected: this fixture records opaque/empty/initial semantics; no new decision or migration.

Run the epoch test module and package-inventory test with the OCU unit command. Runtime smoke observes absent/A/B via the actual reader across process boundaries and confirms the reader never creates or changes the marker. Negative controls must reject swallowed read errors and stale cached values. Consumer orphaning and restore-token generation are explicitly outside task 10.3.

## 11. [ocu] DocumentServer configuration and client (spec: ocu-office-sessions, ocu-office-callback, ocu-auth-guard, ocu-documentserver-service)

- [x] 11.1 Office configuration module in the `office/` package: the four setting names of design D17 that OCU reads (`OCU_OFFICE_DOCSERVER_URL`, `OCU_OFFICE_DOCSERVER_ORIGIN`, `OCU_OFFICE_SELF_URL`, `OCU_OFFICE_JWT_SECRET`) defined as constants, plus the tuning values with defaults (free-space floor, ticket lifetime, liveness interval, save timeout), validated in `auth_guard.startup_preflight`, the function the packaged multi-worker entrypoint already calls — Office editing is enabled when the address is configured, there is no separate switch; an address with a missing or blank secret, origin or self address exits non-zero, and no address needs none of the others. Verify: startup tests for each combination through `startup_preflight`, including the packaged multi-worker entrypoint.
- [x] 11.2 JWT signing and verification, source-ticket signing and verification with expiry and binding, and a command-service client (`forcesave` with `userdata`, key lookup). Uses the B1 item "`forcesave` echoes `userdata`". Verify: tests against a fake DocumentServer HTTP endpoint cover a valid round trip, a tampered token, an expired ticket, a ticket for another document, an unknown key, and command error codes.

Depends on: 3 (`auth_guard.py` and its test matrix are edited by groups 1 and 4, and every Office group that follows works on the single shared directory), 10 (the package).
Suggested fixture level: expanded - secrets, authentication tokens and production configuration.
Minimal mergeable slice: 11.1 (configuration and fail-loud validation) - green alone because no route uses it yet; 11.2 adds the token and client helpers.

### Configuration slice risk coverage

| Risk pack                                      | Selection and evidence                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API / CLI / script entry                | Selected: real `startup_preflight` result/stderr and packaged parent exits before serving.                                                               |
| Config / project setup                         | Selected: absent/empty/whitespace address disables; nonblank address requires secret, origin and self URL. No extra switch.                              |
| File IO / path safety / overwrite              | Not selected: no file reads/writes or persisted settings.                                                                                                |
| Schema / columns / units / field names         | Selected: four importable name constants match D17; positive integer tuning values carry units, liveness exceeds ticket lifetime.                        |
| Auth / permissions / secrets                   | Selected: unique secret canary absent from both output streams on success and missing-origin/self failure; no value interpolation in Office diagnostics. |
| Concurrency / shared state / ordering          | Not selected: call-time environment reads, no shared mutable state or cache; existing preflight failure precedence preserved.                            |
| Resource limits / large input / discovery      | Selected: defaults exist and liveness/ticket relation holds; consumers remain tasks 11.2, 12.2 and 13.3.                                                 |
| Legacy compatibility / examples                | Selected: unset Office address requires nothing else; existing auth/startup matrix unchanged.                                                            |
| Error handling / rollback / partial outputs    | Selected: each dependent setting absent, empty or whitespace produces nonzero plus its name; blank-address disabled cases pass.                          |
| Release / packaging / dependency compatibility | Selected: exercise packaged multi-worker command, no listener/respawn; package-inventory regression. No image certification.                             |
| Documentation / migration notes                | Selected: D17 defines defaults and environment boundary; no deploy setting additions.                                                                    |

Run config, auth-guard and package-inventory tests with the OCU unit command. Runtime smoke runs actual preflight in fresh processes for configured success and missing-setting refusal, including the packaged parent command. A whitespace-as-valid mutant must fail the new startup matrix. Defaults are local choices, not B1 measurements; task 11.1 does not wire their consumers.

### Token and command-client risk coverage

- Public API / CLI / script entry — selected: JWT and ticket public helpers return verified values only; command APIs distinguish every declared outcome.
- Config / project setup — selected: use the existing four setting names and source-ticket TTL; missing signing keys fail without values, no dependency or setting added.
- File IO / path safety / overwrite — not selected: no file access or persistence; source routes and blob reads belong to later tasks.
- Schema / columns / units / field names — selected: four ticket bindings, required expiry, positive integer version/sequence, JSON-string `userdata` carrying sequence and intent, strict integer command codes.
- Auth / permissions / secrets — selected: independent HS256 verification/vector; missing, malformed, altered, wrong-key, expired and wrong-algorithm tokens fail; a DocumentServer-secret ticket forgery fails; canaries stay out of logs/errors.
- Concurrency / shared state / ordering — selected: deterministic expiry-boundary and key-rotation cases, no token/cache state; state sequencing belongs to later session tasks.
- Resource limits / large input / discovery — selected: bounded HTTP timeout and response read, cancellation propagates and response/session resources close; timeout/refusal tests use a real local endpoint.
- Legacy compatibility / examples — selected: existing config and package tests remain green; standard HS256 token interoperability is independent of a helper round trip.
- Error handling / rollback / partial outputs — selected: command codes, malformed/non-success responses and unavailable transport never become accepted/known; no decoded values escape failed verification.
- Release / packaging / dependency compatibility — selected: standard-library HS256 and existing aiohttp only, package-inventory test; no image build or runtime deployment proof.
- Documentation / migration notes — selected: D7 owns helper APIs, wire format and outcome mapping, linked to official command documentation and the B1 echo observation.

Run token, command, configuration and package tests with the OCU unit command. The fake endpoint must independently verify the received signature and decode `userdata`; a second endpoint proves redirects never receive credentials. Runtime smoke crosses real local HTTP for force-save and key lookup plus refusal. Negative controls accepting expired tokens, bypassing signature checks and accepting a wrong algorithm must fail; restore the original source and confirm focused green.

## 12. [ocu] Office routes guard and session creation (spec: ocu-office-sessions, ocu-auth-guard, ocu-office-store)

- [x] 12.1 `auth_guard` coverage of `/api/office/` (internal token, canonical chat id, sandbox peers refused), an Office router module included by one line in `app.py`, 404 for every Office route when Office editing is not enabled, and no chat directory created by a request for an unknown chat. The module reload lists of the app tests (`_APP_MODULES` in `tests/orchestrator/test_outputs_endpoint.py` and `test_preview_prefix.py`) gain the new modules. Verify: `tests/test_auth_guard.py` gains the Office rows of the matrix; tests for the not-enabled case and the unknown chat.
- [x] 12.2 `POST /api/office/{chat}/documents/{file}/sessions`, creation: resolve the file, validate type, size and container through the safe read, capture the workspace content as a version when it is not one, record the restore epoch, return the signed editor configuration with server-to-server addresses and no secret. Verify: `TestClient` tests for each refusal (B-T13), a symlinked file refused with `unsafe_path`, the stored `workspace` version, and the configuration's contents.
- [x] 12.3 Join, the reopen check and status: one open session per document with a stable key, a join returning a freshly signed configuration with a new ticket; on reopening a session whose editor is still expected (`editing`, `saving`, `closing`, or `conflict` without the receipt of a final callback) the DocumentServer key check, which makes a forgotten session `orphaned` and then creates a new session, or refuses with 409 `unpublished_version` and creates nothing when the document's newest version is unpublished, and answers 502 when DocumentServer cannot be reached; `GET /api/office/{chat}/sessions/{session}` returning the persisted state from any worker with the epoch check. Verify: tests for a join from a second request and from a second worker (B-T05), a join of an `opening` session getting a usable ticket, the status fields, a session orphaned by a changed epoch, a forgotten session replaced when everything is published, the `unpublished_version` refusal followed by a successful second create, a `conflict` session without a final receipt orphaned the same way while one with a final receipt is returned without contacting DocumentServer, and the unreachable case.

Depends on: 9 (9.1 resolves the file), 11.
Suggested fixture level: expanded - new public API on a guarded shared entrypoint, persisted session state, auth.
Minimal mergeable slice: 12.1 (guard coverage and the not-enabled answer) - green alone because it adds no session behaviour; 12.2 and 12.3 add the routes behind it.

### Route availability slice risk coverage

- Public API / CLI / script entry — selected: all seven planned Office browser paths and unknown paths through the actual app, including unsupported methods and OPTIONS/preflight.
- Config / project setup — selected: call-time configured/unconfigured behavior; separate enabled/disabled app loads in one run.
- File IO / path safety / overwrite — selected: canonical path identity, no disabled-path filesystem inspection, missing chat rejected without a lock or directory creation; directory existence uses non-creating operations.
- Schema / columns / units / field names — selected: Office errors carry the D7 reason strings; existing non-Office errors are unchanged.
- Auth / permissions / secrets — selected: missing/wrong bearer 401, invalid literal/encoded chat 400, sandbox peer 403, including unknown Office paths; no header/query identity substitution.
- Concurrency / shared state / ordering — selected: auth precedes availability, disabled precedes stat, existence precedes any lock; fresh app module reloads prevent stale module/environment references.
- Resource limits / large input / discovery — not selected: no body parsing, document discovery, state loading or new resource allocator.
- Legacy compatibility / examples — selected: all existing guard rows and CORS behavior outside Office remain unchanged; outputs/preview app fixtures still load.
- Error handling / rollback / partial outputs — selected: Office-owned 404 reasons distinguish disabled, missing chat and unknown route; denied requests leave directory inventories and recording-endpoint counts unchanged.
- Release / packaging / dependency compatibility — selected: the existing Office package COPY covers the router; package-inventory test and both `_APP_MODULES` lists include the relevant imports.
- Documentation / migration notes — selected: D7 records middleware ordering and the permanent unknown-route fallback; no session stub is added.

Run the guard matrix, paired router, outputs/preview fixture regressions and package-inventory tests with the OCU unit command. Runtime smoke launches the actual packaged app for disabled/enabled configurations and observes HTTP authorization/availability plus unchanged chat directories. The original app's unauthenticated Office 404 must become 401. Negative controls removing the prefix guard or moving availability ahead of authorization must fail the matrix.

The method-independent contract covers requests delivered to ASGI. The existing packaged httptools parser rejects the nonstandard `CUSTOM` method with HTTP 400 before ASGI; retain that transport observation separately. ASGI tests still require `CUSTOM` to reach the guarded fallback, while packaged smoke exercises recognized GET/POST/OPTIONS/PATCH/DELETE methods. No transport configuration changes are part of this slice.

### Session creation slice risk coverage

- Public API / CLI / script entry — selected: actual-app POST success and each named refusal, concrete-route precedence, unchanged guard/availability responses.
- Config / project setup — selected: configured self URL differs from browser gateway; missing epoch marker stays absent; existing configuration helpers unchanged.
- File IO / path safety / overwrite — selected: file/parent symlinks and nonregular files refused before content reads; refusal snapshots preserve existing bytes, normal refused files remain downloadable.
- Schema / columns / units / field names — selected: D9 document/session fields, version numbering and published pointer/hash, epoch and initial sequence verified in fresh persisted reads.
- Auth / permissions / secrets — selected: foreign file id isolation, independent JWT/ticket verification and exact secret-value exclusion from response body/headers.
- Concurrency / shared state / ordering — selected: two workers create at most one open session; all version/document/session records appear in one successor under the canonical lock; unrelated state survives.
- Resource limits / large input / discovery — selected: broker per-file cap before materialization, exact-limit and growth tests, bounded ZIP/XML processing, no artificial 20-session cap or DocumentServer request.
- Legacy compatibility / examples — selected: existing uncapped safe reads, version/receipt semantics, auth matrix and outputs/preview imports remain green.
- Error handling / rollback / partial outputs — selected: floor even on equal-latest reuse; precommit ENOSPC/mutator/signing failures leave no new records or owned blob; postreplace durability failure retains the complete successor; corrupt state is not replaced.
- Release / packaging / dependency compatibility — selected: existing Office package COPY and all three module reload inventories include new imports; package regression, no image build or new dependency.
- Documentation / migration notes — selected: D9 owns record names and the approved atomic/bounded extensions; no schema migration; join/reopen/status, force-save and control-plane serving remain later slices.

Run the OCU unit command for Office store/version/workspace/config/token/router/creation tests, auth guard, outputs/preview and package regressions. Prove the creation route red against pre-change source and reject semantic negative controls for split commits, unsafe reads and wrong signing bindings. A real packaged-app HTTP smoke must create a supported document, inspect its state/blob and signed configuration, exercise representative refusals and observe no outbound DocumentServer request. Validate this shared OpenSpec change strictly and run the WebUI documentation gates for its companion fixture.

### Join, reopen and status slice risk coverage

- Public API / CLI / script entry — selected: actual-app 201 creation, 200 join/status, 404 unknown session, 409 unpublished-version and 502 unavailable-key responses; existing guard/availability errors retained.
- Config / project setup — selected: absent/empty/equal/changed/unreadable restore marker, fixed-clock ticket refresh and existing command timeout; no setting added.
- File IO / path safety / overwrite — selected: join uses safe document admission without capture; final/epoch-orphan status traps workspace reads, while open status follows D13's targeted notice; refusal/orphaning snapshots prove version/blob/workspace preservation and no foreign access.
- Schema / columns / units / field names — selected: exact status projection, additive initial bookkeeping defaults, invalid present values fail closed; existing receipt statuses identify a final callback.
- Auth / permissions / secrets — selected: unknown/foreign session/file ids, independent fresh-ticket/config signatures and no credential values in body/headers; DocumentServer command binding remains unchanged.
- Concurrency / shared state / ordering — selected: two processes concurrently create/join one identity; another worker reads status; delayed lookup serializes same-chat transitions without blocking the application event loop; unrelated committed state survives.
- Resource limits / large input / discovery — selected: bounded existing key lookup, no retries/global scan/cap; shared bounded-read and OOXML admission regressions remain green.
- Legacy compatibility / examples — selected: atomic creation and all existing format/path/refusal proofs retained; replace temporary repeated-create 409 assertions with join behavior; old valid records project initial bookkeeping without being rewritten.
- Error handling / rollback / partial outputs — selected: unreachable lookup preserves bytes; changed epoch skips lookup; durable orphan plus unpublished-version refusal is followed by successful creation; failed replacement cannot publish partial capture or revive the orphan.
- Release / packaging / dependency compatibility — selected: new imports included in all reload inventories, package discovery regression; no dependency, image or deployment change.
- Documentation / migration notes — selected: D9 owns join source-version choice, nonce freshness, status defaults and transition write boundaries; no schema migration or early implementation of later lifecycle operations.

Run Office session/join/status/token/store/version/workspace/epoch/config/command/router modules and auth/outputs/preview/package regressions with the OCU unit command. Pre-change evidence must show duplicate POST 409, status GET 404 and equal-time identical tickets; changed behavior returns 200/200 and distinct valid tickets. A recording local DocumentServer exercises actual signed key lookups. Packaged two-worker HTTP smoke covers create/join/status, known/forgotten/unreachable keys and epoch orphaning. Negative controls for stale ticket reuse, overwritten baseline, ignored epoch and unavailable lookup mutation must fail their behavioral assertions; strict OpenSpec and documentation gates cover the companion fixture.

## 13. [ocu] Save, close, change notice and the session sweep (spec: ocu-office-sessions)

- [x] 13.1 `POST .../save` and `POST .../close`: `save_seq` allocation, intent `publish` for a user save and `persist` for auto-save, the forcesave command with user-initiated force save left off in the editor configuration (the B1 item "the editor's own save command produces no callback" is what makes the status bar button the only save), close as recorded intent, a close of a never-opened session ending it at once, and `orphaned` when DocumentServer no longer knows the key. Add no artificial 20-connection check or global live-count query. Verify: tests with the fake DocumentServer cover each path (B-T15 creation and joining beyond twenty documents without a synthetic cap, B-T10 denied new operation), a save refused outside `editing`, a repeated close, and the editor configuration carrying user-initiated force save off.
- [x] 13.2 Status change notice: the status response checks only the edited file through the safe read — `stat`, hash on change — and reports `workspace_changed` against the session baseline. Verify: tests for unchanged, size-changing, same-size with changed mtime, deleted and symlinked file; no other file is read.
- [x] 13.3 Session sweep in the existing idle-reclamation poll (`app.py` `_idle_reaper`): a session without activity for the liveness interval whose key DocumentServer no longer knows becomes `orphaned`; a `saving` session past the save timeout returns to `editing` with `save_timeout`; an unreachable DocumentServer changes nothing. Verify: tests with the fake DocumentServer for each rule and for two workers sweeping the same chat.

Depends on: 12.
Suggested fixture level: expanded - persisted session state machine on public routes, a periodic job that changes state.
Minimal mergeable slice: 13.1 (save and close) - green alone because the routes only record intent and call the command client; 13.2 and 13.3 are independent additions.

### Save and close request slice risk coverage

- Public API / CLI / script entry — selected: actual-app 202/409/422/502 save/close matrix, unknown session 404 and exact response bodies; guard/availability precedence unchanged.
- Config / project setup — selected: B1-qualified `customization.forcesave: false` on create and join inside the signed payload; no timer or new environment option.
- File IO / path safety / overwrite — selected: commands leave workspace/version/blob bytes unchanged; no workspace read is needed for request admission; absent/foreign chat/session containment retained.
- Schema / columns / units / field names — selected: monotonic sequence, per-sequence save intents, separate pending-save/pending-close identities; malformed present metadata fails without reset.
- Auth / permissions / secrets — selected: denied save/close cannot allocate or call DocumentServer; fake endpoint independently verifies exact signed command key and userdata; response/log canaries remain absent.
- Concurrency / shared state / ordering — selected: save/save and close/close across processes; durable allocation observed before command; callback-side lock acquisition during command; delayed ordinary outcomes preserve concurrent close/conflict while still-owned unknown-key liveness orphans them; completed callbacks, newer saves, final records and epoch orphans defeat stale reconciliation.
- Resource limits / large input / discovery — selected: reuse bounded existing command client, no retries/count queries; invalid JSON/body types fail before mutation; no network wait while holding the force-save chat lock.
- Legacy compatibility / examples — selected: create/join/status and initial metadata semantics retained; old no-operation records initialize lazily without altering unrelated history; no alternative store/client.
- Error handling / rollback / partial outputs — selected: failed allocation sends no command; rejection/unreachable retains allocated sequence and intent, returns editing only for its own outstanding save; nothing-new advances only the owned committed counter; epoch and terminal states never revive.
- Release / packaging / dependency compatibility — selected: any new module joins all reload inventories and existing package discovery; no dependency, image or deployment changes.
- Documentation / migration notes — selected: D9 owns allocation/reconciliation fields and close behavior; B1 observation remains bounded; callbacks, publication/last-published advancement, sweep and UI timer remain named later slices.

Run paired save/close tests plus existing Office/session/lifecycle/token/command/store/router and auth/outputs/preview/package regressions with the OCU unit command. Baseline shows save/close 404 and missing explicit force-save setting. Real packaged HTTP smoke must exercise both save intents, command outcomes, close branches and signed force-save-off configuration without adding a version. Negative controls for command-before-commit, lock-held command, sequence reuse and delayed-response state overwrite must fail behavioral assertions. Strict OpenSpec and documentation gates cover the companion fixture.

### Workspace-change notice slice risk coverage

- Public API / CLI / script entry — selected: actual status response changes only the advisory boolean; existing response keys, lifecycle/epoch errors and save admission remain intact.
- Config / project setup — not selected: no new setting, startup behavior or dependency.
- File IO / path safety / overwrite — selected: one descriptor-safe edited-file observation; no-read cache hit; deleted/moved, leaf/parent symlink, non-regular and unsafe-read recovery; no other workspace-file stat/read or content write.
- Schema / field names — selected: existing baseline remains authoritative; absent cache pair initializes lazily, valid integer size/nanosecond pairs persist, partial/malformed pairs fail; equal-metadata blind spot is explicit.
- Auth / permissions / secrets — selected: denied/foreign/unknown session status never accesses the workspace or another chat; no DocumentServer request or credential disclosure.
- Concurrency / shared state / ordering — selected: canonical lock and targeted mutator preserve version/receipt commits across workers; notice cannot erase reason, sequence, pending allocations or unrelated state; epoch orphaning precedes notice IO.
- Resource limits / discovery — selected: existing per-file limit bounds hash misses; size/mtime hits read no content; no reconcile, workspace scan or new cache service.
- Compatibility — selected: existing creation/read/store APIs stay unchanged; status projection consumers and save/close ownership regressions remain valid; terminal records are not initialized or rewritten by the notice.
- Errors / partial outputs — selected: missing/unsafe/unstable/oversized samples report true and invalidate hints; corrupted broker/state metadata and state write/durability failures stay explicit, not swallowed as notice results.
- Packaging / documentation — selected: any new status helper module enters all existing reload inventories and package discovery; D13 owns cache fields, baseline ownership and later-writer invalidation.

Run the targeted notice tests plus Office session/lifecycle/save-close/workspace/store/version and auth/output/preview/package regressions with the OCU unit command. Baseline actual-app status remains false after an external size-changing edit; the implemented path reports true without a lifecycle change. Packaged two-worker HTTP smoke covers first observation, unchanged polling, safe changes, missing/unsafe recovery and save acceptance. Qualify negative controls for unconditional hashing and bookkeeping that drops pending or unrelated state; observe a concurrent callback-like commit through the real store rather than implementing callbacks. Strict OpenSpec and documentation gates cover the companion fixture.

### Session sweep slice risk coverage

- Public API / job entry — selected: real `_idle_reaper` tick transitions and public save-after-timeout 202; request producers refresh activity without changing response shapes.
- Config / setup — selected: reuse existing liveness/save defaults and poll interval; disabled Office performs no Office discovery or lookup, sandbox reclamation tests unchanged.
- File IO / path safety — selected: Office-only chat discovered without following linked control paths or creating absent state; no workspace/version IO or content mutation.
- Schema / units — selected: persisted Unix-second activity and save-start fields, strict boundaries, absent clock disabling only its own predicate, malformed values refused and backward-clock behavior. Historical records with no clocks have no inferred age or automatic backfill.
- Auth / secrets — selected: denied/foreign requests cannot refresh activity; fake DocumentServer independently verifies signed info commands; diagnostics omit keys/credentials.
- Concurrency / ordering — selected: canonical lock spans read/check/lookup/targeted update; two processes serialize and preserve unrelated updates, allocations and history.
- Resource limits / discovery — selected: existing bounded key client, one lookup per eligible session, no retries or new timer; every Office-state chat independent of sandbox candidates.
- Compatibility — selected: exact public projections, final/ended-conflict conservation, notice no-read cache hits, command reconciliation and sandbox lifecycle regressions; activity-only state differences are explicit.
- Errors / partial outputs — selected: unavailable means no rewrite; bad chat does not suppress later chats or sandbox work; state write/durability failure cannot report a committed transition.
- Packaging / documentation — selected: reload inventories plus existing package COPY; D12 owns timestamps and timeout semantics. Journal/fence/callback/backup integration remains later work.

Run sweep tests with fake DocumentServer, clock and cross-process barrier, followed by session/notice/save-close/store/auth/package and unchanged sandbox-lifecycle regressions using the OCU unit command. Baseline actual poll leaves an overdue Office-only session unchanged; the new poll must recover it. Qualify negative controls for omitted Office discovery and erased pending allocation; restore and run the affected assertions. Packaged two-worker smoke observes idle orphaning and save-timeout recovery through the live poll; strict OpenSpec and documentation gates cover this fixture.

## 14. [ocu] DocumentServer callback and persist (spec: ocu-office-callback, ocu-auth-guard)

- [x] 14.1 `GET /office/source/{ticket}` and `POST /office/callback/{chat}/{session}` with ticket and DocumentServer-JWT authentication, exemption from the internal-token carrier, sandbox-subnet rejection, no proxy exposure, and the check that the chat's data directory exists before the per-chat lock is taken. Verify: tests for a valid ticket, expired and foreign tickets, a bad signature, a sandbox-subnet peer, an internal token offered instead of the proper credential (B-T09), and a callback for a removed chat directory that creates nothing.
- [x] 14.2 Status handling 1 / 2 / 3 / 4 / 6 / 7 and unknown with the handling order of design D9: receipts for every processed callback, the final callback's `save_seq` and its void close allocation, the stale rule, status 6 / 7 leaving `closing` and `conflict` untouched, an error answer returning a `saving` session to `editing`, callbacks for unknown, ended or orphaned sessions, and the epoch check. Verify: recorded callback fixtures drive tests for each status, out-of-order and duplicate delivery including a retried final callback without a close request, the close → status 1 → auto-save → status 2 sequence, and no version regression (B-T04, B-T05, B-T08).
- [x] 14.3 Persist pipeline: accept a download address on the browser-facing or the server-to-server DocumentServer origin, fetch its path from the server-to-server origin with redirect validation, timeout and size limit; size, type and OOXML container checks; success acknowledged only after the version and receipt are durable. Uses the B1 item "origin of the download address". Verify: tests for an address on each accepted origin, an arbitrary host, a redirect to another host, an oversized body, a non-OOXML body, and a storage failure that returns an error to DocumentServer.
- [x] 14.4 Decision record `ocu-office-control-plane-routes` (design D7: two routes authenticated by ticket and DocumentServer JWT instead of the internal token). Verify: `make decisions-verify` passes.

Depends on: 13.
Suggested fixture level: expanded - a control-plane entrypoint authenticated without the internal token, outbound fetch, file writes.
Minimal mergeable slice: 14.1 (routes and their authentication) - green alone because an authenticated request is answered without further handling until 14.2; 14.2 and 14.3 add the handling behind it; 14.4 is documentation.

### Control-plane authentication slice risk coverage

- Public API / entry — selected: valid source returns exact bound bytes after workspace mutation; callback authentication accepts only the verified session key and returns 503 `callback_processing_unavailable` without claiming persistence.
- Configuration — selected: disabled Office yields 404 before credentials/state, except transport-peer denial retains 403 precedence; ordinary Office/browser routes retain existing auth.
- File IO / path safety — selected: missing chat creates nothing before lock; linked control directories, linked/nonregular/missing/corrupt blobs fail without external reads or fallback. Return verified bytes without reopening a path.
- Schema / field names — selected: ticket chat/file/version/session bindings and header-wrapper/body-token payload shapes; existing version/session schema remains unchanged. Unknown binding and corrupt persisted state stay distinguishable.
- Auth / permissions / secrets — selected: expired, malformed, altered, foreign-key and wrong-secret credentials; internal token cannot substitute; sandbox transport peer wins over forwarding headers; empty/transient/encoded callback chat ids fail before handler work.
- Concurrency / ordering — selected: canonical lock spans binding and immutable read; source/callback do not update activity or erase concurrent state. Directory safety is rechecked under lock.
- Resource handling — selected: malformed/non-object request envelopes fail explicitly; file descriptors close on all failures; the approved verifier returns its existing bytes rather than reading/hashing twice. No new capacity policy or configurable limit.
- Legacy compatibility — selected: existing blob write/deduplication/hash-error behavior, ordinary access logs, unrelated CORS and all internal-token-protected routes remain intact.
- Errors / partial outputs — selected: every callback failure is non-200 with reason; invalid credentials read no version content, make no outbound request and change no state. Authenticated callbacks change nothing until processing lands.
- Packaging — selected: new module discovery/COPY and all app-reload inventories remain consistent; packaged workers install access-log protection before requests. No dependency or image work.
- Documentation — selected: D7 and the companion `ocu-office-control-plane-routes` architecture decision own credential separation; no gateway exposure, status dispatch or publish implementation.

Run the new control-plane HTTP cases, auth/router/token/config/session/version/store and packaging regressions with the OCU unit command. Capture baseline failures at the real routes before source changes. Qualify negative controls for unsigned-field trust, credential-bearing access logs and unsafe external-target opens; traps must escape broad production exception handling. Real packaged-worker smoke covers source hash fidelity, authenticated callback non-success, removed-chat no-create, ordinary logs and ticket redaction for valid/invalid/disabled/peer-denied requests. Run strict OpenSpec validation, `make doc-gate` and `make decisions-verify` for the companion fixture/record.

### Callback persistence slice risk coverage

- Public API — selected: real callback route covers statuses 1/2/3/4/6/7, unknown status, verified-payload authority and exact reason/status responses. Retire admission-only 503 expectations without weakening authentication tests.
- Configuration — selected: both configured origins are accepted but only the internal origin receives requests; no new environment variable or dependency.
- File IO / safety — selected: canonical version staging, valid/wrong-type/corrupt OOXML, exact unchanged workspace and index, safe removed-chat refusal and empty staging after precommit failure.
- Schema — selected: receipt status/hash/version/answer, recorded intent, participants, pending allocations and monotonic counters; final allocation and receipt share one commit.
- Auth / secrets — selected: retain JWT/key and peer boundaries; unsigned body cannot select a download; foreign origin and redirect get zero arrivals; no credentials forwarded or logged.
- Concurrency / ordering — selected: late/out-of-order saves, all-state receipt replay, voided close followed by save/final, cross-worker duplicate serialization and ASGI health while the chat lock is held. Epoch check precedes dispatch and replay.
- Resource limits — selected: bounded actual body bytes, total timeout and redirect hops; timeout/oversize refusal leaves no receipt or staged content and permits a successful retry.
- Compatibility — selected: existing save/close/sweep/epoch/store/OOXML/auth/source and package tests; no helper signature, storage primitive, listing revision or published-version regression.
- Partial failures — selected: storage floor, write/fsync failure and kill after download before store; no success before durability, no successful receipt for a processing error, fresh-process blob/record/receipt after acknowledgement.
- Durability replay — selected: inject the state-directory fsync failure after replace through the real callback route; first response is non-200 but the matching visible blob/version/receipt survive. A fresh worker's replay remains non-200 while its directory barrier fails; after recovery it returns the original answer without a final download, state rewrite, extra version/receipt/sequence or workspace/index change.
- Packaging — selected: any new Office module joins the existing module/reload inventories and Dockerfile package-copy convention; no image builds.
- Documentation — selected: D10 owns the serialized transaction and persist-only state boundary; public evidence distinguishes recorded statuses 1/2/4/6 from synthetic 3/7 error fixtures.

Run canonical OCU `tests/` discovery with the callback/download and affected Office,
auth, outputs and package module selection. Parent captures the status-1 tracer
RED before implementation, then the complete GREEN run. Qualify semantic
negative controls for receipt/hash ordering, origin confinement and premature
acknowledgement. A real packaged two-worker smoke must persist via signed HTTP,
compare workspace/index before and after, replay without an extra final fetch,
and read the acknowledged record/blob/receipt from a fresh process. Use bounded
owned-process crash/retry evidence at the postdownload/prestore boundary.
Strict OpenSpec validation and doc/decision gates cover the companion fixture.
Journal/publish outcomes and their crash-recovery evidence remain tasks 15/16.

## 15. [ocu] Publish inside the fence (spec: ocu-office-publish)

- [x] 15.1 Publish for a sandbox that is not running: under the per-chat lock take the journal entry, resolve the path from the persisted index, compare the workspace hash with the baseline through the safe read, replace atomically through an exclusive no-follow temporary file with a second parent-component check, register with the outputs broker, and finish in one state update. Verify: tests for a clean publish, a baseline mismatch, a missing path and an unrecorded rename (nothing written), a file replaced by a symlink and a parent directory replaced by a symlink each ending as the conflict `baseline_mismatch` with nothing read through the link, a parent swapped for a symlink between the hash and the replace through a test seam ending as `unsafe_path`, an unreadable index (`index_unavailable`), a same-size publish that bumps the revision (B-T07, B-T13), a background writer changing another file during the publish, and a concurrent launch that runs only after the publish (B-T06).
- [x] 15.2 Publish for a running sandbox: pause, verify paused, replace, unpause, and remove only the owned marker after positive nonpaused/not-running observation. Pause failure keeps the version. At a safe boundary with elapsed time >= 5 seconds, stop new publication mutation and clean up after an in-flight operation settles; incomplete postreplace commits retain journal responsibility and visible completed success is not rewritten. Verify: fake-engine pause/refusal, exact-budget boundaries, delayed-operation overrun, failed unpause and retention stop cases (B-T06). Timing follows the user ruling recorded in D11.
- [x] 15.3 Recovery: the stale-fence marker cleared by the startup sweep and the idle-reclamation poll with the sandbox unpaused, and a journal entry left by a crash driven again at startup, by the poll (before the session sweep of 13.3 checks the chat's sessions) and before the next publish. Verify: tests that kill the publish at each step and restart (B-T06, B-T11); the sandbox is never left paused, the file is never half-written, and the owned workspace temporary file is removed. The approved private staging protocol permits harmless unbound/retired private leftovers, never foreign-file deletion.
- [x] 15.4 Decision record `ocu-office-publish-fence` (design D11, D12: two states, pause as the only barrier, no reconcile inside the publish, no lease for retention or recovery). Verify: `make decisions-verify` passes.

Depends on: 9, 13 (15.2 and 15.3 edit `docker_manager.py`, which group 3 changes, and the idle-reclamation poll, which 13.3 changes; group 13 brings groups 10 and 3 with it).
Suggested fixture level: expanded - concurrency with sandbox writers, atomic file replace, crash recovery, path safety.
Minimal mergeable slice: 15.1 (not-running publish) - green alone because it needs no engine call and is the base of the running path; 15.2 and 15.3 extend it; 15.4 is documentation.

### Stopped-sandbox publication slice risk coverage

- Public API / CLI / script entry — Selected: the internal journal consumer returns published/conflict/failed outcomes; direct module tests assert the persisted effects. No HTTP route or callback caller until group 16.
- Config / project setup — Not selected: no configuration, dependency or deployment change.
- File IO / path safety / overwrite — Selected: absent/exited sandbox success; baseline mismatch with equal size and mtime; missing and renamed paths; initial file/parent symlinks; late symlink and directory-identity swaps; exclusive temporary-name collision. Outside targets remain unread and unchanged; cleanup removes only owned temporary content.
- Schema / fields — Selected: journal document/version/session bindings, recorded target/temp metadata before workspace access, version published flag, document publication metadata and session baseline. Success changes these and removes the entry in one Office successor; lifecycle, sequences, receipts and sibling documents remain unchanged.
- Auth / permissions / secrets — Not selected: no route, credential, peer or authorization change; paths remain bound to the validated journal's chat and document.
- Concurrency / ordering — Selected: real `launch_sandbox` waits on the canonical lock and sees complete published bytes. An unrelated-file writer cannot force a reconcile or fail publication. Stopped/absent observation occurs inside the lock; running/paused/unknown state and engine uncertainty cannot enter an unfenced write.
- Resource limits / ownership — Selected: existing version limits are reused; held descriptors close on every path and pre-existing temp collisions survive. No new quota or retry policy.
- Compatibility — Selected: recorded rename retains `file_id`; same-size publish advances the broker counter once, and subsequent unchanged listings retain that revision. A second publish uses the updated baseline. Broker/store/lifecycle primitives remain unchanged.
- Errors / partial outputs — Selected: unreadable index gives `index_unavailable`; expected pre-replace refusals preserve workspace/publication metadata. Faults before replace, during registration and final-state publication never acknowledge success or erase recovery evidence; visible postreplace successors are not rolled back.
- Packaging — Selected: reuse the package-level Dockerfile COPY and preserve test module reload isolation. Runtime proof uses the actual publish module in a process and verifies files/index/Office state from a fresh reader.
- Documentation — Selected: the publish-fence decision includes alternatives, no-reconcile and no-lease rationale, and distinguishes accepted full design from this stopped-path implementation. Run `make doc-gate decisions-verify` and strict OpenSpec validation.

First capture the clean stopped-publication tracer RED before adding production code. Run the owning publish tests plus affected store/version/workspace/broker/lifecycle and Office consumers using canonical test discovery. Qualify unconditional hash, no-reconcile, path confinement and shared-lock assertions with controlled failures rather than mocks of the publisher. Runtime smoke observes publication, conflict, revision stability and fresh-process state; source verification is not a running-sandbox, crash-recovery, image or LAN certification.

### Running-sandbox fence slice risk coverage

- Public/internal API — Selected: one generalized publisher replaces `publish_stopped` atomically; preserve stopped-path results and migrate every test/document reference without an alias. No HTTP endpoint or caller wiring.
- Configuration — Not selected: no dependency, deployment toggle, timer service or mutation of the shared Docker client's timeout.
- File IO / schema / ownership — Selected: private durable marker contains pause-start time and container identity; pre-existing, linked or corrupt markers never grant ownership. Test creation/removal failures and exact journal/blob/index/workspace conservation across phases.
- Concurrency / state — Selected: freshly observed pause precedes real hash/replace; external pause remains external; retention stop never restarts; cleanup cannot unpause a replacement container. The canonical lock spans the transaction and release; no detached mutating worker survives timeout.
- Resources / timing — Selected: monotonic `>= 5` safe-boundary budget, exact-limit phase tests and a real delayed dependency. Distinguish prewrite timeout, interrupted postreplace journal retention and visible completed success. No hard wall-clock or live-worker cancellation claim.
- Errors / cleanup — Selected: pause refusal, effect despite API error, uncertain observation, failed unpause, marker durability errors and primary-exception preservation. Retain marker unless the owned sandbox is positively observed unpaused/stopped/absent.
- Compatibility / packaging — Selected: existing stopped, bounded-read, unsafe-path, permissions, registration and Office successor tests remain; engine helpers do not change launch/idle/retention. Preserve package COPY and reload isolation.
- Auth / secrets — Not selected: no route/auth change. Duration logs contain canonical chat, elapsed time and release/outcome facts, not tokens, request bodies or raw engine diagnostics.
- Documentation — Selected: update the existing publish-fence decision and the user-approved timing contract. Run formatter, doc/decision and strict OpenSpec gates; no claim of implemented recovery.

Capture a running publication RED through the existing callable publisher before the cutover. Verify actual filesystem behavior with the fake engine, including a writer that actually quiesces while paused; qualify skipped pause observation, ignored expiry and unowned release/marker deletion oracles. The parent process smoke records engine events, bytes, marker ownership and honest duration, including safe cleanup after a blocking overrun. Real Docker/image/LAN acceptance remains outside this source slice.

Issue #136 source evidence: 127 focused publication cases and 1,170 affected Office/broker/lifecycle cases passed. Controlled skipped pause observation, ignored deadline and uncertain-marker deletion each failed their behavior oracle. A real POSIX writer was stopped and resumed through the fake engine while publication and a fresh reader verified complete OOXML bytes, index and Office state. A separate real blocking replacement overran five seconds, returned `interrupted / publish_timeout`, retained the prepared journal and unpublished version, left the original index unchanged and released the owned fence only after the operation settled. These are same-service-UID host-process checks, not real Docker or deployment certification.

### Publish recovery slice risk coverage

- Public/internal API — Selected: one recovery orchestration boundary reuses the canonical publisher; startup, idle poll and pre-publish trigger it without recursion. No callback/request outcome wiring until group 16.
- Configuration — Not selected: preserve disabled-Office no-discovery behavior and the existing poll interval; no new setting, service or lease.
- File IO / schema / ownership — Selected: validate persisted marker and journal bindings; the user-approved staging prerequisite establishes durable private-anchor authority before no-clobber workspace exposure. Confine cleanup and verify ownership, not just name syntax. Test real abandoned temporaries, foreign regular/symlink collisions, substituted private/shared entries, already-absent files and unsupported/cross-device links; preserve safe reads, immutable versions, complete successors and final-state durability.
- Identity / compatibility — Selected: release only the marker's original container, retain external pauses and preserve file identity. Re-registration may advance the broker revision after a crash; completed recovery is a no-op and never rewrites already-published workspace bytes.
- Concurrency / state — Selected: canonical lock spans recovery and the following session read or new publish. Old obligations complete before the new baseline comparison; live publisher ownership excludes a recovery worker. Unresolved entries cannot be followed by session key lookup/orphaning.
- Discovery / integration — Selected: reuse safe Office enumeration for metadata-free chats at startup and poll; isolate corrupt chats and preserve sandbox reclamation, session policy, package COPY and reload inventories.
- Errors / resources — Selected: strict marker-age boundaries, failed-once unpause, unknown/replaced containers, marker durability faults, repeated interruption and descriptor/lock cleanup. No primary-error masking, false rollback or obligation removal without an outcome.
- Auth / secrets — Not selected: no route or credential change. New failure reporting must preserve the existing redaction of persisted identities and engine exception text.
- Documentation — Selected: update the existing publish-fence ADR after runtime proof; strict OpenSpec, formatter and doc/decision gates. Do not claim callback mapping, real-engine/image/LAN or power-loss certification.

Capture one semantic recovery RED through an existing callable sweep/publish before implementation. Run owning recovery/publication/sweep tests plus affected Office, app/lifecycle and broker consumers through canonical test discovery. Cover preparation, marker install, pause, staging, replacement, registration, release and final-state crash points; never-started entries; baseline conflict; no-second-write completion; prior-before-new ordering; Office-only startup/poll; external/young/corrupt fences; uncertain release; and recovery-before-session-read. Actual killed-process/fresh-process recovery and concurrent-worker lock smoke supplement deterministic faults. Qualify no-rewrite, ordering and owned-release oracles with semantic controls. Migrate only obsolete inert-invalid journal fixtures, retaining their meaningful conservation assertions and adding explicit malformed-obligation refusal coverage.

The [user approved including the minimal publisher staging prerequisite in #137](https://github.com/DankerMu/open-webui/issues/137#issuecomment-6007445205), without weakening automatic crash recovery. Fresh-process tests must cover both sides of anchor creation/durability, journal binding, shared exposure and anchor removal, plus another crash during recovery cleanup. Existing foreign-file and foreign-inode preservation assertions remain; ordinary legal crash states must not be reclassified as manual-recovery cases. The local topology probe demonstrates hard-link feasibility only on the host test filesystem, not deployment certification.

Issue #137 source evidence: the existing Office sweep tracer failed before implementation and passed after it. The four owning publication/recovery/sweep modules pass 328 cases. Parent probes found and reproduced unfenced recovery cleanup and indefinite missing-parent recovery; six permanent cases failed before the repair, then twelve boundary/preservation cases passed. Independent process smoke kills the publisher with SIGKILL at shared exposure, replacement and durable retirement, controls a real POSIX writer through the fake engine, and verifies fresh-process recovery/readback and repeat no-op. Already-replaced bytes are not written again; the retirement cut leaves two harmless private names and may register another revision. Negative controls fail the no-second-write inode, recovery-before-DocumentServer and fresh-pause-before-cleanup oracles. This is same-UID host-process evidence, not real-engine/image/LAN or power-loss certification.

## 16. [ocu] Persist-to-publish wiring (spec: ocu-office-callback, ocu-office-sessions, ocu-office-publish)

- [x] 16.1 A callback with publish intent writes the version, the receipt and the journal entry in one state update and then publishes; the outcome sets the session as design D11's table says — the published or failed outcome of a save that is not the outstanding one leaves the state as it is — and `last_published_seq` advances as D9 defines; a duplicate of the callback drives an entry that survived a crash; a conflict met by a status 6 result while the session is `closing` leaves it `closing` until the final callback meets the conflict again; and a journal entry is driven to its outcome before its session is marked `orphaned`, on a request and in the sweep, the orphaning then applying to the state the outcome left. Verify: tests through the callback route for save, close, conflict and each failure reason; a crash after the version is durable and before the publish ends published or in conflict after the retry; the late callback of `save_seq` 3 published while `save_seq` 4 is outstanding leaves the session `saving`; a status 6 conflict in a `closing` session followed by the final callback ending in `conflict`; a session with a surviving save entry found forgotten by DocumentServer has the entry driven first, holds none afterwards and is `orphaned`, while one whose surviving entry followed a final callback ends `closed`, `conflict` or `error` and is not orphaned.
- [x] 16.2 Nothing new to save: a publishing save for which DocumentServer reports nothing new, and a status-4 callback, publish the session's latest stored version when it is unpublished; a save of either intent that finds nothing new while the latest version is already published advances `last_published_seq`. Verify: tests for save after an auto-save with no further edits, a second save with no change, status 4 after an unpublished auto-save, an auto-save equal to the published content, an auto-save that finds nothing new after a publish (both sequence values advance), and one that finds nothing new while a version is unpublished (`last_published_seq` unchanged).
- [ ] 16.3 Unattended outcomes at close: `path_missing` is resolved at once by saving the version as a new deduplicated file, claimed with the no-replace helper of 1.1; a missing workspace files directory ends the session `error` with `workspace_missing` and creates nothing; `baseline_mismatch` stays a `conflict` for the next open. Verify: tests for each, including the new file's `file_id`, its first version's source and the Files listing.

Depends on: 14, 15 (group 1's claim helper is reached through 15 → 13 → 12 → 11 → 3 → 2 → 1).
Suggested fixture level: expanded - publish decisions on user data across a crash boundary.
Minimal mergeable slice: 16.1 (callback to publish) - green alone because it uses only the callback route and group 15; 16.2 and 16.3 add cases on the same path.

### Unattended-close publication risk coverage

- Public API / script entry — selected: authenticated final status 2 and unpublished status 4; observe callback ACK, session status, Files new identity and next-create pending conflict.
- Config / project setup — not selected: no settings, dependency or setup change.
- File IO / path safety / overwrite — selected: missing file, occupied first numbered name, occupied symlink, missing and symlinked ancestors, absent/unsafe outputs root and late parent replacement; no foreign write, old basename or directory recreation.
- Schema / field names — selected: copy journal recovery, new file_id/document/version1 with conflict source, unchanged source history/receipt/key, atomic saved_as/closed successor and notice invalidation.
- Auth / permissions / secrets — selected for preservation: existing callback and browser admission, no reads through links or unsafe roots, private immutable blobs never exposed as writable workspace inodes.
- Concurrency / shared state / ordering — selected: canonical lock/fence, concurrent callback/recovery, owned claim before returned-name persistence, registration before Office completion and foreign replacement conservation.
- Resource limits / discovery — selected for preservation: existing byte/index limits and safe-boundary pause budget; no Office directory creation for Files, no reconciliation inside publication, detached worker or unbounded content scan.
- Legacy compatibility / examples — selected: normal save path_missing stays conflict; leaf-symlink conflict, no-change publication, final ACK/replay and pending-conflict create remain unchanged. The final parent-symlink exception is the user-approved D13 policy.
- Error handling / rollback / partial outputs — selected: claim, registration, state durability and release failures cannot lose content or ownership; fresh-worker recovery yields one copy, one new document and one registration increment.
- Release / packaging — selected for preservation: normal package/reload discovery includes any owning module; source CI and existing package regressions, no image or deployment certification.
- Documentation / migration notes — selected: D13 owns the exception and recovery boundary; source Office documentation, strict OpenSpec, doc and decision gates.

Required parent evidence: real callback semantic RED, then every issue criterion
through callback/status/list/create boundaries. Cover missing paths with active
and tombstoned identities, known collisions and an unlocked claim competitor,
missing nested directory and parent symlink without Files refresh, unsafe root
and leaf controls, status-4 retained autosave and repeated final receipts.
Observe unchanged source history and immutable blobs, distinct new identity,
version1/source/published values, saved_as and monotonic counters.
Inject crashes before/after claim, before returned-name persistence, after
registration and around Office successor durability; verify fresh-process
completion without duplicate copy/index increment or foreign-file deletion.
Run owning and affected OCU units with full tests discovery, actual HTTP plus
killed-worker recovery, targeted negative controls and four-seat cross-review.
The existing claim helper and broker registration are called, not modified.

The approved Files identity handoff additionally requires recovery and subsequent
reconciliation under one uninterrupted canonical lock at every production Files
entrypoint. First capture an endpoint semantic RED: equal-content copy claim
interrupted, then Files before recovery must not assign the original identity.
Verify content matching another removed document, source-history conservation,
fresh-worker Files-first recovery with lifespan disabled and no callback replay,
and a two-worker barrier at the recovery/scan boundary. Undecided recovery yields
sanitized 503 with Retry-After and no scan/index change; corruption yields 500.
No-Office listing creates no Office tree; ordinary rename, auth, cursor and ETag
contracts remain. Reuse the existing publisher recovery and broker primitives;
do not introduce a reservation schema or broker-to-Office dependency.

### No-change publication risk coverage

- Public API / script entry — selected: real save route with DocumentServer nothing-new response and authenticated status-4 callback; preserve 202 acceptance and callback durable ACK.
- Config / project setup — not selected: existing feature configuration, clients and dependencies are unchanged.
- File IO / path safety / overwrite — selected: publish the retained autosave bytes through the existing fence; conflict preserves workspace, failed pause leaves the version retryable; no new file protocol.
- Schema / field names — selected: save completion plus bound journal, or status-4 contentless receipt plus bound journal, in one successor; no new version/blob, stable receipt schema and monotonic counters.
- Auth / permissions / secrets — selected for preservation: existing route admission and verified callback payload; no download from status 4 or final replay, no credential or gateway changes.
- Concurrency / shared state / ordering — selected: pending/key/terminal guards, delayed nothing-new after callback or newer allocation, concurrent close, final-receipt replay and frozen journal version; no stale publication or second allocation from a callback retry.
- Resource limits / discovery — selected for preservation: existing bounded commands, synchronous publication and startup/poll recovery. No new timer, detached worker or discovery policy.
- Legacy compatibility / examples — selected: all seven issue cases, already-published metadata-only completion, equal-content deduplication, persist-only unpublished no journal and no later recovery publication; existing save failure/orphan policies remain.
- Error handling / rollback / partial outputs — selected: pause-failed version is retried by a nothing-new publish save; conflict/failed/unresolved outcomes retain existing semantics; persist/receipt commit failure cannot lose an obligation or falsely acknowledge completion.
- Release / packaging — selected for preservation: full test discovery and existing package/reload inventories; no dependency, image or deployment change.
- Documentation / migration notes — selected: D8 owns this boundary, D9/D11/D13 retain sequence/outcome/cache ownership; strict OpenSpec and companion doc/decision gates.

Required parent evidence: one real save-after-autosave semantic RED before source
changes; the seven acceptance cases through save/callback routes; an observed
atomic obligation successor at each entry point and crash/fresh-process recovery
without duplicate history. A status-4 retry performs no download and no new
receipt/allocation/version. Demonstrate that already-published nothing-new
completion and persist-only unpublished completion cannot change workspace or
revision, including later recovery. Preserve stale/closing/final outcome guards
and the prior callback publication/notice regressions. Run owning and affected
unit discovery plus actual HTTP no-change save/status-4 and owned-process crash
smoke. Real engine/image/LAN and final missing-path behavior remain excluded.

### Callback publication risk coverage

- Public API / script entry — selected: authenticated status 6 publish and status 2 through the callback route; each terminal outcome still returns HTTP 200 `{"error": 0}` after durable persist.
- Config / project setup — not selected: existing configuration and dependency set are unchanged.
- File IO / path safety / overwrite — selected: real workspace/hash/revision assertions for published, mismatched and missing paths; reuse the existing fenced publisher without changing its file protocol.
- Schema / field names — selected: observe version, receipt and fully bound journal in one persisted successor before publication; observe lifecycle/sequence/publication metadata and journal removal in one terminal successor.
- Auth / permissions / secrets — selected for preservation: invalid credentials and mismatched duplicate status/hash never publish; final receipt replay fetches nothing. No credential or gateway changes.
- Concurrency / shared state / ordering — selected: late sequence 3 while 4 is pending; closing/conflict guards; startup, duplicate, create, save, close, epoch/status and sweep recovery before orphaning; final outcomes cannot be orphaned.
- Resource limits / discovery — selected for preservation: existing bounded download and publisher behavior; metadata-free startup/poll recovery remains covered. No new discovery or background execution.
- Legacy compatibility / examples — selected: persist-only callbacks retain behavior and no journal; duplicate callbacks without obligations retain version/receipt/sequence/revision identity; migrate persist-only expectations only where publication changes the contract.
- Error handling / rollback / partial outputs — selected: save/final matrix for all four failed reasons, conflict cases, interrupted obligation retention and unresolved-recovery orphan refusal. No successful response before durable persist.
- Release / packaging — selected for preservation: existing package/reload inventory and full-discovery pytest command; no dependency or deployment changes.
- Documentation / migration notes — selected: D11 owns completion and orphan ordering; strict fixture validation and companion doc/decision gates. No schema migration.

Required parent evidence: one real-route semantic RED before production edits;
owning callback/publish/session/sweep regressions and affected unit discovery;
independent HTTP callback smoke plus SIGKILL after durable persist, fresh-process
duplicate/recovery, and inspection of workspace bytes, broker listing and Office
state. Status 6 replay checks hash before driving; status 2 replay performs no
download or second version. The startup path leaves a recovered save editing.
Create/sweep cover recovered save success, conflict and failure with an unknown
key; final outcomes stay closed/conflict/error. The sweep preserves ordinary
pre-existing-conflict exclusion and existing liveness/timeout thresholds.
Final path-missing copy and workspace-missing policy remain task 16.3.

## 17. [ocu] Resolve, versions and restore (spec: ocu-office-publish, ocu-office-sessions)

- [ ] 17.1 `POST .../resolve`: publishes the session's latest stored version; `save_as` under a deduplicated name claimed with the no-replace helper of 1.1, in the original directory or in the workspace root when that directory is gone or not safe, with the session continuing on the new document; `overwrite` after storing the current workspace content as a version; only `save_as` when the path is gone; a missing workspace files directory refused with `workspace_missing` and the session ending `error`; a session whose editor has ended closed by the resolve. Verify: tests for each action, the two-conflict case, the refused `overwrite`, an `overwrite` of a symlinked file refused, a `save_as` after a symlinked parent landing in the workspace root, the removed workspace directory, and `last_published_seq` after a success.
- [ ] 17.2 `GET .../versions` and `POST .../restore`: list with source, published flag, the published version and `open_session` (`session_id`, `state`, `reason`, `editor_ended`), applying the epoch check and never contacting DocumentServer; restore makes the reopen check of 12.3 first, stores the current workspace content when it is not a version, creates a new version and publishes it, and is refused while a session is open, while DocumentServer is unreachable for the check, or when the path is gone. Verify: tests for the listing after an orphaned session left unpublished auto-saves, the listing of a pending conflict and of a joinable session, the listing after a changed epoch, a restore that first ends a session DocumentServer forgot, the 502 case, and each refusal (B-T14 at source level).

Depends on: 16.
Suggested fixture level: expanded - overwrite and restore decisions on user data, new public routes.
Minimal mergeable slice: 17.1 (resolve) - green alone because it adds one route on the publish path; 17.2 adds two independent routes.

## 18. [ocu] File responses are not cached (spec: ocu-file-headers)

- [ ] 18.1 `GET /files/{chat_id}/{path}` responses carry `Cache-Control: no-store`; the existing content-security and MIME behaviour is unchanged. Verify: `tests/test_files_headers.py` asserts the header on active and passive types and the unchanged headers.

Depends on: none beyond group 8.
Suggested fixture level: compact - one response header on an existing route.
Minimal mergeable slice: atomic - one header and its test.

## 19. [ocu] Editor host page shell (spec: ocu-office-editor-embed)

- [ ] 19.1 The preview page's `embed=office` mode (`static/preview.js` embed-mode list and the embed and content-policy branch of the preview route): requires a parent frame, renders only the editor container, carries a content policy that admits the configured DocumentServer browser origin and no other external origin, exposes no token or secret, and shows a visible error for an invalid, repeated or unframed embed value. Verify: preview shell tests for the emitted HTML, policy and each error case, in the existing preview test files (`tests/orchestrator/preview_embedding_browser.cjs`, `tests/orchestrator/_preview_capture.py`, `tests/orchestrator/test_preview_prefix.py`); the Files and runtime embed tests still pass.
- [ ] 19.2 Decision record `ocu-office-editor-frame` (design D15: a third iframe class hosting an OCU page whose policy admits the DocumentServer origin). Verify: `make decisions-verify` passes.

Depends on: 11 (the DocumentServer browser origin comes from its configuration; group 11 also brings group 4, which edits the same preview script and tests).
Suggested fixture level: expanded - a new embedded entrypoint on the trusted origin with its own content policy.
Minimal mergeable slice: atomic - the mode and its policy are one response; a mode without its policy would load an external origin under the default policy. 19.2 is documentation in the same PR.

## 20. [ocu] Editor host page behaviour (spec: ocu-office-editor-embed)

- [ ] 20.1 `static/office-editor.js`, protocol and state: the four messages with exact key sets and origin, chat and generation checks; session creation through the request wrapper; editor creation from the signed configuration; state reporting including `dirty`, `workspace_changed`, `reason` and broker `refused`. No cap-event mapping is added for the pinned release. Verify: module tests with a fake editor API cover a valid open, each rejected message, each reported state, a creation refused with a validation reason or `unpublished_version` (each reported as `refused` with no second create), and failed API loading or editor connection loss reported as `error`, without closing another tab's joined session.
- [ ] 20.2 The save / close / auto-save loop and teardown: `save` and `close` commands, the retry of a save refused while an auto-save is outstanding, status polling, the 5-minute auto-save when the editor reported a modification, the editor destroyed only after the close was accepted, and teardown that releases timers, listeners, pending requests and the editor. Verify: module tests cover each command, the auto-save timer, a second save with no change ending not dirty, a failed request never reported as success, and no late effect after teardown.

Depends on: 13, 19.
Suggested fixture level: expanded - a cross-frame protocol on the trusted origin that drives saves.
Minimal mergeable slice: 20.1 (protocol and state) - green alone because the page opens a session and reports state without sending saves; 20.2 adds the loop.

## 21. [deploy] Proxy table: Office rows (spec: ocu-reverse-proxy)

- [x] 21.1 Add the seven Office rows of design D7 to `routes.json`, the `{file}` and `{session}` single-segment placeholders to the renderer, and the new row count and pin. Verify: `deploy/proxy/tests/` cover owner forwarding of each row with the internal credential and chat identity, the mutation guard on the five POST rows, placeholder rejection of traversal and encoded separators, and 404 without upstream contact for `/office/source/…`, `/office/callback/…` and the imports route.

Depends on: 5 (both edit the route table and its pin).
Suggested fixture level: expanded - reviewed default-deny gateway table, authentication mapping and its pin.
Minimal mergeable slice: atomic - rows, placeholder validation and pin are checked together by the renderer; a table that does not match its pin does not render.

### Office gateway evidence

- API / auth — Selected: each of seven rows forwards the owner request to its unprefixed path with the internal credential and path-derived chat identity. Anonymous gets 401, foreign chat gets 404, neither contacts OCU. Each of five POST rows denies null origin or missing mutation header with 403; both GET rows work without that header.
- Path safety / compatibility — Selected: both new placeholders reject empty/extra segments, encoded slash/backslash, dot segments and double-encoded forms with 404 before OCU. Unlisted methods and shapes, prefixed/unprefixed source/callback paths and the imports GET never reach OCU. Retain existing upload, file and WebSocket cases.
- Configuration / schema / file IO — Selected: twenty existing row objects remain unchanged; exactly seven Office rows produce a 27-row pin. Gained/lost/altered tables and either placeholder without `{chat}` fail before replacing a valid private configuration. Placeholder validation must not pass solely because a stale pin happens to reject the fixture.
- Errors / documentation — Selected: preserve fail-loud rendering and private output modes; README describes the new routes and their limits. No rendered deployment config, credential or observation header is printed or committed.
- Storage, migrations, broker behavior and image topology — Not selected: no source/store/listener/compose change, no new decision, no Docker build or DocumentServer run.

Run the existing renderer unittest command and the full native proxy suite against
the existing recording fixture with owned loopback processes, plus
`tests/test-project-structure.sh`. Preserve a real Office forwarding failure
against the old table and the passing result after the atomic change. Stop owned
processes and remove private temporary files after retaining sanitized evidence.
The WebUI companion runs strict OpenSpec, doc and decision checks; production
broker/editor acceptance is not claimed by this routing proof.

## 22. [webui] Stub Office fixtures and gateway smoke (spec: ocu-stub, ocu-proxy-smoke)

- [x] 22.1 `scripts/ocu-stub.py`: deterministic Office session, status, save, close, resolve, versions and restore fixtures and an `embed=office` host page that speaks the message protocol without a real editor. The selectable outcomes are added once, as these scenario names of the stub's existing mechanism: `office` (default round trip), `office_conflict`, `office_unsupported` (415 `unsupported_type` at creation), `office_orphaned`, `office_save_as` (automatic save-as at close), `office_unpublished` (newest version unpublished, no session) and `office_stale` (a stale session whose first creation is refused with `unpublished_version`); `scripts/smoke-stub.sh` asserts them. Verify: `make smoke-stub` output names each fixture.
- [x] 22.2 Bump the OCU pin in `constraints.yaml` to a commit that holds the Office rows (group 21) and does not yet hold group 31, add `smoke/proxy/office.hurl` to the explicit file list `HURL_GLOBS` in `scripts/smoke-proxy.py`, and make the script log every hurl file it ran, on success as well (today it prints only on failure): owner success, anonymous 401, non-owner 404, mutation guard 403, and the unproxied control-plane routes. Verify: `make smoke-proxy` passes, its output lists `office.hurl` among the files that ran, and with the file removed from the list the output no longer names it.
- [x] 22.3 Canonical Office listing URLs: the existing producer encodes logical file paths without changing their identities or bytes. Verify conflict save-as and automatic close save-as through owning HTTP smoke, returned-URL downloads and the unchanged real workspace consumer before resuming conflict UI acceptance.

Depends on: 7, 21.
Suggested fixture level: compact - deterministic test infrastructure following an already reviewed table.
Minimal mergeable slice: 22.1 (stub fixtures) - green alone because the stub is exercised by its own smoke; 22.2 needs the pinned table of group 21.

### Office stub risk coverage

- Public API / CLI / script entry — Selected: `make smoke-stub` drives all seven routes over HTTP; wrong methods and unknown Office paths return 404.
- Config / project setup — Selected: existing `OCU_STUB_FIXTURES` selects each of the seven scenarios per chat; an unassigned chat follows the default Office round trip.
- File IO / path safety / overwrite — Not selected: no workspace disk writes or production path resolver; existing uploads remain unchanged.
- Schema / columns / units / field names — Selected: smoke asserts broker response fields, immutable version history, sequence cursors, save-as identity and outputs revision/ETag behavior.
- Auth / permissions / secrets — Selected: Office arrivals remain privately observable, public responses do not echo credential canaries, and the host permits only the exact same-origin/source/chat/generation message contract. HTTP containment is smoked; page execution is review-only here.
- Concurrency / shared state / ordering — Selected: smoke covers per-chat isolation, repeated creation joining one session, concurrent arrivals without lost transitions, and identical replay against fresh stub processes.
- Resource limits / large input / discovery — Not selected: fixed small fixtures, no new quotas or production discovery behavior.
- Legacy compatibility / examples — Selected: existing smoke cases stay intact; files/browser/terminal/standalone preview bodies and policies remain unchanged. No OCU pin, proxy, browser harness or production caller change.
- Error handling / rollback / partial outputs — Selected: unsupported creation creates no session; stale creation refuses once without losing unpublished versions; orphaned recreation gets a new id; conflict resolution preserves the original on save-as and changes it only on explicit overwrite.
- Release / packaging / dependency compatibility — Not selected: no dependency, image or release changes.
- Documentation / migration notes — Selected: this fixture records harness guarantees and the explicit JavaScript evidence limit; `make doc-gate` and `make decisions-verify` cover documentation hygiene.

Smoke inputs and outcomes are the `ocu-stub` scenarios: publish advances the published cursor and file revision; persist adds only an unpublished autosave; close then restore appends history without altering older entries; both conflict resolutions are distinct; unsupported, orphaned, save-as, unpublished and stale cases each print their scenario name only after their assertions pass. Preserve a failing Office HTTP assertion against the pre-change stub before implementing. Retain sanitized red/green logs; do not mark page protocol execution or real-editor acceptance as passed.

`make smoke-stub` also requests `GET /preview/{chat}?embed=office` and asserts that the returned stub-owned page contains the visible modification control and references no origin other than its public origin. This HTTP/body check is executable evidence; it does not claim the page's JavaScript message protocol was executed.

### Office listing URL compatibility risk coverage

- Public API / schema / path representation — Selected: complete canonical URL for deduplicated names, unchanged logical path/file_id and prefix; no consumer normalization or validator change.
- State / compatibility — Selected: both save-as producers; conflict preserves original bytes/metadata/revision, automatic close preserves old-path absence and saved_as identity; all seven scenarios and non-Office smoke remain.
- Errors / response conservation — Selected: retained real invalid_response failure; original malformed URL is rejected by the unchanged consumer, corrected URL downloads the described bytes.
- Resource / discovery / documentation — Selected: existing smoke process ownership and browser harness; no new permanent harness or scenario/discovery changes; owning stub decision documents the URL contract.
- Auth / production filesystem / configuration / release / dependencies — Not selected: unchanged. Real gateway proof retains owner authentication; no production broker or unrelated upload repair.

Required evidence for 22.3: new owning smoke assertion RED before source, `make smoke-stub` GREEN covering both saves and exact returned-resource bytes, scoped lint/anti-drift and doc/decision/strict checks. Disposable browser execution of the actual workspace client accepts both real gateway listings and retrieves their resources; the harness still runs its unchanged required suite. Resume task26.1 only after this isolated prerequisite passes review/CI and merges.

### Office gateway smoke risk coverage

- Public API / CLI / script entry — Selected: `make smoke-proxy` judges all seven owner 2xx rows, unlisted methods/shapes and both control-plane 404s through real nginx.
- Config / project setup — Selected: exact pushed OCU SHA `a53731df95a3b92acb2dcb5980f969b4f8b4ee52`; 27-row table, no upload reads, no second-listener inputs; fixture mapping selects a conflict chat before starting the stub.
- File IO / path safety / overwrite — Selected: existing private staging, report redaction and owned-process/file cleanup remain intact; a listed missing Hurl file fails, never silently skips.
- Schema / columns / units / field names — Selected: owner replies retain stub status/body; captured IDs address the proper file/session and all path segments are encoded once. Private observations prove stripped paths, owner identity, chat and credential on each arrival.
- Auth / permissions / secrets — Selected: for every row anonymous401 and non-owner404; for each POST null-origin403 and missing-header403. Compare private observation count around each individual denial, including control-plane/unlisted paths; existing credential-containment scans cover Office replies.
- Concurrency / shared state / ordering — Selected: run requests serially with a fresh observation boundary so successes cannot mask denials. Resolve follows a publishing save and observed conflict; restore follows observed closed state and uses a version number from history. Track file/session identities through resolution.
- Resource limits / large input / discovery — Not selected: fixed finite matrix, no new input-size or discovery policy.
- Legacy compatibility / examples — Selected: retain all five existing Hurl files, upload chain, mutation and file-isolation assertions. Read-only callsite/diff audit preserves the `Smoke` constructor/state, `pin`, `verify_checkout`, `render`, `start_owned` signature/PID ownership, `cleanup_procs`, `PINNED_FILES`, `require_tools`, and `BrowserHarness` overrides of `run`, `provision`, `cleanup_data`, `assert_sentinel`; lifecycle cleanup remains polymorphic. Record this audit separately from gateway runtime evidence; no browser-subclass execution or new second-listener parameters are claimed.
- Error handling / rollback / partial outputs — Selected: stale20-row table must fail naming an Office row, never skip; both success/failure output name every Hurl file actually invoked, and cleanup executes on failures.
- Release / packaging / dependency compatibility — Selected: CI consumes the same public pinned OCU commit; no dependency install, workflow edit, image build or second-listener rollout.
- Documentation / migration notes — Selected: fixture and existing paired-smoke decision record explain Office denial evidence and pin boundary; strict OpenSpec, doc and decision gates pass.

Required evidence: `make smoke-proxy` exit0 names `office.hurl` and every retained file; each owner route has one correctly attributed upstream arrival, every denial has none. In disposable source/checkouts, removing Office from the explicit list removes its name from execution output, leaving a listed file missing fails, and using the pre-Office table fails with the rejected Office row named. Preserve each command and exit; do not wire intentional-negative runs into the normal target or change the fixture to accept a stale pin.

## 23. [webui] Feature flag, client and store (spec: ocu-office-workspace-ui)

- [x] 23.1 `ENABLE_OCU_OFFICE_EDIT` (default false) parsed strictly — a value that is neither true nor false fails startup — exposed as `enable_ocu_office_edit` in the config features object beside `enable_ocu_workspace`, and set in the harness environment. Verify: a backend test asserts the feature value for both settings and the startup failure; `make smoke` passes.
- [x] 23.2 `src/lib/apis/ocu/office.ts` (session status, versions, restore, resolve, with the mutation header and the existing error mapping) and a chat-keyed Office store module. Verify: Vitest covers request shape, error mapping, generation handling and that no state crosses chats.

Depends on: none beyond group 8.
Suggested fixture level: expanded - a config surface in the upstream spine (`main.py`) and a new client on guarded routes.
Minimal mergeable slice: 23.1 (the flag) - green alone because nothing reads it yet; 23.2 adds modules without callers.

### Office feature-flag risk coverage

- Public API / CLI / script entry — Selected: real authenticated `/api/config` reports the boolean; anonymous response omits the key. `main.py` changes only one features entry.
- Config / project setup — Selected: fresh-process `true`, `TRUE`, mixed-case false, `false` and unset yield their corresponding booleans. `maybe`, empty and padded values reject startup naming `ENABLE_OCU_OFFICE_EDIT`; no trimming or truthiness coercion.
- File IO / path safety / overwrite — Not selected: no new application storage or file behavior; test data stays under the existing harness boundary.
- Schema / columns / units / field names — Selected: exact `features.enable_ocu_office_edit` boolean beside workspace; other config keys unchanged.
- Auth / permissions / secrets — Selected: authenticated-only exposure, no credential values in errors; existing owner/shared/admin and anonymous workspace tests stay unchanged.
- Concurrency / shared state / ordering — Selected: process-isolated environment cases after harness setup and before app import; no module reload or cached-flag patch substitutes for parser proof.
- Resource limits / large input / discovery — Not selected: one bounded configuration value, no resource-policy change.
- Legacy compatibility / examples — Selected: lenient workspace parser unchanged; Office value is independent of workspace enablement and adds no routes or requests.
- Error handling / rollback / partial outputs — Selected: invalid Office value prevents startup even with workspace disabled; false rolls discovery off without deleting state.
- Release / packaging / dependency compatibility — Not selected: no dependencies, images or deploy variables provisioned.
- Documentation / migration notes — Selected: update the existing Office plan's flag contract and record the one-line spine reference; strict OpenSpec, doc and decision gates.

Required evidence: semantic red from missing Office config key or invalid input being accepted, then owning router/auth pytest modules, `make lint-scoped`, router/harness coverage and `make smoke`. Start/restart the harness with its explicit true value, probe authenticated config true and anonymous omission; do not claim generic smoke itself asserts the new key. Retain fresh command exits and remove only owned runtime resources.

### Office client and store risk coverage

- API / schema — Selected: Vitest asserts all four encoded gateway paths, methods, JSON bodies and response fields; no create/save/close API.
- Auth / permissions — Selected: same-origin credentials, no bearer token, mutation header on both POSTs. Gateway authorization itself is unchanged and covered by the existing gateway smoke.
- Concurrency / ordering — Selected: current generation applies; retired and absent generations do not; each operation preserves the other chat, including a late A result after B becomes current.
- Compatibility — Selected: reuse the existing error class without modifying workspace exports, state or consumers; no `artifactContents` dependency.
- Errors / partial outputs — Selected: transport → status 0/request_failed; every HTTP failure rejects with its status and unchanged string reason, including 404 unknown_file and an unrecognized broker reason; missing/unreadable reason → request_failed; invalid success JSON → actual status/invalid_response.
- Documentation — Selected: record exported client/store names in the existing Office plan; strict OpenSpec, doc and decision gates.
- Config, file IO, resource limits and packaging — Not selected: no flag, filesystem, quota, dependency, deployment or build change.

Required evidence: write paired behavior tests before modules; retain red output, then scoped Vitest and per-file coverage for both new modules (at least 80%). Run `make lint-scoped`, `make typecheck`, frontend tests and anti-drift; a clean exact-head CI run supplies full frontend/coverage proof if local discovery hits the separately tracked user-owned `.run` copies. Never delete or modify those copies, relax discovery or hide failures. A disposable loopback HTTP smoke invokes the actual client and applies results to two chat entries, observing request/refusal semantics and late-result isolation; no browser/editor acceptance is claimed. Remove only the smoke's owned resources.

## 24. [webui] Edit entry and editor frame (spec: ocu-office-workspace-ui)

- [x] 24.1 `WorkspaceArtifact`: the 编辑 action on DOCX / XLSX / PPTX entries behind the flag, never launching a stopped sandbox, and a third iframe class with code-fixed `sandbox` and `allow` values (the B1 items "iframe sandbox and permission lists"), created once per edit action, with validation of child messages by source, origin, schema, chat, file and generation and a ready deadline that retires the frame and offers a retry; logic in a new module. Verify: Vitest covers flag off (no action, no request), no launch request when the workspace is stopped, frame creation, a publish-driven revision change that keeps the frame, each rejected message, the deadline, and the unchanged policies of the other two frame classes.
- [x] 24.2 Wire the Office browser cases into `make verify-ui-ocu`, with the first case: add `e2e/ocu-office.e2e.ts` (open → editing) and `ocu-office` to the `testMatch` pattern of `playwright.ocu.config.ts`; add the seven Office scenario names of 22.1 to `SCENARIOS` in `scripts/verify-ui-ocu.py`, which creates one chat per scenario; and make that script list the configured tests before the run (`playwright test --list`) and exit non-zero when a required spec file — `ocu-office.e2e.ts` among the existing four — contributes no test. Verify: `make verify-ui-ocu` passes with the Plan 1 A-T01 case and the Office case named in its output, a screenshot, and zero unexpected console errors; with `ocu-office` removed from the match pattern the command exits non-zero naming the missing file (shown once in the PR).
- [x] 24.3 Status bar: state text for opening, unsaved, saving, saved, conflict, failed, expired and refused; the save button; the workspace-changed notice; strings through the existing localisation mechanism. Verify: Vitest covers each state and that "saved" appears only after a confirmed publish.
- [x] 24.4 Extend `e2e/ocu-office.e2e.ts` through the proxy and the stub: reach editing, save, see saved; a broker validation refusal preserves read-only preview and download. Verify: `make verify-ui-ocu` passes with screenshots and the cases named in its output.

Depends on: 22, 23.
Suggested fixture level: expanded - iframe sandbox policy on a Critical Path component.
Minimal mergeable slice: 24.1 together with 24.2 (edit action and frame, with its browser case and the wiring that makes the case run) - green alone because the frame works without the status bar, and AGENTS.md requires the Playwright evidence for a change to this Critical Path component; 24.3 and 24.4 follow.

### Editor entry and frame risk coverage

- Public API / schema — Selected: 24.1 tests exact ready/state key sets and field types, duplicate ready, state-before-ready, unknown state, missing/extra keys and malformed scalar/null values. A valid ready yields exactly one origin-targeted open with original file id; valid states update the existing chat-keyed store.
- Config / feature admission — Selected: absent/false Office flag or disabled workspace yields no edit action/frame/Office request, while the read-only behavior remains. Saved-chat DOCX/XLSX/PPTX admit; HTML/PDF/legacy DOC do not. No filename or display-kind inference.
- Auth / frame authority — Selected: literal B1 sandbox `allow-scripts allow-same-origin` and `allow=""` for all three types under every iframeSandbox setting. Wrong source (including sibling/generated frame), origin, URL, chat, file and generation leave state and request counts unchanged. Existing A-T01 and fixed preview/runtime policies pass.
- Concurrency / lifecycle — Selected: B-T04 asserts element identity across edited-file revision/path, unrelated listing, streaming-equivalent component updates and first session-id report. A second activation/retry gets a fresh frame and a higher chat generation. Ready deadline, late ready, duplicate ready, flag-off, different selected file id, view/chat change and unmount retire authority and clear owned work; no close request in this slice.
- Resource limits / discovery — Selected: 24.2 runs actual configured test listing and rejects a missing required spec before execution. All six specs (five existing plus Office) and all seven Office scenarios remain represented; no discovery exclusions, retries or timeout inflation.
- Compatibility — Selected: existing selected bar/download, row selectors, generated/read-only/runtime protocols, saved workspace preferences and client/store APIs stay intact. Office state is not artifactContents. Stopped edit issues zero launch requests.
- Errors / partial outputs — Selected: malformed child state is rejected atomically, fresh activation clears predecessor display state, missing ready produces visible retry and retirement, missing harness spec/scenario cannot become a green run.
- Documentation — Selected: record the module seam and measured code policies in the owning decision/Office plan; strict OpenSpec, doc and decision gates. Per-issue completion changes only 24.1/24.2; the shared change stays open.
- File IO / path safety and release / packaging — Not selected: no production filesystem, broker, dependency, image or deployment change; canonical URL/identity validation remains with existing APIs.

Required evidence: meaningful mounted/module RED before implementation, then the full selected protocol/identity matrix and at least 80% per-file coverage for the new module; existing WorkspaceArtifact and Office client/store tests, scoped lint/typecheck/anti-drift and `make verify-ui`. The Office browser case observes actual parent-accepted editing state and a proxied session creation, captures a screenshot and retains zero unexpected console/page errors. Run the actual harness once with Office removed from matching: nonzero, missing filename and no pass line; restore it and prove green. Also exercise removed Office scenarios: nonzero for missing chat. Use disposable or restored negative-control inputs, never permanent weakening. Parent owns final acceptance, fixture and checkbox updates; clean exact-head CI supplies full frontend/coverage if known local user-owned copies interfere.

### Office status and save-control risk coverage

- Message API / schema / frame authority — Selected: mounted save posts the exact four command keys and current generation to the page origin, never `*` or HTTP. Only current opened frame in editing can send; wrong URL, stale generation, retirement or a saving-state click race sends nothing. Existing incoming validation is unchanged and rejected messages leave the visible bar unchanged.
- Lifecycle / ordering — Selected: state-only saved/unsaved/saving projection, failed-editing reason precedence, second save without changes and error/conflict outcomes. Refused/closed remove the frame and restore read-only access; no close command or session-follow request. Orphaned reopen replaces the frame with higher generation/original ID, including same-ID reclassification; stale replies cannot alter it.
- Compatibility — Selected: all 24.1 admission, policy, identity, timeout/Retry and genuine revocation cases remain. Reuse the existing mounted test harness; no old test or browser selector changes. A file's refusal cannot bleed into another selected file/chat or a fresh activation.
- Errors / partial outputs — Selected: explicit unsupported_type, file_too_large, corrupt_document, unknown_file and storage_low refusal messages; safe generic fallback for other literal reasons. Editing with a reason remains save-enabled and never falsely saved. Refused/closed fallback is usable, not an empty panel; workspace notice clears when false or editor context retires.
- Documentation — Selected: owning Office plan/decision reflects the state projection and save dispatch. New strings are `$i18n.t` keys, catalogs regenerated only with npm run i18n:parse; strict OpenSpec, doc and decision gates.
- Config, production file IO/path safety, resource/discovery and release/dependencies — Not selected: feature parsing, broker storage, existing deadlines, browser harness and dependency versions are unchanged.

Required evidence for 24.3: semantic mounted RED before implementation, then all eight display states, closing, undefined initial state, editing-reason precedence for both dirty values, exact save payload, delayed saving/saved, no-change save, refusal matrix/read-only/download/no-close, expired reopen, workspace-change toggle and closed cleanup. Run new paired status-component tests plus existing component/controller/store suites and explicit per-file coverage for new production files; scoped lint/typecheck/anti-drift, format and doc/decision/strict gates. Run the unchanged `make verify-ui` for actual bar presentation and A-T01/Office first-open regressions; inspect and attach its new runtime screenshot, without changing the excluded browser spec. State plainly that browser save/refusal proof belongs to 24.4. Exact-head clean CI supplies full frontend/coverage when known user-owned local copies interfere. No fixture checkbox changes by the implementer.

### Save and refusal browser-proof risk coverage

- Public API / schema — Selected: real create/save/status responses bind chat, file, session, save_seq and last_published_seq; the private record proves a publish-intent save and no refused-session close.
- Auth / permissions — Selected: existing owner browser authentication and real proxy remain on the path; no direct stub shortcut, synthetic success body or exposed credentials. Production authorization policy is unchanged.
- Concurrency / shared state / ordering — Selected: isolate scenario chats, gate every matching status GET without an in-flight bypass, observe visible Saving with no Saved after acceptance and before confirmation, then release and observe Saved. Cleanup releases held work on assertion failure.
- Errors / compatibility — Selected: actual 415/unsupported_type gives an explicit message, no editor, usable preview and downloaded fixture bytes; preserve first-open, A-T01 and existing cases. Expected HTTP diagnostics are bounded to this response, not broadly ignored.
- Resource limits / discovery — Selected: unchanged configured full target names all three Office cases, uses existing deadlines/retries and leaves no owned process. No harness matching or scenario registration change.
- Documentation — Selected: owning plan and PR explain the status-confirmation gate, screenshots and stub-only limit; doc/decision gates and strict OpenSpec pass.
- Config / project setup, production file IO/path safety and release/dependencies — Not selected: these remain untouched; evidence files use the existing harness directory.

Required evidence for 24.4: `make verify-ui-ocu` passes all configured cases with the save round trip and unsupported refusal named, zero unexpected console/page errors and inspected screenshots. Demonstrate semantic rejection of premature Saved before released status and a refused-session close arrival using disposable test/browser fault injection, then restore and pass; no permanent fault mode or production mutation. Capture exact commands/exits and counterexamples outside the working tree. Parent independently runs the full target and accepts the evidence before marking 24.4 complete; shared Office change stays open.

## 25. [webui] Maximize and version history (spec: ocu-office-workspace-ui)

- [x] 25.1 Maximize as an in-page overlay that keeps the same editor frame. Add a maximize case to `e2e/ocu-office.e2e.ts` that takes one explicit screenshot of each layout into `.run/ui-evidence/` (the configuration captures only on failure). Verify: Vitest asserts the frame element survives maximize and restore; `make verify-ui-ocu` passes with the maximize case named in its output and both screenshots present.
- [x] 25.2 Version history: reachable from the status bar and from the file entry when no editor is open; list with source and published flag; the restore action, disabled while an editor frame is open on the document in this page and otherwise left to the broker's answer. Verify: Vitest for the list, both entry points, the restore call, the disabled state, and a `session_open` refusal shown as an error.

Depends on: 24.
Suggested fixture level: expanded - a restore request that replaces user content.
Minimal mergeable slice: 25.1 (maximize) - green alone because it only changes layout; 25.2 is an independent dialog.

### Maximize layout risk coverage

- Component API / schema — Selected: status maximize/restore actions reach the existing wrapper; all callers/tests migrate together. No Office message or HTTP schema change.
- Auth / iframe authority compatibility — Selected: same frame src/sandbox/allow and current generation survive both layout transitions; existing message rejection and A-T01 evidence remain.
- Lifecycle / shared state / ordering — Selected: node and live-document continuity, no extra open/session request, unchanged editing state and usable Save. Restore/retirement/replacement remove native top-layer and popover attribute state; later activation is visible in the sidebar.
- Layout integration / errors — Selected: native manual-popover presentation on the existing DOM wrapper; desktop and narrow geometry/hit-testing prove Navbar and separator cannot cover it. A check accepting the old separator as an alternative is invalid. Restore remains reachable; no Fullscreen call, fixed-only production fallback, orphan overlay or altered Files/Browser/Terminal presentation.
- Resource limits / discovery — Selected: same configured full browser target, one session creation for the maximize case, explicit screenshots, no reload or leaked owned resources.
- Documentation — Selected: owning Office plan/decision describes the layout owner and frame-continuity rationale; new labels use generated catalogs, no hand-written locale edits.
- Config, production file IO/path safety, release/dependencies — Not selected: no changes to these surfaces. History/restore, conflict, pre-open and close guards are explicit non-goals.

Required evidence for 25.1: meaningful mounted RED against the unchanged component before implementation, then iframe identity/no-open/no-Fullscreen, overlay Save dispatch and retirement/replacement cleanup cases plus existing component/controller/store tests with per-file coverage. Run scoped lint/typecheck/anti-drift, generated-i18n/format and doc/decision/strict gates. Run `make verify-ui` including the full unchanged `make verify-ui-ocu` discovery with the maximize case named, explicit sidebar/overlay screenshots and zero unexpected console/page errors; inspect both desktop and narrow behavior. Real-browser document continuity and one creation arrival are required, not mocked iframe evidence alone. Parent owns final acceptance and 25.1 checkbox; 25.2 and the shared change remain open.

### Version-history risk coverage

- API / schema / mutation authority — Selected: mounted tests use the delivered client and assert captured chat/file, version number, same-origin mutation header, literal sources/times/publication and no session creation.
- Overwrite / concurrency / lifecycle — Selected: local frame blocks restore; remote open_session does not. Pending restore is single-flight. Deferred responses after dismissal, identity/view/flag change are ignored; same-ID metadata leaves the read and live frame intact.
- Compatibility / layout — Selected: both entries and unchanged editor identity, status/Save/maximize and generated/read-only policies; actual history controls remain reachable inside the native top layer.
- Errors / partial output — Selected: session_open and other broker reasons preserve rows; list failure is visible; successful restore followed by failed reload is distinguished from failed mutation.
- Resource / discovery / documentation — Selected: no request before explicit history opening; one initial GET and one reload per successful mutation; existing test discovery unchanged, generated localization and owning docs.
- Config / release / dependencies / server path safety — Not selected: all unchanged; broker fence/path enforcement remains server-owned.

Required evidence for 25.2: meaningful mounted entry RED, then all six issue acceptance cases and the lifecycle/error cases above; paired history-component tests and existing Office regressions with per-file coverage. Run scoped lint/typecheck/anti-drift, generated-i18n/format, doc/decision/strict checks and unchanged `make verify-ui`. No committed browser case or stub change: retain a disposable actual-page history walk outside the repository, screenshots and diagnostics, including maximized history without editor reload. Parent independently accepts evidence before checking 25.2; later groups and the shared change stay open.

## 26. [webui] Conflict dialog and the open-time prompt (spec: ocu-office-workspace-ui)

- [x] 26.1 Conflict dialog: `save as new file` as default, `overwrite` behind a second confirmation, only `save as` when the reason is `path_missing`, and a resolve refused with `workspace_missing` closing the dialog with its message. Verify: Vitest for each branch and a browser case in `e2e/ocu-office.e2e.ts` driven by the stub's `office_conflict` scenario, named in the `make verify-ui-ocu` output.
- [x] 26.2 Before the editor frame is created: a pending close-time conflict (`open_session` in `conflict` with `editor_ended` true) is presented first; otherwise, when no session is open and the document's newest version is unpublished, offer to restore it or to start from the current file; and when the host page reports the creation refused with `unpublished_version`, retire the frame and repeat the check once. Verify: Vitest for the pending conflict, both choices, no prompt when nothing is unpublished, and the refusal leading to the prompt; browser cases driven by the stub's `office_unpublished` and `office_stale` scenarios.

Depends on: 25 (the restore call and the versions client state).
Suggested fixture level: expanded - overwrite and restore requests on user content behind confirmations.
Minimal mergeable slice: 26.1 (conflict dialog) - green alone because it reacts to a state the frame already reports; 26.2 adds the check before the frame.

### Conflict-resolution risk coverage

- API / schema / authority — Selected: current validated session, chosen save_as/overwrite and mutation header at the real client boundary; no request from dismissal, first overwrite click or declined confirmation.
- Overwrite / safety — Selected: save-as primary; explicit second confirmation; path_missing removes overwrite even during confirmation; no discard and no silent content replacement.
- Lifecycle / concurrency — Selected: captured chat/file/generation/session, duplicate suppression, stale completions after context retirement, repeated conflict after dismissal or terminal workspace_missing, and new conflict episode reopening.
- Compatibility / layout — Selected: selected-file action-bar extraction preserves behavior under unchanged size gates; same iframe/document/activation across resolve and refreshed Files, history/Save/maximize/preview policies unchanged; dialog reachable within native top layer.
- Errors / partial output — Selected: ordinary refusal leaves dialog and reason; workspace_missing closes with content-retained message and blocks further resolve; no optimistic host state or selection from HTTP success.
- Discovery / resource / documentation — Selected: permanent office_conflict case in existing Office spec and unchanged full browser discovery; exactly one resolve, actual original/new Files identities, screenshot/diagnostics, generated localization and owning docs.
- Config / release / dependencies / server fence and path safety — Not selected: unchanged; broker enforcement remains server-owned and actual DocumentServer certification remains acceptance work.

Required evidence for 26.1: mounted semantic RED before source; all eight issue criteria and the lifecycle/confirmation cases above, paired component coverage and existing Office/selected-file/history regressions. Run scoped lint/typecheck/anti-drift, generated-i18n/format, doc/decision/strict and `make verify-ui` including the named permanent conflict case. Parent accepts actual saved screenshot, message/state/listing continuity and authenticated request observations before marking 26.1. Task26.2, leave guards and shared change stay open.

### Open-time admission risk coverage

- API / schema / ordering — Selected: versions precedes frame/session creation; pending ended conflict takes precedence; restore uses the captured newest number and opens only after success; default/published/other-open-session branches need no choice.
- Authority / restore — Selected: explicit restore or start-current, no automatic restore, no history deletion; pending conflict reuses all existing safe-default/confirmation/refusal rules and uses open_session.session_id without a live generation.
- Lifecycle / concurrency — Selected: one activation token across replacement frames, one automatic unpublished_version recheck, explicit retry resets the budget, old refused snapshots cannot replay; duplicate actions and delayed responses after chat/file/view/flag/base/dismissal retirement do no work.
- Compatibility — Selected: same-ID metadata does not restart the check; captured Retry/Open again and all existing frame policies, live conflict, history and Files behavior remain. Update common test responses for the added versions call, preserving their oracles.
- Errors / partial output — Selected: failed read means error/Retry and no frame/session; refused restore keeps choices and no frame; first special refusal has no refusal banner, second has visible error/Retry; resolved pending conflict returns without an editor and a new Edit checks afresh.
- Discovery / resources / documentation — Selected: paired preflight tests, existing suite plus two named permanent office_unpublished/office_stale browser cases, real request order/history/editor state, screenshots and diagnostics; no discovery, retry, timeout or gate changes.
- Server storage / auth enforcement / configuration / deployment / dependencies — Not selected: delivered contracts unchanged; browser proof retains real owner gateway authentication, not real DocumentServer certification.

Required evidence for 26.2: one semantic mounted preflight RED before implementation; all seven issue criteria and the lifecycle cases above; affected-file coverage, existing Office and selected-file regressions; scoped lint/typecheck/anti-drift, generated-i18n/format, doc/decision/strict, and make verify-ui with the complete Office browser suite. Parent independently accepts screenshots, real versions/restore/create ordering and bounded stale-session recovery before checking 26.2. Keep 27.1/27.2 and the shared change open.

## 27. [webui] Unsaved-state guard (spec: ocu-office-workspace-ui)

- [x] 27.1 A guard module: `beforeunload` only while unpublished changes exist; chat switch and sidebar close send `close`, follow the session status after the frame is gone until a final state or the progress timeout (the B1 item "close-to-status-2 delay"), report how the close ended (saved, saved as a new file with its name, conflict at the next open, failed, unconfirmed), and never apply a late result to another chat; `ChatControls.svelte` and `Chat.svelte` gain only calls into the module. Verify: Vitest covers each trigger, each reported ending and the late-result case; the diff of the two upstream files contains no Office logic; `make verify-ui-ocu` passes.
- [x] 27.2 Extend `e2e/ocu-office.e2e.ts` with B-T12 — switch chat, close the sidebar, refresh, reopen the old chat — and with a close that ends saved as a new file (the stub's `office_save_as` scenario). Verify: `make verify-ui-ocu` passes with screenshots and the cases named in its output.

Depends on: 26 (both extend the same browser spec file and the same component).
Suggested fixture level: expanded - hooks in upstream spine components listed as Critical Paths.
Minimal mergeable slice: 27.1 (module and hooks) - green alone because it is covered by component tests and the existing browser cases; 27.2 adds the browser walk.

### Leave-guard risk coverage

- Public API / schema — Selected: unchanged close command and status/saved_as fields, literal errors, refused exception; test exact captured generation/origin and real gateway close arrival.
- Lifecycle / concurrency — Selected: five removal triggers, synchronous capture, close-before-removal delivery, one follower per session, one close per departing generation, old conflict, newer same-session generation and cross-chat late results. Held old replies cannot release or report a newer dirty attachment; repeated hooks on one attachment do not duplicate close.
- Resource bounds / errors — Selected: B1-informed 15-second progress deadline, one-second nonoverlapping status reads, hung/read-failed requests, no late resurrection, all five outcomes and released timers/subscriptions.
- Compatibility / upstream ownership — Selected: mounted controller/preflight/history/conflict and both panel layouts; imports/calls only in Chat/ChatControls, no changes to delivered Office store/client or Plan 1 modules.
- Documentation / evidence — Selected: semantic mounted RED, paired guard coverage, independent disposable browser delivery proof, unchanged complete browser regression/discovery, generated catalogs, owning decision/plan and strict validation.
- Scoped gate configuration — Selected under the user's explicit size-rule decision: exact-path Chat.svelte line ceiling only, documented motivation/exit condition and executable ceiling/sibling/lint regression tests; no global threshold or baseline change.
- Common close-request compatibility — Selected under the user's explicit scope decision: optional admission hook only, no cleanup-as-intent, hydrated open preference preserved across layout initialization, real user close waits for admission, and default callers remain synchronous.
- File IO / server authorization / deployment / dependency / runtime configuration — Not selected: unchanged broker enforcement, gateway and fixed frame policy; tests preserve their consumer contracts and do not certify real DocumentServer or LAN behavior.

Required evidence for 27.1: all eleven issue acceptance criteria and each five-trigger/five-outcome case at real mounted/module boundaries; dirty/clean/absent/refused native prompt lifetime; delayed A outcome leaves B unchanged and appears on return; duplicate and stale responses do no additional work. Test pre-existing conflict versus ended conflict and close-response delay so posting alone cannot satisfy delivery. Run affected Vitest with per-file coverage, scoped lint/typecheck/anti-drift, generated-i18n/format, doc/decision/strict, `make verify-ui` and the complete existing Office suite. Parent-owned disposable browser smoke proves actual close arrival, retained document until acceptance, removed frame afterward and owner-bound report. Permanent e2e/stub/harness files remain untouched; 27.2 remains unchecked.

### Leave-browser risk coverage

- Lifecycle / ordering — Selected: dirty close and actual chat navigation, progress before broker arrival, original frame retention, captured-session terminal reads, frame-free return until explicit Edit.
- Native browser behavior — Selected: real user activation, dirty beforeunload dismissal preserves the document, clean and absent-editor reloads produce no prompt.
- Data identity / reconciliation — Selected: original id/bytes captured before editing; recorded direct-close or persist branch determines independent expected published bytes, and fetched/listing/published-version hashes match. Automatic save-as listing id/path must equal the captured session's terminal saved_as and use a distinct id, its bytes follow the delivered transformation, and the old name is not resurrected.
- Owner isolation — Selected: B's files, selection, Office surface and dialogs remain its own. Stub synchronous-close limitation is explicit in design; task 27.1 remains the delayed-terminal-after-switch mounted proof.
- Oracle / evidence / compatibility — Selected: semantic negative qualification in a disposable browser boundary, restored GREEN, screenshots per observed step, zero unexpected diagnostics, named cases and unchanged original 31-case discovery through `make verify-ui-ocu`.
- Server auth/storage, production configuration, dependencies, deployment — Not changed: real authenticated gateway observations are consumed; no guard/component/stub/harness or scenario rewrite, no real DocumentServer claim.

Required evidence for 27.2: all seven issue criteria mapped to permanent cases; `make verify-ui-ocu` names B-T12 and B-T13 and passes with original cases intact. Parent inspects screenshots, captured session/close/status records and bytes/hash assertions, qualifies semantic negative controls outside candidate code, then runs restoration GREEN. Run changed-file formatting, scoped lint/typecheck/anti-drift and docs/decision/strict validation. Keep the shared Office change open while other task groups remain.

## 28. [deploy] Release inventory: DocumentServer role and font bundle (spec: ocu-offline-image-delivery, ocu-backup-rollback)

- [ ] 28.1 DocumentServer as a seventh, pulled role. `release.py`: the role order, the role specification with a constant default reference (the PostgreSQL pattern), the runtime image variable `DOCUMENTSERVER_IMAGE`, identity by configuration digest and archive SHA-256 verified at every start as a local image, the "six roles" messages, and `format_version` 2 for a seven-role inventory. Every inventory load — the release command line (build, import, verify), the deployment entry, and recovery when it restores or activates a retained release — requires version 2 and refuses a version-1 inventory (six roles) naming the unsupported format version; no code path accepts two formats (the recovery-set format number in `recovery.py` is a different thing and does not change). Every place that hard-codes the six image variables changes in the same cut: `deploy/recovery.py` (`IDENTITY_KEYS`), `deploy/recovery_resources.py` (`bind_selected_runtime`, `persist_selected_runtime_identity` and the image map, so that a restore writes the seventh variable back to the runtime environment), `deploy/production-like-test/scripts/bootstrap-test.sh` (the allow-list and export of release assignments only; its other outputs are group 29), `write-deployed-version.sh`, the fixtures `tests/deploy/support.py` (`ROLE_ORDER`, `FORMAT_VERSION` and `synthetic_inventory`, which becomes version 2 with seven roles for every builder that calls it) and the six-variable environments in `test_bootstrap_runtime.py`, `test_recovery.py` and `test_offline_release.py`, and the "six images" text of `deploy/BACKUP-RESTORE.md` and `NETWORK-HARDENING.md`. The service-to-image mapping is added with the compose service in group 30. Add the supersession cross-link to the decision record `ocu-offline-image-delivery`. Verify: `tests/deploy/test_offline_release.py` cases for a complete seven-role inventory, a missing or replaced DocumentServer image, a DocumentServer role recorded as built, a release with six roles rejected, a version-1 package refused by the command-line import and verify, a start through `up.sh` against a version-1 inventory refused before any service starts, and a start against a compose configuration without a DocumentServer service passing; `test_bootstrap_runtime.py` passing with the seventh assignment; `tests/deploy/test_recovery.py` cases for a restore that persists `DOCUMENTSERVER_IMAGE` and for a retained delivery with a version-1 inventory refused by restore and by activation with nothing imported; `make decisions-verify` passes.
- [ ] 28.2 The font bundle (design D19). `deploy/fonts/fonts.json` pins the upstream archives and the font files taken from them (Noto Sans CJK SC, Noto Serif CJK SC, licence file) by SHA-256; `deploy/fonts/prepare_fonts.py` fetches and verifies them and writes `fonts.tar`; `release.py`: `build_release` calls it and records the top-level field `font_bundle` (`path`, `sha256`), `INVENTORY_REQUIRED` and `validate_inventory_schema` require the field, `import_release` copies the bundle to the stage, checks its SHA-256, extracts regular files only into `fonts/` in the install root, checks each against the pin and removes the archive; a font check function verifies the `fonts` entry beside an installed inventory against the pin, and the release check that `deploy/up.sh` runs inline before any service starts calls it; in the same place `up.sh` derives `OCU_RELEASE_FONTS_DIR` as the `fonts` entry beside the inventory `OCU_RELEASE_MANIFEST` names and exports it, so the variable exists from this task on and is never a stored setting; `import_selected_release` in `recovery_resources.py`, which runs at activation, places `fonts` beside the inventory it publishes as a link to the selected root's `fonts/`, as it does for `source`. The deploy fixtures follow in `tests/deploy/support.py`, which every `up.sh` test goes through: `synthetic_inventory` gains the `font_bundle` field; `write_release_for_sha` and `prepare_up_context` create a `fonts/` directory with small fixture files beside the inventory they write; `UP_FIXTURE_PATHS` gains `deploy/fonts/fonts.json`, and `prepare_up_context` writes a synthetic pin over that copy whose names and SHA-256 values are those of the fixture files. The users of `prepare_up_context` (`test_deploy_entry.py`, `test_sandbox_egress_faults.py`, `test_sandbox_egress_guard.py`, `test_offline_release.py`, `test_bootstrap_runtime.py`, `test_recovery.py`) then pass without edits of their own, except where a test builds its install root by hand. No font file is tracked. Verify: `test_offline_release.py` cases with a small fixture archive served locally for a built bundle whose checksum is in the inventory, a pinned archive or file with a wrong SHA-256 failing the build, an import that installs exactly the pinned files, an import refused for a wrong bundle checksum, a non-regular or escaping member, a missing field and an altered file, a start through `up.sh` refused for an absent, emptied or altered `fonts/` directory, a restore into a new deployment root followed by activation, after which the `fonts` link resolves to the selected root and passes the check, a link pointing elsewhere refused, and every existing `up.sh` case passing with the extended fixtures; a test asserts that no font file is tracked.

Depends on: 3 (`tests/deploy/test_recovery.py` and `recovery_resources.py` are edited by the cut-over).
Suggested fixture level: expanded - release integrity checks that gate every deployment start, rollback compatibility.
Minimal mergeable slice: 28.1 (the role, in every file that lists the six) - green alone because the role list, the identity check, the version record, the bootstrap allow-list and recovery read one inventory format and change together; 28.2 then adds a required field to version 2, so an inventory built between the two merges is rejected and must be rebuilt, which affects development builds only: no release is deployed before group 35.

## 29. [deploy] Bootstrap provisions DocumentServer settings (spec: ocu-retention-env, ocu-documentserver-service)

- [ ] 29.1 `bootstrap-test.sh`: generate the JWT secret and emit, under the names of design D17's table, `OCU_OFFICE_JWT_SECRET`, `OCU_OFFICE_PROXY_PORT`, `OCU_OFFICE_DOCSERVER_URL`, `OCU_OFFICE_DOCSERVER_ORIGIN`, `OCU_OFFICE_SELF_URL`, `OCU_OFFICE_FONTS_DIR` (created empty when absent, never written to) and `ENABLE_OCU_OFFICE_EDIT` from one operator input — not `OCU_RELEASE_FONTS_DIR`, which the deployment entry derives at every start — with every setting emitted whether the flag is on or off; reject a missing image reference, a failed secret generation, a flag value that is neither true nor false, and a DocumentServer origin equal to the WebUI origin. Verify: `tests/deploy/test_bootstrap_runtime.py` cases for the generated outputs under exactly those names (mode 0600, no secret in logs or the version report), each rejection, an operator font directory with content left untouched, and the existing no-overwrite contract.

Depends on: 28 (the image reference comes from the inventory; both groups edit `bootstrap-test.sh` and `test_bootstrap_runtime.py`).
Suggested fixture level: expanded - production configuration and secret generation.
Minimal mergeable slice: atomic - bootstrap writes its outputs once under a no-overwrite contract, so the secret, the addresses and the flag must be in the same output; a later addition could not be applied to an existing installation.

## 30. [deploy] DocumentServer service, guard membership and preflight (spec: ocu-documentserver-service, ocu-compose-port-matrix, ocu-offline-image-delivery)

- [ ] 30.1 Compose: the DocumentServer service in the existing core stack (`deploy/production-like-test/compose.core.override.yml`; no fourth stack, so the three-stack lists in `up.sh` and `smoke_deployment.py` are unchanged), on the control-plane network only, without host publication or Docker socket, with its data volume, always present; the OCU service receives the four settings it reads under their fixed names and the WebUI service receives `ENABLE_OCU_OFFICE_EDIT` (`compose.webui.override.yml`); the service-to-image mapping in `release.py`; `check-ports.sh` requires the service exactly once, with no publication, on the control-plane bridge and never on the sandbox bridge. The deploy fixtures follow in the same cut: the intended resolved documents in `tests/deploy/support.py` and the service tables of `tests/deploy/fakebin/docker`. The proxy still publishes one port in this group. Verify: `tests/deploy/test_overlay_structure.py` and `tests/deploy/test_check_ports.py` assert the resolved configuration and reject a missing or duplicated service, a DocumentServer publication including loopback, and a sandbox-bridge membership; `test_overlay_structure.py` compares the OCU service's environment with the name constants of the OCU configuration module (group 11) and asserts the flag on the WebUI service; a `test_offline_release.py` case rejects a DocumentServer service image that differs from the inventory.
- [ ] 30.2 DocumentServer's own JWT settings (browser, inbox, outbox) from the bootstrap secret, and the deployment entry's preflight in `deploy/up.sh` for every stored DocumentServer setting of design D17's table (the ones bootstrap and the release assignments set; `OCU_RELEASE_FONTS_DIR` is derived and its directory checked by 28.2, and the renderer's two listener inputs arrive with group 31). The environments that the existing `up.sh` tests build (`fake_env` in `tests/deploy/support.py`, and the ones in `test_offline_release.py` and `test_recovery.py`) gain the settings. Verify: the resolved configuration asserts the JWT settings; `tests/deploy/test_deploy_entry.py` cases fail the start for each missing or empty setting and for JWT disabled, before any service starts and without printing a credential; the existing `up.sh` cases pass with the extended environments.
- [ ] 30.3 Font mounts: the DocumentServer service mounts the release font directory (`OCU_RELEASE_FONTS_DIR`, derived, installed and checked by 28.2) and the operator-owned directory (`OCU_OFFICE_FONTS_DIR`), both read-only, at two font paths inside the container; the preflight of 30.2 requires the operator-owned directory to exist. `prepare_up_context` in `tests/deploy/support.py` creates the operator-owned directory and `fake_env` names it, so the existing `up.sh` tests keep passing. Verify: the two mounts and no other host path are asserted in the resolved configuration; a start with the operator-owned directory missing fails naming it; a start after a restore mounts the selected release's fonts without a stored `OCU_RELEASE_FONTS_DIR`; the existing `up.sh` cases pass.

Depends on: 11 (the name constants), 28, 29.
Suggested fixture level: expanded - production topology, a reviewed port guard, authentication settings of a new service.
Minimal mergeable slice: 30.1 (service, mapping, guard membership and their fixtures) - green alone because the compose file, the mapping, the guard and the fixtures that describe the resolved configuration change together and the deploy suite passes; 30.2 and 30.3 add settings and mounts to the existing service.

## 31. [deploy] Second proxy listener and port (spec: ocu-reverse-proxy, ocu-compose-port-matrix, ocu-overlay-smoke)

- [ ] 31.1 A second listener that forwards to DocumentServer with session-only authentication, WebSocket upgrade and idle timeouts above 60 seconds, the forwarding headers DocumentServer needs, and no internal credential, chat identity or WebUI session cookie sent upstream (the B1 item "editor works without the WebUI cookie"); the two listeners never forward to each other's upstream. The proxy's compose service publishes the second port (`OCU_OFFICE_PROXY_PORT`), `check-ports.sh` requires exactly two proxy publications, and `judge_publications` in `deploy/smoke_deployment.py` accepts exactly two published proxy ports, counted as ports and not as per-address-family publisher entries. Every place that hard-codes the single port changes in the same cut: `deploy/production-like-test/compose.proxy.yml`, `deploy/proxy/Dockerfile` (`EXPOSE`), `deploy/proxy/render.py` (the second listener's two inputs, `OCU_OFFICE_PROXY_LISTEN` and `OCU_OFFICE_PROXY_UPSTREAM`, which have no default: a missing or invalid one fails the render), the proxy's own tests and fixtures that render with one listener today (`deploy/proxy/tests/test_render.py`, `deploy/proxy/tests/fixture.py`, `deploy/proxy/tests/run-entrypoint-smoke.sh`), `deploy/proxy/README.md`, `write-deployed-version.sh`, `NETWORK-HARDENING.md`, and the fixtures `tests/deploy/support.py` (`intended_proxy`, `proxy_mapping`), `test_check_ports.py` and `test_overlay_structure.py`. Verify: renderer and native proxy tests for an authenticated request, an anonymous 401, a WebSocket handshake, an unexpected auth response failing closed, header contents received by a recording upstream, and a missing listener input failing the render; guard tests reject one and three proxy publications and a listener not wired to DocumentServer; `tests/deploy/test_deployment_smoke.py` cases for two ports including dual-stack publishers, and for one and three ports rejected.
- [ ] 31.2 Decision record `ocu-documentserver-origin` (design D17: own origin through a second proxy port, one deployment shape) with the supersession cross-link to `ocu-proxy-only-compose-topology`. Verify: `make decisions-verify` passes.

Depends on: 21 (both edit the proxy renderer), 30.
Suggested fixture level: expanded - a new authenticated listener in the gateway and a changed port guard.
Minimal mergeable slice: atomic - the listener, its authentication, the published port, the guard's count, the smoke's count and the fixtures that describe them are one cut: a listener without authentication is an open path to DocumentServer, a published port without a listener or a listener without its port fails the guard, and neither the guard nor the smoke can accept both one and two publications. 31.2 is documentation in the same PR.

## 32. [deploy] Overlay smoke with DocumentServer (spec: ocu-overlay-smoke)

- [ ] 32.1 `smoke_deployment.py`: DocumentServer among the required running services, and a refused connection on a direct DocumentServer address. Verify: `tests/deploy/test_deployment_smoke.py` cases with the fake engine for each assertion, including a stopped DocumentServer failing the smoke and a timeout that is not accepted as a refusal.

Depends on: 31.
Suggested fixture level: expanded - deployment acceptance checks.
Minimal mergeable slice: atomic - two assertions of one checker about the service that group 30 added; the port count it also judges already moved with the port in group 31.

## 33. [deploy] Backup and restore with DocumentServer (spec: ocu-backup-rollback)

- [ ] 33.1 The quiesce sequence in `deploy/recovery_resources.py` (`establish_quiescence`, where the writers are stopped today): stop the proxy, run the shutdown-preparation command in the DocumentServer container (the B1 item of that name), wait up to the configured timeout until no chat's Office state holds an open session or a journal entry, then stop the writers with DocumentServer among them — its container identity, image and service mapping and collision list in the same file; on a failed command or a timeout name the open sessions, stop the writers and publish no set. No step clears the shutdown mode: the B1 item "a restart clears the shutdown-preparation mode" is what lets the next start accept sessions. The DocumentServer data volume is excluded and per-chat membership has no uploads tree. The fake engine's `docker exec` rules (`tests/deploy/fakebin/docker`) gain the command. Verify: `tests/deploy/test_recovery.py` cases for the order of the steps, a session still `saving` at the timeout, a remaining journal entry, a failed command, a running DocumentServer blocking capture, the set's membership and the excluded volume.
- [ ] 33.2 Restore writes a fresh token to `{BASE_DATA_DIR}/.office-restore-epoch` after the chat-data tree is in place; `BACKUP-RESTORE.md` describes the quiesce sequence, the invalidated sessions after restore, and that a retained release with a version-1 inventory cannot be restored or activated. Verify: recovery tests assert the file and a changed token, and that Office state and version blobs restore byte-identical; a test reads the written marker with the broker's reader from group 10; the documented commands match the CLI.
- [ ] 33.3 Decision record `ocu-office-backup-restore` (design D18: quiesce before capture, DocumentServer volume excluded, restore epoch) with the supersession cross-link to `ocu-cold-backup-recovery`. Verify: `make decisions-verify` passes.

Depends on: 3 (single-directory layout), 10 (state file and epoch reader), 16 (the final callbacks the wait relies on are persisted and published by groups 12–16), 30.
Suggested fixture level: expanded - backup and restore of user data, rollback behaviour.
Minimal mergeable slice: 33.1 (quiesce, writers and membership) - green alone because it only tightens capture; 33.2 adds the epoch that the broker of group 10 already reads; 33.3 is documentation.

## 34. [webui] Real-editor verification target (spec: ocu-office-verification, ocu-proxy-smoke)

- [ ] 34.1 `scripts/verify-office.sh` and `make verify-office`: bump the OCU pin in `constraints.yaml` to a commit holding groups 9–20 and 31, and pass the second listener's two inputs, `OCU_OFFICE_PROXY_LISTEN` and `OCU_OFFICE_PROXY_UPSTREAM` (pointed at the stub), in the proxy render of `scripts/smoke-proxy.py`, which `make verify-ui-ocu` shares and which the pinned renderer then requires; start a real DocumentServer and the broker locally, run open → edit → save → reopen for the DOCX, XLSX and PPTX samples of design D21, reopen each saved file with LibreOffice headless, check formulas, recalculated values, tables, images, sheets and slide order, write the fidelity record, stop what was started, and exit non-zero when Docker, the image or LibreOffice is missing; add the Verification Matrix row and state that the target is not part of PR CI. Verify: the target passes locally with its output attached to the PR, fails loudly with the image or LibreOffice absent and with a flattened-formula fixture; `make smoke-proxy` and `make verify-ui-ocu` pass against the new pin; `make doc-gate` passes.

Depends on: 14, 17, 18, 20, 22, 31.
Suggested fixture level: expanded - a new script entrypoint that starts services and judges saved files.
Minimal mergeable slice: atomic - AGENTS.md forbids a Verification Matrix row whose command does not exist and `make doc-gate` checks the pair, so the script, the target and the row land together; the pin they run against moves in the same change, and the smoke must render that pin's proxy.

## 35. [webui] Acceptance run, user notes and final documentation (spec: ocu-office-verification)

- [ ] 35.1 Prepare the acceptance machine (wiped chat data, font mount, Office flag on; at most one sandbox running during the run, as an operating constraint), run B-T01–B-T16, and retain evidence per row with untested rows stated as untested. Verify: the result table and evidence locations are posted on the epic.
- [ ] 35.2 User notes `docs/office-editing.md`: only the status bar button saves and the editor's own save shortcut does not publish (the B1 item "the editor's own save command produces no callback"); up to 5 minutes of input can be lost when the editor service restarts, and how the restore prompt brings auto-saved content back; an edit is not written back to the attachment WebUI stored or to content already given to the model; what the conflict choices do. Verify: `make doc-gate` passes and the notes are linked from `AGENTS.md`.
- [ ] 35.3 Synchronise `AGENTS.md` (Critical Paths, Verification Matrix), `CONTEXT.md`, the decision records' zones and the plan's status with what was delivered. Verify: `make doc-gate` and `make decisions-verify` pass.

Depends on: every other group.
Suggested fixture level: none - evidence and documentation; no runtime behaviour.
Minimal mergeable slice: 35.2 (the user notes) - documentation that is true as soon as groups 20 and 26 exist and independent of the run; 35.1 is the run and its record; 35.3 follows the recorded results.
