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

- [ ] 8.1 Run the pinned DocumentServer image in isolation and write the dated verification record under `docs/` with every item of design D4. The nine items later groups consume must be concrete values: the iframe sandbox and permission lists; how the connection cap is detected (a usage query or its absence, and the editor event); the close-to-status-2 delay; the shutdown-preparation command (its name and whether it saves and closes every open document); whether a restart clears the shutdown-preparation mode; whether `forcesave` echoes `userdata`; whether the editor's own save command produces a callback with user-initiated force save off; the origin of the download address in status-2 and status-6 callbacks; whether the editor works when the proxy withholds the WebUI cookie. For the five that are design assumptions the record states whether the observation matches. Other items are filled or explicitly marked not measured with the reason. Verify: the record lists each item, the nine consumed ones hold values, and `make doc-gate` passes.
- [ ] 8.2 Decision record `ocu-office-editor-selection` stating go or no-go, linking the record by relative path. It cannot be a go when a consumed item is not measured or when a design assumption does not hold: `forcesave` does not echo `userdata`, no shutdown-preparation command saves and closes open documents, a restart does not clear that mode, the editor's own save produces a callback, or the editor fails without the WebUI cookie. In each of these cases the change returns to design. Verify: `make decisions-verify` and `make doc-gate` pass; on no-go the epic is updated and no group 9–35 issue starts.

Depends on: none.
Suggested fixture level: none - measurement and documentation; no runtime behaviour in either repository.
Minimal mergeable slice: atomic - the go/no-go decision is the gate and is only meaningful with the record it cites; both are documentation in one PR.

## 9. [ocu] Outputs broker: resolve and register (spec: ocu-outputs-broker)

- [x] 9.1 Resolve a `file_id` to its current relative path from persisted state, failing explicitly for unknown and tombstoned ids, without scanning, hashing or starting a sandbox. Verify: broker tests for an active id, a renamed file recorded by a reconcile, a tombstone, an unknown id and a corrupt index.
- [ ] 9.2 Register a host-side write for a path inside the caller's locked transaction: refresh the hash from content, increment the counter once, stamp the entry, also when the size is unchanged; create an entry with a new `file_id` for an unindexed path; reject paths outside the root, symlinks and hidden names. Verify: broker tests for a same-size write, a size change, an unindexed path, and each rejection; a concurrent reconcile does not lose the revision.

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

## 10. [ocu] Office broker store (spec: ocu-office-store)

