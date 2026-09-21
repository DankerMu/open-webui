# Tasks

Prefixes: `[webui]` = this repo; `[ocu]` = sibling checkout `open-computer-use` (branch `codex/plan1-<slug>` off `main` at `7318b2e`; tests in the OCU repo root `tests/`); `[deploy]` = OCU repo `deploy/` overlay. Every production file ships with its test file in the same task (AGENTS.md § TDD). The D19 proposed decision record (`docs/decisions/proposed/architecture/2026-09-20-ocu-path-grant-for-opaque-documents.md`) ships with this change's own pipeline commit under `make decisions-verify`, not with an implementation PR; 2.3 covers the D1/D2 records only. Numbering follows dependency order; groups map to Plan 1 work packages A1 → A2 → A3 → A4 → A5. Fixture-level vocabulary: `.claude/skills/subagent-workflow/references/issue-risk-contract.md`.

## 1. [webui] Authorization endpoint and chat_id guard (spec: ocu-workspace-authorization)

- [ ] 1.1 Add `backend/open_webui/routers/ocu_workspaces.py` with `GET /api/v1/ocu/auth` (always registered): session via `get_verified_user`, chat id from `X-Chat-Id`, fork-side predicate `is_saved_chat_id(chat_id) and chat_id != "default"` (design D10, upstream helper untouched), `Chats.is_chat_owner`; 200 + `X-User-Id`/`X-User-Email`, 401, 403 only (403 also when `ENABLE_OCU_WORKSPACE` is false); empty body; no OCU call. Add `ENABLE_OCU_WORKSPACE` and `OCU_INTERNAL_TOKEN`/`OCU_INTERNAL_URL` to `env.py`; one `include_router` line in `main.py`; set `ENABLE_OCU_WORKSPACE=true` in `scripts/dev-bg.sh`.
- [ ] 1.2 `backend/open_webui/test/routers/test_ocu_auth.py` (TestClient): owner 200 with headers; anonymous 401; shared chat / folder grant / admin / non-existent / temporary:/local:/channel:/""/default → 403 with `is_chat_owner` called zero times for the invalid ids; flag off → 403; body empty; no OCU client call.
- [ ] 1.3 `smoke/api.hurl` rows for `/api/v1/ocu/auth` (owner 200, anonymous 401) and the matching AGENTS.md Verification Matrix row — same PR, since the route now exists.

Suggested fixture level: expanded - auth/permissions on a shared entrypoint; 401/403/404 matrix is a Critical Path.
Minimal mergeable slice: 1.1 + 1.2 (auth endpoint, env flags, predicate, tests) - green alone because the endpoint has no callers yet and the workspace routes do not exist; 1.3 follows.

## 2. [webui] Per-chat state model, migration and decision records (spec: ocu-workspace-authorization)

- [ ] 2.1 Add `backend/open_webui/models/ocu_chat_state.py` (`OcuChatState` table: `chat_id` PK, `last_seen_revision`, `prefs` JSON, `updated_at`; no FK — design D14; accessor `OcuChatStates`: get, upsert prefs, advance cursor) and one additive Alembic migration `add_ocu_chat_state`.
- [ ] 2.2 `backend/open_webui/test/models/test_ocu_chat_state.py`: upsert/get round trip; cursor only advances; `make db-verify` up → down → up passes.
- [ ] 2.3 Decision records in `docs/decisions/implemented/` for D1 (`ocu_chat_state` table, migration conditionally named in Plan 1 A1) and D2 (cross-repo home), in the same PR as the migration (AGENTS.md § Decision records); `make decisions-verify` passes.

Suggested fixture level: expanded - schema/migration and persisted state.
Minimal mergeable slice: atomic - the model module, its migration and their decision record cannot be split without an orphan migration, an untestable model, or a PR that violates the same-PR decision-record rule.

## 3. [webui] Workspace describe / launch / refresh / prefs routes (spec: ocu-workspace-authorization)

