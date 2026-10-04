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
- `ocu-office-sessions`: edit session lifecycle and the browser-facing session API — create/join, status with change notice, save, close, the one-level save model and key stability.
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

## Uploaded-file browser evidence fixture

- Issue type: test; fixture level: compact, matching the suggested level. One browser case consumes existing upload, auth and listing contracts; it changes none of those mechanisms.
- Scope: task 7.2, the workspace e2e spec and an existing fixture helper only if needed. User-approved evidence exception: commit one compressed screenshot under `docs/evidence/issue-118/` and link it in the PR, without changing CI.
- Blast radius: test isolation and the reliability of upload-to-visible-Files evidence; production behavior remains unchanged.
- Selected risk packs: test entry, auth provenance, browser reconciliation ordering, error observation and evidence documentation. No new design decision; the shared design remains unchanged.
- Evidence floor: a negative control without the upload fails the visible-filename assertion; the real owner multipart POST makes its returned filename visible in the saved chat's Files panel. The complete `make verify-ui-ocu` run passes with zero unexpected console/page errors and an inspected screenshot.

## Persisted file-id resolution fixture

- Issue type: feature; fixture level: expanded, matching task 9.1's suggested level.
- Scope: task 9.1 in the OCU outputs broker and its existing test module. Registration, routes and Office callers remain separate tasks.
- Blast radius: stable identity after reconciliation, missing-versus-corrupt errors, and the shared lifecycle lock.
- Selected risk packs: API, persisted schema compatibility, file IO/path safety, concurrency, bounded index reads, errors and documentation.
- Evidence floor: broker regressions plus a real-filesystem smoke proving indexed rename resolution, tombstone rejection, unchanged index bytes/counter and nested lock use, with Docker unavailable.
- Source execution is authorized before B1 completion by the user's 2026-10-03 ruling. B1 remains user-owned; source merge is not a measured go or release acceptance.

## Host-write registration fixture

- Issue type: feature; fixture level: expanded, matching task 9.2's suggested level.
- Scope: the OCU outputs broker and its existing tests; no route, upload, lifecycle or schema change.
- Blast radius: durable file identity, exactly-once revision increment per registration, path confinement and inter-process write ordering.
- Selected risk packs: API, file IO/path safety, schema, concurrency, resource limits, compatibility, errors and documentation.
- Evidence floor: same-size and size-changing registration, fresh-process durability, concurrent reconcile exclusion, no-double-count reconcile, rejection-byte preservation and a real-filesystem write/register/read smoke.

## Office state-store fixture

- Issue type: feature; fixture level: expanded, matching tasks 10.1 and 10.4.
- Scope: OCU `office/` state store, paired tests, server Dockerfile and COPY-inventory test; WebUI architecture decision record. No routes, version blobs, receipts semantics, epoch or configuration.
- Blast radius: per-chat durable state, cross-worker lost updates, corruption preservation and packaged module availability.
- Selected risk packs: API, file IO/path safety, schema, concurrency, compatibility, errors, packaging and documentation.
- Evidence floor: both process update orders, actual lock contention, killed-before-replace predecessor, fresh-process persistence, corrupt/unreadable-state byte retention, and a missing-office-COPY negative control. Decision and doc gates cover the companion record.

## Version and receipt storage fixture

- Issue type: feature; fixture level: expanded, matching task 10.2.
- Scope: extend the Office store and its paired test module; keep the state transaction, routes, outputs broker and configuration behavior unchanged.
- Blast radius: immutable history, receipt/version atomicity, storage admission and safe workspace bytes.
- Selected risk packs: API, file IO/path safety, schema, concurrency, resource limits, compatibility, errors and documentation.
- Evidence floor: content-addressed deduplication, monotonic records/published flag, restart receipt lookup, atomic version+receipt, floor/ENOSPC rejection, descriptor-confined reads and same-chat process ordering.

## Restore-epoch reader fixture

- Issue type: feature; fixture level: expanded, matching task 10.3's persisted deployment marker.
- Scope: `office/epoch.py` and paired `test_office_epoch.py`; no store, session, restore writer or route changes.
- Blast radius: distinguishing absent initial epoch from every opaque token, including an empty token, across requests/workers.
- Selected risk packs: API, file IO/path safety, schema/value representation, ordering/fresh reads, compatibility, errors and documentation.
- Evidence floor: absent → A → B same-process reads, whitespace and empty-token equality, unreadable/nonregular/symlink rejection without writes, and a fresh-process marker smoke.

## Office configuration fixture

