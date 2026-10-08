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

## Office workspace-change notice fixture

- Issue type: feature; fixture level: expanded for descriptor-safe file observation and shared persisted bookkeeping.
- Scope: task 13.2's status notice and two cache fields; reuse the unchanged safe-reader primitives and persisted index resolver. No reader/store API extension, reconcile, publish, sweep or UI change.
- Blast radius: reads through unsafe paths, stale cache hints, an adopted or overwritten baseline, lost callback metadata and accidental save refusal.
- Selected risk packs: API, file IO/path safety, schema, auth containment, concurrency, resource bounds, compatibility, errors, packaging and documentation. No configuration or dependency change.
- Evidence floor: no-read cache hits, size/mtime and deliberate forged-metadata behavior, unsafe/missing recovery, no foreign/other-file IO, save acceptance, two-worker state conservation and packaged status HTTP smoke.
- Existing creation already persists the comparison baseline. Missing baseline is corruption, not a migration that adopts current content; absent cache fields are initialized by the first status observation.

## Office editor entry and frame fixture

- Issue type: feature; fixture level: expanded, matching tasks 24.1 and 24.2.
- Scope: WebUI edit entry, one editor-frame module and paired tests, Office browser case, configured discovery and seven scenario registrations. Use the delivered client/store; no broker, stub, Chat/ChatControls or deployment changes.
- B1 input: [record item 14](../../../docs/evidence/issue-119/2026-10-03-b1.md#14-minimal-tested-iframe-capabilities) supplies literal `sandbox="allow-scripts allow-same-origin"` and `allow=""`; no permission inferred from other frame classes.
- Blast radius: accepting forged child messages, reloading an active editor on publish, stale state crossing frames/chats, and false-green browser discovery.
- Selected risk packs: message API/schema, feature configuration, auth/frame authority, concurrency/lifecycle, discovery/resources, compatibility, errors and documentation.
- Evidence floor: mounted flag/type/policy/identity matrix, rejected-message matrix, one handshake and ready-timeout/retry, browser open-to-editing with parent state acceptance, A-T01, missing-spec and missing-scenario negative controls, per-file coverage and exact-head CI.
- Slice boundary: status/save UI, maximize/history/conflict/pre-open choices and close guards remain later tasks. Direct open and no close-on-removal are the issue's explicit interim behavior, not completed evidence for those later requirements.

## Office session sweep fixture

- Issue type: feature; fixture level: expanded, matching task 13.3.
- Scope: Office session sweep from the existing idle poll, persisted activity/save-start times and their current request producers. Sandbox reclamation, journal/fence recovery, callbacks and deployment remain unchanged.
- Blast radius: live-session orphaning, permanently stuck saves, lost pending allocations, Office-only chats missed by discovery and two-worker state loss.
- Selected risk packs: API, config, file/path safety, schema, auth containment, concurrency, discovery, compatibility, errors, packaging and documentation.
- Evidence floor: actual poll ticks with a controlled clock and independently authenticated fake DocumentServer; timeout boundaries, unavailable/no-op conservation, Office-only discovery, request activity, save-after-timeout and two-process locked transitions. Packaged two-worker runtime exercises the poll.

## Office control-plane authentication fixture

- Issue type: feature; fixture level: expanded, matching tasks 14.1 and 14.4.
- Scope: source-ticket delivery, callback authentication, availability/peer admission and credential-safe logs; no callback status processing, downloads, persistence, publish or gateway changes.
- Approved scope exception: the existing blob verifier may return its already-read, verified bytes for source delivery. Keep one reader, existing write/deduplication semantics and storage format; add regression evidence for existing callers.
- Blast radius: foreign version disclosure, false save acknowledgement, deleted-chat resurrection, token disclosure and weakened service authorization.
- Selected risk packs: API, configuration, file/path safety, schema compatibility, auth/secrets, concurrency, resource handling, errors, packaging and documentation.
- Evidence floor: actual-app authentication/denial matrix with exact byte/state conservation, verified-version hash after workspace change, no-follow/missing/corrupt storage cases, unchanged version-store consumers and real packaged-worker HTTP/access-log smoke. The companion decision record and fixture pass documentation gates.

## Office status and save-control fixture

- Issue type: feature; fixture level: expanded, matching task 24.3.
- Scope: validated-state presentation, current-frame save command, refused/closed retirement and expired reopen. Browser save/refusal cases remain task 24.4; no harness, stub, backend or Chat/ChatControls change.
- Blast radius: claiming saved before publish, sending a command to retired authority, hiding creation refusal, or regressing an admitted editor's identity.
- Selected risk packs: message API/schema, frame authority, lifecycle/ordering, compatibility, error handling and documentation. No configuration, filesystem, discovery, deployment or dependency change.
- Evidence floor: mounted status/precedence matrix, exact command destination/payload and no optimistic status, no-change save, failed-editing reason, all validation refusals, expired reopen, closed fallback, invalid-message invariance, existing identity/security tests and actual unchanged browser harness.
- UI proof covers the bar in the existing first-open browser path. Full save/refusal browser scenarios remain the next issue; this does not substitute for their later acceptance.

## Office save and refusal browser-proof fixture

- Issue type: test; fixture level: expanded, agreeing with the suggested level for the exercised frame/protocol boundary.
- Scope: task 24.4 in the existing Office browser spec, with existing shared e2e helpers only where needed. No component, stub, harness configuration, backend, dependency or OCU change.
- Blast radius: false-green save confirmation, hidden validation refusal, lost read-only access or unnoticed close requests.
- Selected risk packs: API/schema, authenticated integration, ordering/shared state, compatibility, errors, discovery and evidence documentation.
- Evidence floor: actual route/proxy/stub save and refusal cases, a deterministic withheld-status confirmation window, private request records, usable preview/download, screenshots and no unexpected browser errors.
- Characterization mode: production already implements these behaviors. Qualify new assertions with controlled known-bad browser/test inputs, restore them, and run the unchanged full browser target; no invented production RED or claim of a real DocumentServer save.
- Review seats: correctness and test-evidence+spec-compliance; test-only scope needs no separate production security/performance seat.

## Office maximize fixture

- Issue type: feature; fixture level: expanded, matching task 25.1. The suggested level stands for live iframe/lifecycle integration, not the unrelated restore operation in 25.2.
- Scope: an in-page editor/status overlay and restore control, mounted tests, browser proof and generated localization. No history, conflict, pre-open choice, close guard, upstream Chat/ChatControls, stub, harness configuration or OCU change.
- Governing invariant: maximize and restore change layout only; the same iframe, live document, session, generation and message binding survive.
- Selected risk packs: component API, iframe authority compatibility, lifecycle/ordering, layout integration, errors/cleanup, discovery and documentation.
- Evidence floor: semantic mounted RED then identity/command/no-Fullscreen GREEN, actual desktop and narrow-layout geometry and continuity, explicit sidebar/overlay screenshots, one session creation and existing browser regressions.
- Promote the existing wrapper to the browser top layer with a manual popover while maximized, then remove popover state on restore. Fixed positioning alone is obstructed by the existing Navbar/resizer stacking contexts. A portal, cloned frame or detach/reinsert remains forbidden; unchanged node identity alone does not prove no navigation.

## Office callback persistence fixture

- Issue type: feature; fixture level: expanded, matching tasks 14.2 and 14.3.
- Scope: authenticated callback processing, confined download and durable receipts/versions; no publish, journal, container lifecycle, deployment or storage-primitive changes.
- Blast radius: false save acknowledgement, stale results replacing newer state, outbound credential/path escape and partial durable commits.
- Selected risk packs: API, configuration, file IO, schema, auth/secrets, concurrency, resource bounds, compatibility, partial failure, packaging and documentation.
- Evidence floor: route-driven status/order/retry matrix, real HTTP download containment, exact workspace/index conservation, fresh-process durability, bounded crash/retry and concurrent callback smoke.
- B1 input: [record item 7](../../../docs/evidence/issue-119/2026-10-03-b1.md#7-callback-download-origins) supplies the observed browser-facing origin. Recorded statuses 1/2/4/6 seed replay fixtures; statuses 3/7 are explicitly synthetic protocol-error variants, not claimed measurements.

## Office version-history fixture

- Issue type: feature; fixture level: expanded, agreeing with task 25.2 because restore replaces workspace content.
- Scope: parent-owned history and restore through the delivered Office client, selected-file/status entries, paired tests and generated localization. No broker, stub, browser-spec, ancestor, controller or store changes.
- Governing invariant: history remains bound to its captured chat and file; only the broker authors versions and publication state, and a local live editor frame prevents restore.
- Selected risk packs: API/schema, mutation authority, overwrite, lifecycle/concurrency, compatibility, error handling and documentation.
- Evidence floor: semantic mounted RED; six issue acceptance cases plus stale completion, duplicate restore, failed reload and live-frame continuity; scoped gates, full unchanged UI target and disposable actual-page history smoke.
- Browser evidence uses the deterministic gateway/stub, not a real DocumentServer restore. Shared change and subsequent tasks remain open.

## Stopped-sandbox publication fixture

- Issue type: feature; fixture level: expanded, matching tasks 15.1 and 15.4.
- Scope: journal-driven publication for a stopped/absent sandbox and its fence decision; no callback, route, pause, recovery, lifecycle, broker or generic-store changes.
- Governing invariant: only a baseline-matching safe path is atomically replaced, registered once and completed durably under the launch lock; interrupted publication retains its recovery obligation.
- Selected risk packs: internal API/schema, file IO, identity compatibility, shared-state ordering, partial failure, resource ownership, packaging and decision documentation.
- Evidence floor: real temporary storage and broker listings, no-follow and same-size mutation oracles, exclusive-temp ownership, actual competing launch, fault-phase conservation and a fresh-process publish smoke. No image/LAN certification.

## Office stub URL compatibility fixture

- Issue type: bugfix; fixture level: expanded, agreeing with the prerequisite issue because emitted URLs cross a public producer/consumer boundary.
- Scope: the existing Office listing URL producer and its owning smoke assertions; no frontend validator, proxy, scenario, file identity, production OCU or unrelated upload change.
- Governing invariant: each Office listing URL canonically represents its logical path and retrieves the bytes described by that entry.
- Selected risk packs: public API/path representation, schema compatibility, sibling save-as transitions, response conservation, errors and documentation.
- Evidence floor: retained conflict-browser invalid_response RED plus an independent owning smoke RED; conflict and automatic-close copies pass canonical URL and returned-URL byte/hash checks, then the actual unchanged browser consumer accepts both real gateway listings.
- This authorized prerequisite precedes completion of task 26.1; the preserved conflict candidate and shared Office change remain open.

## Running-sandbox fence fixture

- Issue type: feature; fixture level: expanded, matching task 15.2 and the user-approved safe-boundary timing decision.
- Scope: one generalized publication pipeline with owned pause/observe/unpause, durable marker and honest elapsed-time reporting; no callback, recovery poll, lifecycle lease or deployment changes.
- Governing invariant: sandbox writers are excluded until the active publication work has settled; cleanup never assumes ownership of an external pause or erases an uncertain marker.
- Selected risks: internal API/schema, file IO, ownership, concurrency/state, timing/resources, partial failure, compatibility, packaging and documentation.
- Evidence floor: real filesystem transactions under a stateful fake engine, exact-five-second and delayed-operation cases, retained postreplace journal, marker/engine fault matrix and a process writer that quiesces only while paused.
- User ruling: [「接受安全边界超时」](https://github.com/DankerMu/open-webui/issues/136#issuecomment-5997477072) permits blocking operations to extend actual pause duration; no hard wall-clock, real-engine or image/LAN certification is claimed.

## Publish recovery fixture

- Issue type: feature; fixture level: expanded, matching task 15.3 and crash-state/file-ownership risk.
- Scope: stale owned fences and surviving journal entries at startup, before each poll's session read and before a new publish, including the user-approved minimal durable staging-ownership prerequisite; no callback/request outcome mapping, retention lease or deployment changes.
- Governing invariant: recovery acts on observed durable state under the canonical lock, never loses an undecided obligation, never resumes an unowned container and never rewrites a workspace successor merely to acknowledge it.
- Selected risks: internal API/schema, path/file ownership, identity compatibility, concurrency/state, discovery/integration, error/resource handling and evidence/documentation.
- Evidence floor: semantic existing-callable RED, complete crash-point conservation matrix, metadata-free Office discovery, prior-before-new ordering, no-second-write completion, exact marker age and release uncertainty, actual killed-process/fresh-process recovery and worker lock exclusion.
- Preserve the user-approved live safe-boundary timing policy. Real-engine/image/LAN, power-loss certification and later session-result integration remain outside this slice; shared OpenSpec stays open.
- [User scope ruling](https://github.com/DankerMu/open-webui/issues/137#issuecomment-6007445205): include the publisher staging prerequisite in #137 and preserve automatic recovery at every ordinary crash boundary. Do not substitute manual intervention for the creation-to-ownership-persistence window or delete foreign content from a journaled name alone.

## Office conflict-resolution fixture

- Issue type: feature; fixture level: expanded, matching task 26.1 and its explicit multi-path width exception.
- Scope: parent-owned conflict dialog, default save-as and confirmed overwrite, mounted branch tests, one permanent office_conflict browser case and generated localization.
- Governing invariant: only an explicit eligible choice resolves the captured current session; resolution never changes the accepted editor identity or fabricates host state.
- Selected risk packs: mutation API/schema, overwrite/authority, lifecycle/concurrency, compatibility, partial failures, browser discovery and documentation.
- Evidence floor: semantic mounted conflict-dialog RED; every issue branch plus stale/duplicate/confirmation invalidation; real gateway conflict-to-save-as with unchanged live document, preserved original and deduplicated Files entry.
- Keep WorkspaceArtifact below its unchanged size gate by extracting its existing selected-file action bar as one presentation responsibility; preserve markup, eligibility, callbacks and all existing editor/preview behavior. No ancestor, broker, stub, client/store/controller or dependency change.
- Pending pre-open conflicts, unpublished choices and leave guards remain later tasks. Runtime certification remains stub/gateway, not real DocumentServer or LAN.

## Office open-time fixture

- Issue type: feature; fixture level: expanded, matching task 26.2 and its multi-path exception.
- Scope: parent preflight between explicit Edit and frame creation, reuse of the conflict dialog for an ended session, bounded unpublished-version recovery, paired tests, two permanent browser cases and generated localization.
- Governing invariant: only a fresh broker versions response or an explicit choice made from that response admits the captured current activation; no stale completion or remembered browser state may skip unpublished content.
- Selected risk packs: API/schema, restore/overwrite authority, ordering and lifecycle, error conservation, compatibility, browser discovery and documentation.
- Evidence floor: mounted semantic RED; all seven issue criteria plus stale/duplicate boundaries; real office_unpublished and office_stale request ordering, prompts, screenshots and zero unexpected errors, with existing Office cases preserved.
- Keep editor generation authority in the delivered controller/store, not the preflight owner. Do not manufacture a live generation or write a frame-less conflict into ocuOffice.
- Post-resolution choice: return to the file entry without creating or selecting an editor; a subsequent explicit Edit reads versions anew. This conservative interpretation follows D13's ordinary new-session rule and does not auto-open a save-as result.
- No ancestor, broker, stub, gateway, dependency, message-schema or leave-guard change; shared Office change remains open.

## Callback publication fixture

- Issue type: feature; fixture level: expanded, matching task 16.1 and its durable callback-to-workspace boundary.
- Scope: atomic callback publication obligations, receipt-owned replay, terminal outcome/session mapping and drive-before-orphan ordering.
- Governing invariant: an acknowledged publishing callback owns either a durable obligation or its atomic terminal outcome; orphaning cannot abandon that obligation.
- Selected risks: callback API, persisted bindings, file overwrite, authentication preservation, shared-state ordering, partial failure, compatibility, runtime integration and documentation.
- Evidence floor: real callback-route semantic RED; save/final outcome matrix; commit and completion conservation; replay validation; late-save/closing precedence; request/sweep orphan ordering; killed-worker/fresh-process callback recovery with real workspace and broker observations.
- No new routes, callback credentials, fence mechanism, no-change/status-4 publication, final missing-path copy, UI or deployment work. Shared Office change remains open.

## No-change publication fixture

- Issue type: feature; fixture level: expanded, matching task 16.2 and publication of already-stored user content.
- Scope: nothing-new save completion, unpublished status-4 publication, their atomic obligations and the specified sequence updates.
- Governing invariant: no new content is needed to fulfill a publish intent, and a durable obligation cannot be separated from the save completion or final receipt that owns it.
- Selected risks: save/callback API, journal and receipt bindings, file overwrite, stale-command ordering, errors, compatibility, recovery integration and documentation.
- Evidence floor: real save-after-autosave route RED; all seven task cases; atomic commit and crash recovery for both entry points; metadata-only no-change controls; stale/final/closing guards; real HTTP and fresh-process recovery.
- Preserve content deduplication, contentless status-4 receipts, existing outcome/fence/recovery and authentication policies. Final missing-path handling, UI and deployment remain outside this slice.

## Unattended-close publication fixture

- Issue type: feature; fixture level: expanded, matching task 16.3.
- Scope: automatic final-callback save-as, missing-workspace failure and retained next-open conflict.
- Governing invariant: one durable final obligation yields one owned copy and one atomic document/session successor, or an explicit retained-content outcome; no original or foreign entry is overwritten.
- Selected risks: callback/status/list API, file IO, persisted identity, fencing and recovery ordering, resource bounds, compatibility, partial failures, packaging and documentation.
- Evidence floor: callback-route RED; deleted file, collisions, missing/unsafe parents and workspace root; status/list/create projections; claim and registration crash cuts with fresh-process recovery and duplicate conservation.
- Parent-symlink precedence follows the [user ruling](https://github.com/DankerMu/open-webui/issues/107#issuecomment-6017088624): final callbacks copy to the safe workspace root without a prior Files refresh. Ordinary saves and symlinked leaves retain their conflict policy.
- The [identity-handoff ruling](https://github.com/DankerMu/open-webui/issues/107#issuecomment-6027936626) includes coordination of pending publication with the Files entrypoint: recover before scanning under one continuous chat lock, so a crashed equal-content copy cannot be mistaken for a rename.
- No resolve route, upload-helper or broker index/rename/register primitive change, UI, dependencies, deployment or archive of this shared change.

## Conflict-resolution route fixture

- Issue type: feature; fixture level: expanded, matching task 17.1.
- Scope: guarded resolve admission, explicit save-as through the canonical copy transaction, fenced overwrite capture and atomic resolve outcomes.
- Governing invariant: resolution publishes the frozen latest user content, retains replaced workspace content, and durably settles exactly one bound obligation without losing either history.
- Selected risks: API/admission, file IO, version/journal schema, inherited authorization, concurrency/order, storage limits, sibling compatibility, partial failures, packaging and documentation.
- Evidence floor: real-route RED; all eleven issue criteria; overwrite followed by join/source, no-change save and final callback; real HTTP plus fresh-process recovery after acceptance, capture, replacement and copy claim.
- The [user ruling](https://github.com/DankerMu/open-webui/issues/107#issuecomment-6036933329) makes overwrite append the chosen user content as a `restore` version after workspace capture, preserving the shared latest-version rule.
- No versions/restore routes, new publisher, gateway, broker/upload primitives, UI, deployment or archive of this shared change.

## Office leave-guard fixture

- Issue type: feature; fixture level: expanded, agreeing with task 27.1 because it crosses upstream lifecycle hooks and shared asynchronous session state.
- Scope: one guard owner, paired behavioral tests, editor/controller integration and call-only Chat/ChatControls hooks; generated localization and owning documentation. Permanent browser additions belong to task 27.2.
- Governing invariant: a user's departure cannot silently discard the close command or attribute an unconfirmed save to success; every followed outcome remains bound to the captured owning chat and session.
- Selected risks: command/status API and schema, lifecycle/ordering, bounded resources, compatibility, partial failure, upstream ownership and evidence.
- Evidence floor: mounted semantic RED for a real departure; all eleven issue criteria; independent real-page proof of close arrival before frame retirement, existing browser regression suite, per-file coverage and scoped static/documentation gates.
- B1 input: the qualified last-close callback interval is 5.337–5.358 seconds, not a timeout guarantee. A 15-second UI progress budget accommodates that observation and polling/network margin; expiration means unconfirmed, not failure or success.
- No parent create/save/close HTTP API, protocol extension, broker/stub/browser-harness change, Plan 1 module change, persisted Office report or production deployment certification.
- User-authorized gate exception: only Chat.svelte may use an exact, documented line ceiling for the required minimal guard hooks. Constraints and scoped-lint enforcement change together with executable boundary tests; eslint, complexity, all other files and the global baseline remain enforced.
- User-authorized common-component seam: optional user-close admission for Drawer and, if needed, ResizableSidePanel. Disposal/layout replacement is not a user close; unconfigured callers retain their behavior. No appearance or unrelated common-component refactor.

## Office leave-browser fixture

- Issue type: test; fixture level: expanded, retaining task 27.2's suggested level for browser lifecycle and saved-content evidence.
- Scope: permanent B-T12/B-T13 cases in the existing Office spec and shared e2e helpers; owning documentation. Guard, components, stub, harness, discovery and prior cases remain unchanged.
- Governing invariant: user-visible close progress/outcomes, saved bytes and owner isolation must agree with the captured session's real gateway/stub observations.
- Selected risks: lifecycle/ordering, native browser interaction, session/file identity, reconciliation, oracle discrimination, diagnostics and compatibility.
- Evidence floor: named permanent cases under `make verify-ui-ocu`, all seven issue criteria, screenshots at each observed step, zero unexpected errors, original 31-case coverage preserved, controlled semantic negative qualification and restoration GREEN.
- Must preserve: actual user actions, original live editor until close acceptance, normal workspace reconciliation, explicit Edit after return, genuine response bodies and private authenticated arrival records.
- No production behavior change, fake success response, store mutation, dependency change, real DocumentServer certification or automatic archive of the shared change.

## Version-listing fixture

- Issue type: feature.
- Fixture level: expanded; agrees with the public persisted-state reader slice.
- Blast radius: history disclosure, published-content selection and epoch/session identity after accepted publication recovery.
- Selected risk packs: API, file IO, schema, inherited auth, concurrency, compatibility, partial failure, packaging and documentation.
- Evidence floor: seven listing acceptance criteria, no-DocumentServer/no-content-mutation reads, canonical epoch recovery and identity reselection; affected full-discovery units and actual HTTP/killed-worker evidence.
- Scope: task 17.2a only. Restore remains separate; the shared change stays open.
- Approved priority: epoch invalidation completes existing publication obligations before orphaning, even when that recovery changes files/history; the GET creates no new publication intent.

## History-restore fixture

- Issue type: feature.
- Fixture level: expanded; agrees with the restore slice's suggested level.
- Blast radius: workspace overwrite, immutable history, accepted journal recovery and reopen authority.
- Selected risk packs: API, file IO, schema, inherited auth, concurrency, resource limits, compatibility, partial failure, packaging and documentation.
- Evidence floor: ten restore criteria plus equal-latest forced append, pause-failure history retention and fresh-process capture/replace/register recovery; affected units and independent actual HTTP.
- Approved scope: minimally extend canonical publisher/versions and extract the unchanged reopen decision for create/restore, rather than introducing parallel implementations.
- Approved failure priority: pause failure leaves a new unpublished restore of stored content without workspace capture or mutation; successful capture and publication share one fence.
- Scope: task17.2b completes the restore half; gateway/UI/pruning/dependencies/deployment remain separate, and the shared change stays open.

## File cache-header fixture

- Issue type: bugfix; fixture level: expanded, overriding the suggested compact level because the shared file entrypoint must preserve generated-content isolation and error contracts.
- Blast radius: cache freshness of inline/download file bytes; no publisher, path-resolution, authorization or archive change.
- Selected risk packs: public API, inherited file IO/auth boundaries, legacy compatibility, errors and documentation.
- Evidence floor: all six criteria in the existing header module, all five active MIME types, same-size/same-mtime replacement with prior validators, unchanged archive/401/404; independent socket HTTP before/after proof.
- Scope: task18.1 only. Existing D22 owns the decision; no new configuration, state, dependency, gateway or UI behavior.

## Office host-shell fixture

- Issue type: feature; fixture level: expanded, agreeing with the new framed trusted-origin entrypoint and its external-origin CSP boundary.
- Blast radius: script/frame authority, secret-free page configuration, idle request/message isolation and existing preview modes.
- Selected risk packs: API, existing configuration, auth/secrets, lifecycle ordering, compatibility, errors, browser dependency compatibility and documentation.
- Evidence floor: eight shell criteria, all three public prefixes, nonce uniqueness/binding, disabled-state compatibility, actual Chromium allow/deny origin canaries, cross-protocol silence and the unchanged full preview browser harness.
- Scope: tasks19.1/19.2 only. The shell intentionally performs no Office protocol, session creation, editor API load, polling or save/close work; those are separate tasks, not substitutes for this slice's complete shell/policy behavior.
- D7 compatibility interpretation: without the enabling server-to-server address, `embed=office` retains the existing visible invalid-preview behavior and emits no Office origin/policy. No new switch or preview-wide404 is introduced.

## Office host-protocol fixture

- Issue type: feature; fixture level: expanded, matching the cross-frame protocol and broker-session consumer.
- Blast radius: parent message authority, one-open ownership, signed editor configuration, truthful state and failure reporting.
- Selected risk packs: API, auth/secrets, asynchronous ordering, state transitions, legacy compatibility, error handling, browser dependency compatibility and documentation.
- Evidence floor: all eight task20.1 criteria; actual production module plus canonical request wrapper; real browser message delivery, HTTP requests, configured API script and visible error surfaces.
- Scope: task20.1 only. Task20.2 owns save/close execution, recurring polling, auto-save and full teardown; no backend, gateway, parent UI or CSP changes.
- Initial snapshot: one status GET after successful creation supplies fields absent from the create response, including conflict reason and publication sequences. It is not a polling loop.
- Failure classification: named broker admission refusals are final refused; creation transport/server failures and initial-status/API/editor failures are error, never a cap refusal or successful save.
- Compatibility: valid Office gains ready/listener behavior; invalid/disabled/top-level silence, Files/runtime behavior, secret exclusion and existing policy proofs remain.