- [ ] 3.1 Add `backend/open_webui/utils/ocu_client.py` (base URL + internal token from env; `describe` → `GET /internal/describe/{chat_id}`, `launch` → `POST /internal/launch/{chat_id}`, `refresh` → `GET /api/outputs/{chat_id}`; connection errors and timeouts mapped to a typed `OcuUnreachable`; token never logged) with unit tests using a stubbed transport.
- [ ] 3.2 Add `GET /workspaces/{chat_id}`, `POST /launch`, `POST /refresh`, `PUT /prefs` to `routers/ocu_workspaces.py`, registered only when `ENABLE_OCU_WORKSPACE` is true: owner-only 404 semantics; describe composes `status`/`reason` from the internal describe (D7 mapping; `unavailable` / `ocu_unreachable` with `views: []` on `OcuUnreachable`), `revision` (broker value, cursor advanced, also for a stopped container; cursor only on `OcuUnreachable` — D11), `capabilities` (`launch` iff stopped, `refresh` iff OCU answered, `prefs` always), `base_url`, `cli_badge`, no file list; launch maps OCU `never_created` to 409; refresh calls the outputs listing, returns its `revision` and advances the cursor, token-bucket rate limit (429 + `Retry-After`); prefs whitelist `{view, selected_file_id, open}` ≤ 2 KiB, 422 otherwise; launch/refresh/prefs require `X-Requested-With: ocu-workspace` after authentication and before the owner check (403 without it — D4). Update CONTEXT.md in the same PR: the Public Interfaces row lists the five routes and adopts the 401/403/404/409/422 matrix (D7 deviation), and the § Core Invariants credential line adopts the D13 wording (the OCU-side lifecycle change, group 8, lands in the same milestone; CONTEXT.md lives in this repo).
- [ ] 3.3 `test_ocu_workspaces.py` (TestClient + stub client): describe never calls launch; stopped/paused → `stopped` with `capabilities` containing `launch`; running → no `launch` capability; unreachable → `capabilities == ["prefs"]`; `OcuUnreachable` → 200 `unavailable`/`ocu_unreachable` with the cursor; launch/refresh/prefs with a session but without `X-Requested-With` → 403 with `is_chat_owner` and the client uncalled; the same without a session → 401; flag off → 404 for all four; launch 409 on never_created; refresh burst 3/5 → 429; cursor 5 vs broker 7 with the container stopped → returns 7 and stores 7; prefs owner 200 / non-owner 404 / anonymous 401 / unknown key 422 / oversize 422; branch or clone has no state; deleted chat → 404.
- [ ] 3.4 `smoke/api.hurl` rows: describe for the seed admin's own chat (200) and for a foreign chat id (404).

Suggested fixture level: expanded - public API, persisted state, rate limiting.
Minimal mergeable slice: 3.1 (internal client + tests) - green alone: pure module with stubbed transport, no route wiring; 3.2–3.4 follow.

## 4. [ocu] Internal token, chat_id fail-closed, source subnet, CORS, MCP header trust (spec: ocu-access-gateway)

- [ ] 4.1 Add `computer-use-server/auth_guard.py`: startup check that exits non-zero when `OCU_INTERNAL_TOKEN` is unset; FastAPI dependency requiring the token on every chat-bound endpoint (Plan 1 § 2 allowlist entries, upload, terminal, CDP/ttyd handshakes, and the identity endpoints `/system-prompt`, `/skill-list`, `/skill-mounts` which now accept `user_email` only with the token — design D12); rejects chat_id ∈ {"", "default"} and `temporary:`/`local:`/`channel:` prefixes; rejects source addresses in the configured sandbox subnet; `allow_origins=["*"]` replaced by the configured WebUI origin. In `mcp_tools.py`, `X-Chat-Id`/`X-User-Email` are trusted only when the internal token is present.
- [ ] 4.2 `tests/test_auth_guard.py`: startup without token exits; missing token 401; bad chat ids 4xx before handler; sandbox-subnet source 403; CORS header absent for foreign origin; `/mcp` headers ignored without token; identity endpoints reject `user_email` without token.

Suggested fixture level: expanded - auth on a shared entrypoint across many routes.
Minimal mergeable slice: atomic - the guard is fail-closed from the first commit (no dev bypass, AGENTS.md "misconfiguration fails loud"), so the dependency, the startup check and every wiring site must land together with their tests; a partially wired guard is a false "auth landed" signal.

## 5. [ocu] Server-side callers carry the token (spec: ocu-access-gateway)