- [ ] 10.1 `office/` package with the per-chat state file: schema version, locked read-modify-write through the shared per-chat lock, atomic durable replace, explicit failure on corruption that preserves the prior state. The server image's `computer-use-server/Dockerfile` copies the new package (it copies modules one by one). Verify: tests cover two processes updating one chat without loss in either order, a corrupt file, a failure before replace, and restart persistence; a test asserts that every top-level `.py` module of `computer-use-server/` and every directory there that holds an `__init__.py` is named by a `COPY` line of that Dockerfile (directories without Python packages, such as `bin/` and `cli-defaults/`, are outside the check).
- [ ] 10.2 Versions and receipts: content-addressed immutable blobs, per-document numbering, sources and the published flag, no new record when content equals the latest version, the free-space floor, receipts for every processed callback, and the safe read of a workspace file (no-follow, regular file, inside the chat's directory, no symlinked parent). Verify: tests cover identical content stored once, numbering, refusal below the floor without partial blobs, receipt lookup by sequence and hash, and a symlinked file and a symlinked parent directory each refused without being read.
- [ ] 10.3 The restore-epoch marker: read `{BASE_DATA_DIR}/.office-restore-epoch`, an absent file being the initial epoch, and compare for equality. Verify: tests for an absent file, a token, and a changed token.
- [ ] 10.4 Decision record `ocu-office-file-store` (design D5: per-chat files instead of a database). Verify: `make decisions-verify` passes.

Depends on: none beyond group 8.
Suggested fixture level: expanded - persisted shared state, file format, concurrency across worker processes.
Minimal mergeable slice: 10.1 (state file and locking) - green alone because nothing reads it yet; 10.2 and 10.3 build on its API; 10.4 is documentation.

## 11. [ocu] DocumentServer configuration and client (spec: ocu-office-sessions, ocu-office-callback, ocu-auth-guard, ocu-documentserver-service)

- [ ] 11.1 Office configuration module in the `office/` package: the four setting names of design D17 that OCU reads (`OCU_OFFICE_DOCSERVER_URL`, `OCU_OFFICE_DOCSERVER_ORIGIN`, `OCU_OFFICE_SELF_URL`, `OCU_OFFICE_JWT_SECRET`) defined as constants, plus the tuning values with defaults (free-space floor, ticket lifetime, liveness interval, save timeout), validated in `auth_guard.startup_preflight`, the function the packaged multi-worker entrypoint already calls — Office editing is enabled when the address is configured, there is no separate switch; an address with a missing or blank secret, origin or self address exits non-zero, and no address needs none of the others. Verify: startup tests for each combination through `startup_preflight`, including the packaged multi-worker entrypoint.
- [ ] 11.2 JWT signing and verification, source-ticket signing and verification with expiry and binding, and a command-service client (`forcesave` with `userdata`, key lookup). Uses the B1 item "`forcesave` echoes `userdata`". Verify: tests against a fake DocumentServer HTTP endpoint cover a valid round trip, a tampered token, an expired ticket, a ticket for another document, an unknown key, and command error codes.

Depends on: 3 (`auth_guard.py` and its test matrix are edited by groups 1 and 4, and every Office group that follows works on the single shared directory), 10 (the package).
Suggested fixture level: expanded - secrets, authentication tokens and production configuration.
Minimal mergeable slice: 11.1 (configuration and fail-loud validation) - green alone because no route uses it yet; 11.2 adds the token and client helpers.

## 12. [ocu] Office routes guard and session creation (spec: ocu-office-sessions, ocu-auth-guard, ocu-office-store)

- [ ] 12.1 `auth_guard` coverage of `/api/office/` (internal token, canonical chat id, sandbox peers refused), an Office router module included by one line in `app.py`, 404 for every Office route when Office editing is not enabled, and no chat directory created by a request for an unknown chat. The module reload lists of the app tests (`_APP_MODULES` in `tests/orchestrator/test_outputs_endpoint.py` and `test_preview_prefix.py`) gain the new modules. Verify: `tests/test_auth_guard.py` gains the Office rows of the matrix; tests for the not-enabled case and the unknown chat.
- [ ] 12.2 `POST /api/office/{chat}/documents/{file}/sessions`, creation: resolve the file, validate type, size and container through the safe read, capture the workspace content as a version when it is not one, record the restore epoch, return the signed editor configuration with server-to-server addresses and no secret. Verify: `TestClient` tests for each refusal (B-T13), a symlinked file refused with `unsafe_path`, the stored `workspace` version, and the configuration's contents.
- [ ] 12.3 Join, the reopen check and status: one open session per document with a stable key, a join returning a freshly signed configuration with a new ticket; on reopening a session whose editor is still expected (`editing`, `saving`, `closing`, or `conflict` without the receipt of a final callback) the DocumentServer key check, which makes a forgotten session `orphaned` and then creates a new session, or refuses with 409 `unpublished_version` and creates nothing when the document's newest version is unpublished, and answers 502 when DocumentServer cannot be reached; `GET /api/office/{chat}/sessions/{session}` returning the persisted state from any worker with the epoch check. Verify: tests for a join from a second request and from a second worker (B-T05), a join of an `opening` session getting a usable ticket, the status fields, a session orphaned by a changed epoch, a forgotten session replaced when everything is published, the `unpublished_version` refusal followed by a successful second create, a `conflict` session without a final receipt orphaned the same way while one with a final receipt is returned without contacting DocumentServer, and the unreachable case.

Depends on: 9 (9.1 resolves the file), 11.
Suggested fixture level: expanded - new public API on a guarded shared entrypoint, persisted session state, auth.
Minimal mergeable slice: 12.1 (guard coverage and the not-enabled answer) - green alone because it adds no session behaviour; 12.2 and 12.3 add the routes behind it.

## 13. [ocu] Save, close, change notice and the session sweep (spec: ocu-office-sessions)

- [ ] 13.1 `POST .../save` and `POST .../close`: `save_seq` allocation, intent `publish` for a user save and `persist` for auto-save, the forcesave command with user-initiated force save left off in the editor configuration (the B1 item "the editor's own save command produces no callback" is what makes the status bar button the only save), close as recorded intent, a close of a never-opened session ending it at once, `orphaned` when DocumentServer no longer knows the key, and the connection-cap check before creation and before a join when the B1 item "connection cap detection" provides a usage query. Verify: tests with the fake DocumentServer cover each path (B-T15 refusal at creation and at a join, B-T10 denied new operation), a save refused outside `editing`, a repeated close, and the editor configuration carrying user-initiated force save off.
- [ ] 13.2 Status change notice: the status response checks only the edited file through the safe read — `stat`, hash on change — and reports `workspace_changed` against the session baseline. Verify: tests for unchanged, size-changing, same-size with changed mtime, deleted and symlinked file; no other file is read.
- [ ] 13.3 Session sweep in the existing idle-reclamation poll (`app.py` `_idle_reaper`): a session without activity for the liveness interval whose key DocumentServer no longer knows becomes `orphaned`; a `saving` session past the save timeout returns to `editing` with `save_timeout`; an unreachable DocumentServer changes nothing. Verify: tests with the fake DocumentServer for each rule and for two workers sweeping the same chat.

Depends on: 12.
Suggested fixture level: expanded - persisted session state machine on public routes, a periodic job that changes state.
Minimal mergeable slice: 13.1 (save and close) - green alone because the routes only record intent and call the command client; 13.2 and 13.3 are independent additions.

## 14. [ocu] DocumentServer callback and persist (spec: ocu-office-callback, ocu-auth-guard)

- [ ] 14.1 `GET /office/source/{ticket}` and `POST /office/callback/{chat}/{session}` with ticket and DocumentServer-JWT authentication, exemption from the internal-token carrier, sandbox-subnet rejection, no proxy exposure, and the check that the chat's data directory exists before the per-chat lock is taken. Verify: tests for a valid ticket, expired and foreign tickets, a bad signature, a sandbox-subnet peer, an internal token offered instead of the proper credential (B-T09), and a callback for a removed chat directory that creates nothing.
- [ ] 14.2 Status handling 1 / 2 / 3 / 4 / 6 / 7 and unknown with the handling order of design D9: receipts for every processed callback, the final callback's `save_seq` and its void close allocation, the stale rule, status 6 / 7 leaving `closing` and `conflict` untouched, an error answer returning a `saving` session to `editing`, callbacks for unknown, ended or orphaned sessions, and the epoch check. Verify: recorded callback fixtures drive tests for each status, out-of-order and duplicate delivery including a retried final callback without a close request, the close → status 1 → auto-save → status 2 sequence, and no version regression (B-T04, B-T05, B-T08).
- [ ] 14.3 Persist pipeline: accept a download address on the browser-facing or the server-to-server DocumentServer origin, fetch its path from the server-to-server origin with redirect validation, timeout and size limit; size, type and OOXML container checks; success acknowledged only after the version and receipt are durable. Uses the B1 item "origin of the download address". Verify: tests for an address on each accepted origin, an arbitrary host, a redirect to another host, an oversized body, a non-OOXML body, and a storage failure that returns an error to DocumentServer.
- [ ] 14.4 Decision record `ocu-office-control-plane-routes` (design D7: two routes authenticated by ticket and DocumentServer JWT instead of the internal token). Verify: `make decisions-verify` passes.

Depends on: 13.
Suggested fixture level: expanded - a control-plane entrypoint authenticated without the internal token, outbound fetch, file writes.
Minimal mergeable slice: 14.1 (routes and their authentication) - green alone because an authenticated request is answered without further handling until 14.2; 14.2 and 14.3 add the handling behind it; 14.4 is documentation.

## 15. [ocu] Publish inside the fence (spec: ocu-office-publish)

- [ ] 15.1 Publish for a sandbox that is not running: under the per-chat lock take the journal entry, resolve the path from the persisted index, compare the workspace hash with the baseline through the safe read, replace atomically through an exclusive no-follow temporary file with a second parent-component check, register with the outputs broker, and finish in one state update. Verify: tests for a clean publish, a baseline mismatch, a missing path and an unrecorded rename (nothing written), a file replaced by a symlink and a parent directory replaced by a symlink each ending as the conflict `baseline_mismatch` with nothing read through the link, a parent swapped for a symlink between the hash and the replace through a test seam ending as `unsafe_path`, an unreadable index (`index_unavailable`), a same-size publish that bumps the revision (B-T07, B-T13), a background writer changing another file during the publish, and a concurrent launch that runs only after the publish (B-T06).
- [ ] 15.2 Publish for a running sandbox: pause, verify paused, replace, unpause, and remove the marker only when the sandbox is observed not paused; a pause failure fails the publish and keeps the version; more than 5 seconds paused fails and unpauses. Verify: fake-engine tests for each path, for an unpause that fails once, and for a retention stop arriving during the window (B-T06).
- [ ] 15.3 Recovery: the stale-fence marker cleared by the startup sweep and the idle-reclamation poll with the sandbox unpaused, and a journal entry left by a crash driven again at startup, by the poll (before the session sweep of 13.3 checks the chat's sessions) and before the next publish. Verify: tests that kill the publish at each step and restart (B-T06, B-T11); the sandbox is never left paused, the file is never half-written, and the temporary file is removed.
- [ ] 15.4 Decision record `ocu-office-publish-fence` (design D11, D12: two states, pause as the only barrier, no reconcile inside the publish, no lease for retention or recovery). Verify: `make decisions-verify` passes.

Depends on: 9, 13 (15.2 and 15.3 edit `docker_manager.py`, which group 3 changes, and the idle-reclamation poll, which 13.3 changes; group 13 brings groups 10 and 3 with it).
Suggested fixture level: expanded - concurrency with sandbox writers, atomic file replace, crash recovery, path safety.
Minimal mergeable slice: 15.1 (not-running publish) - green alone because it needs no engine call and is the base of the running path; 15.2 and 15.3 extend it; 15.4 is documentation.

## 16. [ocu] Persist-to-publish wiring (spec: ocu-office-callback, ocu-office-sessions, ocu-office-publish)

- [ ] 16.1 A callback with publish intent writes the version, the receipt and the journal entry in one state update and then publishes; the outcome sets the session as design D11's table says — the published or failed outcome of a save that is not the outstanding one leaves the state as it is — and `last_published_seq` advances as D9 defines; a duplicate of the callback drives an entry that survived a crash; a conflict met by a status 6 result while the session is `closing` leaves it `closing` until the final callback meets the conflict again; and a journal entry is driven to its outcome before its session is marked `orphaned`, on a request and in the sweep, the orphaning then applying to the state the outcome left. Verify: tests through the callback route for save, close, conflict and each failure reason; a crash after the version is durable and before the publish ends published or in conflict after the retry; the late callback of `save_seq` 3 published while `save_seq` 4 is outstanding leaves the session `saving`; a status 6 conflict in a `closing` session followed by the final callback ending in `conflict`; a session with a surviving save entry found forgotten by DocumentServer has the entry driven first, holds none afterwards and is `orphaned`, while one whose surviving entry followed a final callback ends `closed`, `conflict` or `error` and is not orphaned.
- [ ] 16.2 Nothing new to save: a publishing save for which DocumentServer reports nothing new, and a status-4 callback, publish the session's latest stored version when it is unpublished; a save of either intent that finds nothing new while the latest version is already published advances `last_published_seq`. Verify: tests for save after an auto-save with no further edits, a second save with no change, status 4 after an unpublished auto-save, an auto-save equal to the published content, an auto-save that finds nothing new after a publish (both sequence values advance), and one that finds nothing new while a version is unpublished (`last_published_seq` unchanged).
- [ ] 16.3 Unattended outcomes at close: `path_missing` is resolved at once by saving the version as a new deduplicated file, claimed with the no-replace helper of 1.1; a missing workspace files directory ends the session `error` with `workspace_missing` and creates nothing; `baseline_mismatch` stays a `conflict` for the next open. Verify: tests for each, including the new file's `file_id`, its first version's source and the Files listing.

Depends on: 14, 15 (group 1's claim helper is reached through 15 → 13 → 12 → 11 → 3 → 2 → 1).
Suggested fixture level: expanded - publish decisions on user data across a crash boundary.
Minimal mergeable slice: 16.1 (callback to publish) - green alone because it uses only the callback route and group 15; 16.2 and 16.3 add cases on the same path.

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

- [ ] 20.1 `static/office-editor.js`, protocol and state: the four messages with exact key sets and origin, chat and generation checks; session creation through the request wrapper; editor creation from the signed configuration; state reporting including `dirty`, `workspace_changed`, `reason` and `refused`; the editor's own cap refusal mapped to `refused` using the B1 item "editor event for the connection cap". Verify: module tests with a fake editor API cover a valid open, each rejected message, each reported state, a creation refused with `connection_limit`, with a validation reason and with `unpublished_version` (each reported as `refused` with no second create), a failed API load reported as `error`, and the cap refusal on a new session and on a join.
- [ ] 20.2 The save / close / auto-save loop and teardown: `save` and `close` commands, the retry of a save refused while an auto-save is outstanding, status polling, the 5-minute auto-save when the editor reported a modification, the editor destroyed only after the close was accepted, and teardown that releases timers, listeners, pending requests and the editor. Verify: module tests cover each command, the auto-save timer, a second save with no change ending not dirty, a failed request never reported as success, and no late effect after teardown.

Depends on: 13, 19.
Suggested fixture level: expanded - a cross-frame protocol on the trusted origin that drives saves.
Minimal mergeable slice: 20.1 (protocol and state) - green alone because the page opens a session and reports state without sending saves; 20.2 adds the loop.

## 21. [deploy] Proxy table: Office rows (spec: ocu-reverse-proxy)

- [ ] 21.1 Add the seven Office rows of design D7 to `routes.json`, the `{file}` and `{session}` single-segment placeholders to the renderer, and the new row count and pin. Verify: `deploy/proxy/tests/` cover owner forwarding of each row with the internal credential and chat identity, the mutation guard on the five POST rows, placeholder rejection of traversal and encoded separators, and 404 without upstream contact for `/office/source/…`, `/office/callback/…` and the imports route.

Depends on: 5 (both edit the route table and its pin).
Suggested fixture level: expanded - reviewed default-deny gateway table, authentication mapping and its pin.
Minimal mergeable slice: atomic - rows, placeholder validation and pin are checked together by the renderer; a table that does not match its pin does not render.

## 22. [webui] Stub Office fixtures and gateway smoke (spec: ocu-stub, ocu-proxy-smoke)

- [ ] 22.1 `scripts/ocu-stub.py`: deterministic Office session, status, save, close, resolve, versions and restore fixtures and an `embed=office` host page that speaks the message protocol without a real editor. The selectable outcomes are added once, as these scenario names of the stub's existing mechanism: `office` (default round trip), `office_conflict`, `office_cap` (refused at creation), `office_editor_cap` (refused by the editor), `office_orphaned`, `office_save_as` (automatic save-as at close), `office_unpublished` (newest version unpublished, no session) and `office_stale` (a stale session whose first creation is refused with `unpublished_version`); `scripts/smoke-stub.sh` asserts them. Verify: `make smoke-stub` output names each fixture.
- [ ] 22.2 Bump the OCU pin in `constraints.yaml` to a commit that holds the Office rows (group 21) and does not yet hold group 31, add `smoke/proxy/office.hurl` to the explicit file list `HURL_GLOBS` in `scripts/smoke-proxy.py`, and make the script log every hurl file it ran, on success as well (today it prints only on failure): owner success, anonymous 401, non-owner 404, mutation guard 403, and the unproxied control-plane routes. Verify: `make smoke-proxy` passes, its output lists `office.hurl` among the files that ran, and with the file removed from the list the output no longer names it.

Depends on: 7, 21.
Suggested fixture level: compact - deterministic test infrastructure following an already reviewed table.
Minimal mergeable slice: 22.1 (stub fixtures) - green alone because the stub is exercised by its own smoke; 22.2 needs the pinned table of group 21.

## 23. [webui] Feature flag, client and store (spec: ocu-office-workspace-ui)

- [ ] 23.1 `ENABLE_OCU_OFFICE_EDIT` (default false) parsed strictly — a value that is neither true nor false fails startup — exposed as `enable_ocu_office_edit` in the config features object beside `enable_ocu_workspace`, and set in the harness environment. Verify: a backend test asserts the feature value for both settings and the startup failure; `make smoke` passes.
- [ ] 23.2 `src/lib/apis/ocu/office.ts` (session status, versions, restore, resolve, with the mutation header and the existing error mapping) and a chat-keyed Office store module. Verify: Vitest covers request shape, error mapping, generation handling and that no state crosses chats.

Depends on: none beyond group 8.
Suggested fixture level: expanded - a config surface in the upstream spine (`main.py`) and a new client on guarded routes.
Minimal mergeable slice: 23.1 (the flag) - green alone because nothing reads it yet; 23.2 adds modules without callers.

## 24. [webui] Edit entry and editor frame (spec: ocu-office-workspace-ui)

- [ ] 24.1 `WorkspaceArtifact`: the 编辑 action on DOCX / XLSX / PPTX entries behind the flag, never launching a stopped sandbox, and a third iframe class with code-fixed `sandbox` and `allow` values (the B1 items "iframe sandbox and permission lists"), created once per edit action, with validation of child messages by source, origin, schema, chat, file and generation and a ready deadline that retires the frame and offers a retry; logic in a new module. Verify: Vitest covers flag off (no action, no request), no launch request when the workspace is stopped, frame creation, a publish-driven revision change that keeps the frame, each rejected message, the deadline, and the unchanged policies of the other two frame classes.
- [ ] 24.2 Wire the Office browser cases into `make verify-ui-ocu`, with the first case: add `e2e/ocu-office.e2e.ts` (open → editing) and `ocu-office` to the `testMatch` pattern of `playwright.ocu.config.ts`; add the eight Office scenario names of 22.1 to `SCENARIOS` in `scripts/verify-ui-ocu.py`, which creates one chat per scenario; and make that script list the configured tests before the run (`playwright test --list`) and exit non-zero when a required spec file — `ocu-office.e2e.ts` among the existing four — contributes no test. Verify: `make verify-ui-ocu` passes with the Plan 1 A-T01 case and the Office case named in its output, a screenshot, and zero unexpected console errors; with `ocu-office` removed from the match pattern the command exits non-zero naming the missing file (shown once in the PR).
- [ ] 24.3 Status bar: state text for opening, unsaved, saving, saved, conflict, failed, expired and refused; the save button; the workspace-changed notice; strings through the existing localisation mechanism. Verify: Vitest covers each state and that "saved" appears only after a confirmed publish.
- [ ] 24.4 Extend `e2e/ocu-office.e2e.ts` through the proxy and the stub: reach editing, save, see saved; refusal at the cap by the broker and by the editor. Verify: `make verify-ui-ocu` passes with screenshots and the cases named in its output.

Depends on: 22, 23.
Suggested fixture level: expanded - iframe sandbox policy on a Critical Path component.
Minimal mergeable slice: 24.1 together with 24.2 (edit action and frame, with its browser case and the wiring that makes the case run) - green alone because the frame works without the status bar, and AGENTS.md requires the Playwright evidence for a change to this Critical Path component; 24.3 and 24.4 follow.

## 25. [webui] Maximize and version history (spec: ocu-office-workspace-ui)

- [ ] 25.1 Maximize as an in-page overlay that keeps the same editor frame. Add a maximize case to `e2e/ocu-office.e2e.ts` that takes one explicit screenshot of each layout into `.run/ui-evidence/` (the configuration captures only on failure). Verify: Vitest asserts the frame element survives maximize and restore; `make verify-ui-ocu` passes with the maximize case named in its output and both screenshots present.
- [ ] 25.2 Version history: reachable from the status bar and from the file entry when no editor is open; list with source and published flag; the restore action, disabled while an editor frame is open on the document in this page and otherwise left to the broker's answer. Verify: Vitest for the list, both entry points, the restore call, the disabled state, and a `session_open` refusal shown as an error.

Depends on: 24.
Suggested fixture level: expanded - a restore request that replaces user content.
Minimal mergeable slice: 25.1 (maximize) - green alone because it only changes layout; 25.2 is an independent dialog.

## 26. [webui] Conflict dialog and the open-time prompt (spec: ocu-office-workspace-ui)

- [ ] 26.1 Conflict dialog: `save as new file` as default, `overwrite` behind a second confirmation, only `save as` when the reason is `path_missing`, and a resolve refused with `workspace_missing` closing the dialog with its message. Verify: Vitest for each branch and a browser case in `e2e/ocu-office.e2e.ts` driven by the stub's `office_conflict` scenario, named in the `make verify-ui-ocu` output.
- [ ] 26.2 Before the editor frame is created: a pending close-time conflict (`open_session` in `conflict` with `editor_ended` true) is presented first; otherwise, when no session is open and the document's newest version is unpublished, offer to restore it or to start from the current file; and when the host page reports the creation refused with `unpublished_version`, retire the frame and repeat the check once. Verify: Vitest for the pending conflict, both choices, no prompt when nothing is unpublished, and the refusal leading to the prompt; browser cases driven by the stub's `office_unpublished` and `office_stale` scenarios.

Depends on: 25 (the restore call and the versions client state).
Suggested fixture level: expanded - overwrite and restore requests on user content behind confirmations.
Minimal mergeable slice: 26.1 (conflict dialog) - green alone because it reacts to a state the frame already reports; 26.2 adds the check before the frame.

## 27. [webui] Unsaved-state guard (spec: ocu-office-workspace-ui)

- [ ] 27.1 A guard module: `beforeunload` only while unpublished changes exist; chat switch and sidebar close send `close`, follow the session status after the frame is gone until a final state or the progress timeout (the B1 item "close-to-status-2 delay"), report how the close ended (saved, saved as a new file with its name, conflict at the next open, failed, unconfirmed), and never apply a late result to another chat; `ChatControls.svelte` and `Chat.svelte` gain only calls into the module. Verify: Vitest covers each trigger, each reported ending and the late-result case; the diff of the two upstream files contains no Office logic; `make verify-ui-ocu` passes.
- [ ] 27.2 Extend `e2e/ocu-office.e2e.ts` with B-T12 — switch chat, close the sidebar, refresh, reopen the old chat — and with a close that ends saved as a new file (the stub's `office_save_as` scenario). Verify: `make verify-ui-ocu` passes with screenshots and the cases named in its output.

Depends on: 26 (both extend the same browser spec file and the same component).
Suggested fixture level: expanded - hooks in upstream spine components listed as Critical Paths.
Minimal mergeable slice: 27.1 (module and hooks) - green alone because it is covered by component tests and the existing browser cases; 27.2 adds the browser walk.

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