- Issue type: feature; fixture level: expanded, matching task 11.1.
- Scope: `office/config.py`, the Office check in `auth_guard.startup_preflight`, and paired/startup tests. No route, deploy or store-consumer changes.
- Blast radius: parent-process fail-closed startup, secret disclosure, shared setting names and tuning units.
- Selected risk packs: API/entrypoint, config, schema/names, auth/secrets, resource defaults, compatibility, errors, packaging and documentation.
- Evidence floor: disabled/enabled and missing/blank matrix, secret canaries, packaged-parent exit without listening/respawn, existing guard regressions and whitespace-bypass negative control.

## Isolated B1 measurement fixture

- Issue type: release characterization; fixture level: expanded for the new cross-origin, callback and shutdown measurement oracles. This overrides the suggested documentation-only level for evidence review, not the source-code scope.
- User exception, 2026-10-03: one isolated local measurement campaign of the pinned, unmodified DocumentServer 9.4.0 image is permitted. Restarts needed to measure shutdown reset are within that campaign; all other image builds and acceptance, including #197, remain frozen.
- Blast radius: an incorrect observation or unsupported go would release dependent Office work against the wrong protocol.
- Scope: task 8 records and fixture only; disposable measurement helpers are not production code or the later `verify-office` target. No LAN access, deployment, Office implementation or dependency upgrade.
- Selected risks: protocol/API fields, image/config identity, auth/cookie containment, concurrent editor state and shutdown ordering, environment limits, licence/font provenance and evidence documentation.
- Evidence floor: actual editor input and exported bytes for three formats; observed callbacks, command responses and browser events for the nine consumed values; explicit missing/operator-only items; owned-resource cleanup; independent evidence review before a verdict.

## Token and command-client fixture

- Issue type: feature; fixture level: expanded, matching task 11.2.
- Scope: OCU `office/tokens.py`, `office/commands.py` and paired tests; no routes, state transitions, configuration changes or dependencies.
- Blast radius: verified-payload authority, ticket confinement/expiry, credential containment and correct command outcome classification.
- Selected risk packs: API, config, schema/units, auth/secrets, ordering/expiry, resource bounds, compatibility, errors, packaging and documentation.
- Evidence floor: independent HS256 interoperability, altered/expired/wrong-key token rejection, every ticket binding, real fake-server HTTP outcomes, redirect containment and no credentials in captured output.
- B1 input: [record item 12](../../../docs/evidence/issue-119/2026-10-03-b1.md) observed exact `userdata` echo in an authenticated status-6 callback. This slice uses local fake HTTP tests, not another image campaign.

## Office gateway rows fixture

- Issue type: feature; fixture level: expanded, matching task 21.1: reviewed production routing and owner authorization share a fail-closed boundary.
- Scope: OCU `deploy/proxy/` table, renderer, existing tests and README; the WebUI companion records this fixture and task completion. No broker, listener, compose, deployment, image operation or WebUI pin change.
- Blast radius: a wrong row, identity capture or raw-path match can forward an unauthorized Office/control-plane request.
- Selected risk packs: public HTTP API, production configuration, auth/permissions, path safety, schema/pin compatibility, error handling, atomic file replacement and documentation.
- Evidence floor: a real-nginx Office forwarding case red against the unchanged table, then green; all seven owner rows and denial matrices; renderer pin/count/placeholder rejection preserving the previous private config; all existing proxy tests and the structure check.

## Office stub fixture

- Issue type: test infrastructure; fixture level: expanded. Override the suggested compact level because the threaded HTTP stub gains per-chat session state and an executable parent-message protocol.
- Scope: task 22.1 only, the stub and its smoke helpers. Seven named scenarios are authoritative; the issue's isolated reference to eight is not an additional scenario.
- Blast radius: deterministic browser/gateway fixtures, file identity and revisions, existing preview modes and credential containment.
- Selected risk packs: API, configuration, schema, auth, concurrency, compatibility, errors and documentation.
- Evidence floor: `make smoke-stub` exercises every named scenario, default behavior, forbidden methods/paths, isolation and deterministic replay; lint and documentation gates pass. Host-page JavaScript is review-only in this slice; browser execution belongs to tasks 24.1 and 24.4.

## Office route availability fixture

- Issue type: feature; fixture level: expanded, matching task 12.1.
- Scope: OCU guard, `office/router.py`, minimal app registration and paired/auth/import-isolation tests; no sessions, state writes, DocumentServer calls or deployment changes.
- Blast radius: authentication precedence, canonical path identity, disabled-route containment and accidental chat-directory creation.
- Selected risk packs: API, config, file/path safety, response schema, auth, ordering, compatibility, errors, packaging and documentation.
- Evidence floor: real app authorization matrix, literal empty-segment rejection, Office preflight/method coverage, zero state/network work on denials, enabled/disabled import isolation and packaged HTTP smoke.

## Office session creation fixture