- [ ] 5.1 `openwebui/tools/computer_use_tools.py`: `Valves.ORCHESTRATOR_URL` + upload path send the token; `X-User-Email` from `__user__` only; stop coercing empty chat_id to `"default"` (raise a tool error instead).
- [ ] 5.2 `openwebui/functions/computer_link_filter.py`: `/system-prompt` fetch carries the token; `PUBLIC_BASE_URL` documented as the proxied `/ocu` base and validated at startup to end without a trailing slash.
- [ ] 5.3 `tests/test_filter.py` and a tools test: token present on every OCU call; empty chat_id → tool error; filter link base equals `PUBLIC_BASE_URL`; system prompt fetch succeeds with token and fails without.

Suggested fixture level: compact - isolated callers changing request headers; the guard (group 4) is the shared entrypoint.
Minimal mergeable slice: 5.1 + its test - green alone because the tool path is independent of the filter; 5.2–5.3 follow.

## 6. [ocu] Generated-content headers mirror (spec: ocu-access-gateway)

- [ ] 6.1 In `app.py` `/files/{chat_id}/{filename}`: for HTML/SVG/XHTML/XML non-download responses set `Content-Security-Policy: sandbox allow-scripts allow-forms` and `X-Content-Type-Options: nosniff`, strip other CSP; keep `?download=1` as attachment.
- [ ] 6.2 `tests/test_files_headers.py`: header matrix by content type and download flag.

Suggested fixture level: compact - one response path, no shared state; the proxy is the primary control.
Minimal mergeable slice: atomic - a two-line header change and its test.

## 7. [ocu] Public prefix and SPA fetch wrapper (specs: ocu-access-gateway, outputs-reconciliation)