- Issue type: feature; fixture level: expanded, matching task 12.2.
- Scope: creation handler and tests, with the [approved minimal store/read extensions](https://github.com/DankerMu/open-webui/issues/128#issuecomment-5977752090): one commit for version/document/session and a bounded descriptor-safe read. No new dependency or storage-schema migration.
- Blast radius: partial session capture, workspace path escape, oversized reads, cross-chat disclosure and signed configuration integrity.
- Selected risk packs: API, config, file/path safety, record schema, auth/secrets, concurrency, resource limits, compatibility, rollback, packaging and documentation.
- Evidence floor: actual-app refusal/success matrix, byte-preserving refusal snapshots, atomic-commit failure injection, bounded safe-read and existing store regressions, concurrent creation, independent configuration verification and packaged HTTP smoke.

## Office gateway smoke fixture

- Issue type: test infrastructure; fixture level: expanded. Override compact because a shared smoke entrypoint and external configuration pin establish owner-only authorization evidence.
- Scope: task 22.2, the WebUI OCU pin, gateway smoke/support and Hurl matrix; no stub, browser harness, production or OCU source changes.
- Pin: `a53731df95a3b92acb2dcb5980f969b4f8b4ee52`, the pushed Office-row merge. Its table has 27 rows, seven Office rows and no upload read rows; its renderer has neither second-listener input.
- Blast radius: false-positive gateway acceptance, leaked credentials and lost denial provenance.
- Selected risk packs: API, config, file IO, schema, auth, ordering, compatibility, errors, packaging and documentation.
- Evidence floor: real WebUI owner/non-owner cookies through native nginx to the deterministic stub; each denied request causes zero upstream arrivals; every executed Hurl file is named; stale-table, omitted-file and missing-file negative controls.

## Office join and status fixture

- Issue type: feature; fixture level: expanded, matching task 12.3.
- Scope: replace repeated-create refusal with join/reopen handling, add persisted status with epoch comparison, and make freshly minted source tickets distinct even within one clock tick without changing helper signatures or verifier bindings.
- Blast radius: duplicate sessions across workers, stale-key admission, loss of unpublished history, incorrect epoch transitions and replayed editor configuration.
- Selected risk packs: API, configuration, file IO, record schema, auth/secrets, concurrency, resource limits, compatibility, errors, packaging and documentation.
- Evidence floor: two-process create/join/status, complete lifecycle/key/epoch matrix, real fake-DocumentServer HTTP, exact unchanged-state refusal snapshots, fresh same-clock tickets and packaged two-worker HTTP smoke.

## Office feature-flag fixture

- Issue type: feature; fixture level: expanded, agreeing with task 23.1's shared config/startup surface.
- Scope: strict import-time Office flag in fork-owned code, one authenticated features entry in `main.py`, dev/test harness settings and backend behavior tests. No `config.py`, workspace parsing, frontend, route or deployment changes.
- Blast radius: application startup availability and authenticated feature discovery.
- Selected risk packs: API, config, schema, auth visibility, ordering, compatibility, errors and documentation.
- Evidence floor: fresh-process environment-to-authenticated-config matrix; invalid input fails startup naming the variable; existing workspace assertions and `make smoke` pass; scoped lint/coverage and doc checks.

## Office save and close fixture

- Issue type: feature; fixture level: expanded, matching task 13.1's persisted state-machine and command-service boundary.
- Scope: save/close request handlers, allocation metadata and signed native-force-save setting; no callback, publish, sweep or server-side auto-save timer.
- Blast radius: reused sequence numbers, lost save intents, command/callback lock inversion, delayed replies overwriting newer lifecycle state and premature save acknowledgement.
- Selected risk packs: API, config, file IO, schema, auth/secrets, concurrency, resource limits, compatibility, partial failure, packaging and documentation.
- Evidence floor: state/outcome/epoch matrix, independently verified real HTTP commands, two-process admission, command-time callback-side lock acquisition, concurrent close/reconciliation and byte-preserving refusal proofs.
- B1 input: [native save observation](../../../docs/evidence/issue-119/2026-10-03-b1.md#13-editor-native-save-with-user-force-save-disabled) with `editorConfig.customization.forcesave = false`: no callback in the measured 199.701-second DOCX window, not an unbounded guarantee.

## Office client and store fixture

- Issue type: feature; fixture level: expanded for guarded HTTP calls and asynchronous chat isolation.
- Scope: task 23.2, two new frontend modules with paired Vitest files, intentionally without callers. Existing workspace exports, backend, components and `artifactContents` stay unchanged.
- Blast radius: broker refusal visibility, mutation request shape and late results reaching the wrong chat.
- Selected risk packs: API, schema, auth transport, concurrency/ordering, compatibility, errors and documentation.
- Evidence floor: four request shapes, unchanged broker reasons, transport/JSON failures, current/retired generations and two-chat isolation; per-file coverage, scoped lint/typecheck, actual HTTP client/store smoke and clean-runner full frontend checks.