- [ ] 7.1 `OCU_PUBLIC_PREFIX` env (default `""`): `_generate_preview_html` emits every URL (stylesheets, scripts, `apiUrl`, `filesBase`, inline heartbeat) under the prefix, plus `describeUrl` = `/api/v1/ocu/workspaces/{chat_id}` (WebUI's same-origin describe route, emitted by the shell so the SPA never constructs a WebUI address); static mount at `{prefix}/static/`; `browser-viewer.js` address adaptation.
- [ ] 7.2 `static/preview.js` and `static/browser-viewer.js`: ES module specifiers become relative (`./x.js`), and `loadScript`, `pdfjsLib.GlobalWorkerOptions.workerSrc` and the PDF `viewerUrl` derive their base from `import.meta.url`, so no root-absolute `/static/` literal remains (D15); the CLI badge is read from the shell-emitted `describeUrl` (used verbatim like `apiUrl`, so the wrapper never prefixes it; `cli_badge` field) and the direct `fetch('/api/runtime/cli')` is deleted; the XLSX view marks cells that have a formula but no cached value as uncomputed instead of rendering them blank (A-T03); one fetch wrapper adding `X-Requested-With: ocu-workspace` to every request and the prefix only to client-constructed root-absolute paths (idempotent: no-op when the path already starts with the prefix; server-emitted `apiUrl`/`filesBase`/entry `url` used verbatim), used by every request (upload, start/stop-ttyd, restart/resurrect → launch alias, kill, sessions/processes, heartbeat); change detection keyed on `path + revision` stamp instead of `f.modified`; the `__stopped__` / `__meta_exists__` branches both call the launch alias; DOCX/XLSX/PPTX views show a visible "内容预览" label (pagination/layout may differ from Office).
- [ ] 7.3 `tests/test_preview_prefix.py` (server: emitted URLs with and without prefix; no `static/*.js` file contains a root-absolute `/static/` literal) and JS unit tests for the wrapper (client path gets the prefix once; server-emitted `/ocu/files/…` and `apiUrl` unchanged; never `/ocu/ocu/`), the change detector, the badge source (no request to `/api/runtime/cli`; the badge request URL is exactly the emitted `describeUrl` `/api/v1/ocu/workspaces/{chat_id}`, never `/ocu/api/v1/…`; `cli_badge` taken from the describe payload) and the XLSX uncomputed-formula marker on a deterministic fixture; manual fixture screenshots for A-T02/A-T03/A-T04 refresh behaviour.

Suggested fixture level: expanded - shared entrypoint of the SPA and every URL it emits.
Minimal mergeable slice: 7.1 + its server test - green alone because with the default empty prefix every baseline-emitted URL is unchanged (`describeUrl` is an added field); 7.2–7.3 follow.

## 8. [ocu] Per-chat lock, stop semantics, launch matrix, credential scope (spec: sandbox-lifecycle)

- [ ] 8.1 `docker_manager.py`: `get_chat_lock(chat_id)` registry (one `threading.Lock` per chat behind a module lock); `_get_or_create_container` returns running or creates for never-created (no container, no meta), raises `SandboxStopped` for every other state and for absent-with-meta (the `exited` start and the `else: container.start()` branches removed; the `NotFound` branch creates only when no `.meta.json` exists); internal `POST /internal/launch/{chat_id}` implementing the D7 matrix (running no-op; non-running start/unpause; absent+meta recreate with server-side secret fallbacks; absent no meta → 409 `never_created`); `restart-container` and `resurrect-container` become aliases of launch (409 "already exists" removed); tool wrappers and MCP surface `SandboxStopped` as a tool error; self-kill timer reset before pause; token-protected `GET /internal/describe/{chat_id}` returning `{state, revision, views, cli_badge}` from Docker state + meta presence under the lock (never starting anything; `revision` from the broker index of group 9, 0 until it exists).
- [ ] 8.2 Sandbox environment composition: `_create_container` reads request-scoped credentials under the chat lock; `OCU_INTERNAL_TOKEN` and `MCP_API_KEY` are never placed in `extra_env`; `NO_AUTOSTART=1` is added to `extra_env` when `OCU_SANDBOX_NO_AUTOSTART=1` is set (the image's `.bashrc` honours it; no image patch). The matching CONTEXT.md § Core Invariants wording (D13) is adopted by task 3.2 in this repo.
- [ ] 8.3 `tests/test_lifecycle.py`: concurrent first use creates one container; lock identity stable; `view`/`bash`/MCP after stop → error, container still stopped; paused/created → `SandboxStopped`; absent container with surviving meta → `SandboxStopped`, nothing created; launch matrix (4 rows); restart/resurrect alias == launch and refused without token; concurrent creation keeps credentials per chat; proxy token absent from env; `NO_AUTOSTART=1` present in env only when the OCU variable is set; internal describe: running-without-ttyd → `running`, paused → `stopped`, absent+meta → `stopped`, nothing → `never_created`, nothing created; pause/resume keeps container alive past idle timeout.

Suggested fixture level: expanded - concurrency and lifecycle of shared state.
Minimal mergeable slice: atomic - removing the implicit start paths and adding launch (with its aliases) must land together: removing get-or-start while `restart-container` still starts containers on its own leaves an unguarded start path, and adding launch without removing them adds a third; the lock registry is what makes both halves safe.

## 9. [ocu] Outputs identity and revision (spec: outputs-reconciliation)

- [ ] 9.1 Add `computer-use-server/outputs_broker.py`: per-chat index (`path → file_id`, `(size, sha256) → file_id`), tombstones, rename detection on equal-size delete+create pairs only, one persisted monotonic per-chat counter with per-entry `revision` stamps (D11), listing limits/pagination, unchanged short-circuit; index under `BASE_DATA_DIR/{chat_id}/.ocu/index.json`; writes under the per-chat lock from group 8.
- [ ] 9.2 `/api/outputs/{chat_id}` returns the new metadata fields and the listing counter; every entry's `url` is emitted with `OCU_PUBLIC_PREFIX` (the SPA uses it directly as element `src`); `?cursor=`/`If-None-Match` support; `modified` kept for one release for SPA compatibility; test asserts `url` starts with the prefix.
- [ ] 9.3 `tests/test_outputs_broker.py`: rename keeps id; path reuse new id; size change with `touch -r` still bumps; per-file stamps (a.html changes, b.html keeps); 5 000 unchanged files hash nothing; pagination; counter monotonic across restarts.

Suggested fixture level: expanded - file IO, path safety and persisted index.
Minimal mergeable slice: 9.1 + 9.3 (broker module and tests, not yet wired to the endpoint) - green alone as a pure module; 9.2 follows.

## 10. [ocu] Change notification from `_run_tool` (spec: outputs-reconciliation)

- [ ] 10.1 In `computer_use_tools.py:_run_tool`, after completion emit `ocu:workspace_changed {chat_id, reason}` through the server-side event path when an emitter exists; no-op when `event_emitter` is None; never include revision.
- [ ] 10.2 Tests: emitted once per tool completion; no emission and no error when emitter is None; payload shape.

Suggested fixture level: compact - one emit call on an existing hook; the reconcile path does not depend on it.
Minimal mergeable slice: atomic - a single emit and its test.

## 11. [ocu] WebSocket revocation re-check (spec: ocu-access-gateway)

- [ ] 11.1 In the CDP and ttyd WebSocket proxy loops: capture the session cookie at handshake; every 30 s call WebUI `GET /api/v1/ocu/auth` (internal token, `X-Chat-Id`); close with 4401 on any non-200 (design D18). WebUI auth URL from env.
- [ ] 11.2 `tests/test_ws_recheck.py` with a mocked clock and auth endpoint: healthy session never closes; auth answering 403 (user deleted / ownership lost) or 401 (JWT expired) closes within 60 s; no input forwarded after close. Logout is not a signal (D18): no test claims it.

Suggested fixture level: expanded - auth on a long-lived shared connection.
Minimal mergeable slice: atomic - the re-check loop and its close action are one behaviour; a loop that checks but does not close proves nothing.

## 12. [ocu] Compose-network detach on every path (spec: sandbox-network-isolation)

- [ ] 12.1 Remove `_get_compose_network_name` and all call sites: `_create_container` attach, `_fix_dead_networks` re-attach, the `restart-container` endpoint's inline copy (now the launch alias from group 8), and the unused import in `mcp_tools.py`; `get_container_service_address` resolves CDP/ttyd via the sandbox bridge gateway and published port.
- [ ] 12.2 `tests/test_network_membership.py`: created sandbox has exactly one network; after stop → launch, restart alias and recreate-from-meta it still has exactly one; address resolution returns the gateway address.

Suggested fixture level: expanded - network policy on shared lifecycle code.
Minimal mergeable slice: atomic - deleting the helper without its call sites breaks imports; deleting call sites without the address-resolution change breaks CDP/ttyd reachability; one PR.

## 13. [deploy]+[webui] Reverse proxy config, OCU stub and proxy smoke (specs: ocu-access-gateway, lan-deployment-overlay)

- [ ] 13.1 `[deploy]` Proxy config (nginx or Caddy) in `deploy/`: table-driven allowlist include (chat-bound rows + `/ocu/static/`; identity endpoints and `/api/runtime/cli` absent; `mutating` flag on heartbeat/sessions/processes), `auth_request` to `/api/v1/ocu/auth` with per-route `X-Chat-Id` (session-only `auth_request` for static rows), `error_page 403 =404`, `auth_request_set` → `X-User-Id`/`X-User-Email`, internal token header, WebSocket upgrade for CDP/ttyd, Origin/`Sec-Fetch-Site`/`X-Requested-With` checks on non-GET and on `mutating` rows, forced CSP + nosniff on file responses by content type, client identity headers overwritten.
- [ ] 13.2 `[webui]` deterministic OCU stub `scripts/ocu-stub.py` (fixed responses for `/api/outputs`, `/files/{chat_id}/*` with HTML/SVG/XML/binary fixtures, `/preview`, `/terminal/*/heartbeat`, static assets under the prefix, and `/internal/describe/{chat_id}` + `/internal/launch/{chat_id}` with per-chat fixture states `running` / `stopped` / `never_created` where launch flips stopped → running; echoes received headers for assertions) and `scripts/proxy-dev.sh` that starts the overlay proxy config from `$OCU_CHECKOUT/deploy/proxy/` (`OCU_CHECKOUT` defaults to the sibling `../open-computer-use`) against the harness + stub and exits non-zero naming any missing prerequisite, including the config path when the checkout or the 13.1 config is absent.
- [ ] 13.3 `[webui]` `smoke/proxy/*.hurl` + `make smoke-proxy` (separate target; not in the `smoke/*.hurl` glob): unlisted paths 404, identity endpoints 404, foreign chat 404, anonymous 401, static asset needs session, CSP/nosniff on HTML/SVG, `Origin: null` POST 403, no-cors GET heartbeat 403, client `X-User-Email` overwritten, prefix URLs in the preview shell, cookie-less GET of a relative sub-resource under `/ocu/files/…` → 401 (D19 limitation), `?download=1` served as attachment, no response header or body on any row contains the internal token (A-T09). AGENTS.md Verification Matrix row added. CI `layer3-integration-tests` gains a step that checks out `DankerMu/open-computer-use` (public, no secret) at the SHA pinned in this repo's `constraints.yaml` (`ocu_checkout.sha`, set by this PR to the commit carrying 13.1) into `.run/open-computer-use` (inside `$GITHUB_WORKSPACE`, the gitignored runtime dir; `actions/checkout` refuses paths outside the workspace) and runs `make smoke-proxy` with `OCU_CHECKOUT=.run/open-computer-use`; the CI file change is flagged in the PR (AGENTS.md § Agent Operating Rules).

Suggested fixture level: expanded - production auth wiring.
Minimal mergeable slice: 13.2 (stub + dev script, `[webui]`) - green alone as harness tooling with its own smoke of the stub; 13.1 + 13.3 follow together (config without its smoke is unverifiable).

## 14. [deploy] Sandbox bridge, firewall, port matrix, retention (specs: sandbox-network-isolation, lan-deployment-overlay)

- [ ] 14.1 Compose: dedicated sandbox bridge (not internal), orchestrator not on it, CDP/ttyd published on the gateway only; port matrix publishes only the proxy (remove the `127.0.0.1:${PORT}` publications for OCU and WebUI); `deploy/check-ports.sh` fails when any other service publishes a port.
- [ ] 14.2 `deploy/firewall/docker-user-rules.sh` (idempotent `DOCKER-USER` DROP rules for sandbox subnet → control-plane subnet, Docker socket host address, metadata address) and `deploy/firewall/check.sh` that fails when rules are missing; both hooked into the deploy script.
- [ ] 14.3 Retention guard: stop only, keep volume/dirs, stale "restart on MCP" comment in `retention/stop-overage.sh` removed; `OCU_INTERNAL_TOKEN`, `OCU_PUBLIC_PREFIX=/ocu`, `OCU_SANDBOX_NO_AUTOSTART=1`, `PUBLIC_BASE_URL` and the WebUI auth URL provisioned in the overlay env; `deploy/production-like-test/patches/disable-cli-autostart.patch` deleted.
- [ ] 14.4 Overlay smoke script: `docker compose ps` port assertion, direct probe of OCU's former port refused, `curl` from inside a sandbox to control-plane addresses times out, egress to an allowlisted address succeeds, a new terminal session's foreground process is `bash` with no coding CLI auto-started (terminal default configured in the overlay).

Suggested fixture level: expanded - production config and network policy.
Minimal mergeable slice: 14.1 + its port check - green alone because the port matrix and its check are observable with `docker compose config`/`ps` without firewall rules; 14.2–14.4 follow, 14.2 independent of 14.3.

## 15. [webui] Chat-keyed store and API client (spec: workspace-sidebar)

- [ ] 15.1 Add `src/lib/stores/ocu.ts` (chat-keyed map: status, revision, dirty, selected view/file, generation counter; helpers to discard late responses) and `src/lib/apis/ocu/index.ts` (describe, launch, refresh, prefs; every call sends `X-Requested-With: ocu-workspace`).
- [ ] 15.2 Vitest: every client call carries `X-Requested-With: ocu-workspace`; late response with older generation is dropped; dirty flag per chat; out-of-order revisions keep the highest; store never touches `artifactContents`.

Suggested fixture level: compact - new isolated modules, no upstream edits.
Minimal mergeable slice: atomic - store and client are one unit with one test file.

## 16. [webui] WorkspaceArtifact component and ChatControls hooks (spec: workspace-sidebar)

- [ ] 16.1 Add `src/lib/components/chat/WorkspaceArtifact.svelte`: state machine (unavailable/loading/ready/empty/error + stopped/disconnected), Files/Browser/Terminal tabs, trusted SPA iframe with fixed `sandbox="allow-scripts allow-same-origin allow-forms"` and dedicated CSP, generated-content iframe with `sandbox="allow-scripts allow-forms"`, pagination "more", per-file error + download fallback, Launch/Retry/Reconnect actions; `base_url` from describe; file list from the proxied outputs listing; when the selected file is tombstoned, fall back to the list with a notice and clear `prefs.selected_file_id`.
- [ ] 16.2 Hook into `ChatControls.svelte` at the panel branch, `closeHandler` and `specialPanel` sites; workspace button (visible whenever the flag is on in a saveable chat, including one not yet persisted; absent when `$temporaryChatEnabled` or `isTemporaryChatId(chatId)`; activating it in an unsaved chat first persists it through the upstream save path, then calls describe); change indicator; auto-open once per chat, never reopen after user close; `Artifacts.svelte` coexistence only.
- [ ] 16.3 `e2e/ocu-workspace.e2e.ts` (Playwright, stub + proxy from group 13): A-T01 three open paths → opaque origin, no token/localStorage access, JS runs, inline CSS and data-URI image render, a relative `style.css` request gets 401 and the page still renders (D19 limitation); user `iframeSandboxAllowSameOrigin=true` does not widen; A-T07 A/B switch with delayed response, 20 open/close cycles leave no sockets; A-T10 empty/oversized/corrupt/unreachable states and selected file deleted; A-T12 unsaved chat persisted before first request and no button in a temporary chat; A-T15 stopped state + Launch (stub state flips); A-T02 Office view shows the "内容预览" label; A-T13 baseline smoke still green. (A-T05 terminal/browser interaction and A-T09 socket close need a real OCU with ttyd/CDP, which the stub does not provide: A-T05 runs in 19.1 on the deployed overlay, A-T09 is the 11.2 unit test + the 19.1 real run.)

Suggested fixture level: expanded - user-visible flow, iframe security attributes, upstream spine hooks.
Minimal mergeable slice: 16.1 rendered behind the flag with the Files tab only and its e2e cases (A-T01, A-T10) - green alone because the component is mounted only when the flag is on and the hooks in 16.2 are three lines; 16.2 Browser/Terminal + 16.3 remaining cases follow.

## 17. [webui] Event handler, history restore, preview links (specs: outputs-reconciliation, workspace-sidebar)

- [ ] 17.1 `Chat.svelte`: handle `ocu:workspace_changed` beside `chat:reload`, before the `history.messages[event.message_id]` gate; handler only sets the chat-keyed dirty flag; polling 3 s/15 s reconcile keyed on `path + revision`; on chat open restore binding/status/view from describe, then the file list from the outputs listing (no event replay, no outlet).
- [ ] 17.2 Message-link recognition in source: a pure recogniser in the new module `src/lib/utils/ocu-links.ts`, applied by one delegated click handler on the messages container in `Chat.svelte` (message rendering components are not modified); only links matching the configured `/ocu/` base (`PUBLIC_BASE_URL`) and the current chat_id open the sidebar on that file; others behave as plain links.
- [ ] 17.3 `src/lib/utils/ocu-links.test.ts` (foreign host, other chat_id, matching filter-generated link) and Playwright cases A-T06 (restart + history restore, no container created), A-T11 (no-link tool output appears via dirty flag; emitter-None path appears via polling).

Suggested fixture level: expanded - upstream spine edit (`Chat.svelte`) and user-visible flow.
Minimal mergeable slice: the 17.2 recogniser module + its Vitest (without the click handler) - green alone as a pure function; the click handler, 17.1 and 17.3 follow.

## 18. [deploy] Pinned build, offline materials, backup and rollback (spec: lan-deployment-overlay)

- [ ] 18.1 Image build from this fork with digest pinning; offline bundle for Pyodide/npm/Python; runtime env disabling CDNs, model downloads, update checks; build record (git SHA, args, asset versions).
- [ ] 18.2 Backup script covering DB (incl. `ocu_chat_state`, pruning rows whose chat no longer exists), per-chat directories and config as one set; restore + one-version image rollback procedure; rollback checklist includes the port-matrix check; document that the direct OCU entry is not a rollback path.
- [ ] 18.3 A-T14 air-gapped run and A-T15 restore/rollback executed and recorded (screenshots + command output).

Suggested fixture level: expanded - production config and rollback.
Minimal mergeable slice: 18.1 - green alone: the build pipeline is verifiable by building; 18.2–18.3 follow.

## 19. [webui] Acceptance matrix run and evidence (all specs)

- [ ] 19.1 Run A-T01–A-T15 with deterministic fixtures, then one real-model pass; collect screenshots from a normal user's browser under `.run/ui-evidence/`; A-T09 evidence includes a grep for the internal token over the chat transcript, the browser's `Referer` headers and the proxy/OCU default-level logs; record capacity observation for the LAN host.
- [ ] 19.2 Final docs sync: AGENTS.md Verification Matrix Pending row replaced, `CONTEXT.md` open terminology row for launch/start/resurrect closed (launch is the single WebUI route; the proxied restart/resurrect rows are aliases of the same internal launch, not a retired path).

Suggested fixture level: none - evidence collection and docs; no runtime behaviour change.
Minimal mergeable slice: atomic - a single evidence/docs PR.
