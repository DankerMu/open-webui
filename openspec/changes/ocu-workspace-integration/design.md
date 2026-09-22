# Design

## Context

Plan 1 (`docs/plans/2026-09-20-workspace-artifact-integration.md`) was verified against source on 2026-09-20 (OCU `7318b2e`, WebUI tag `v0.11.3` / `2a960a5`) and already fixes the topology, the authorization predicate, the network model, the lock type and the content-isolation headers. This design records the decisions Plan 1 leaves to implementation, the alternatives rejected, and the seams tests will exercise. It does not restate Plan 1; line references in Plan 1 § 固定源码与已有证据 are the oracle for "current behaviour". Plan 1 was amended four times on 2026-09-20 with the user's approval: A-T01 and § 2 "静态相对资源" (D19), A-T09 (D18), and the baseline table row for this repo (branch `codex/ocu-workspace-integration` → fork `DankerMu/open-webui` branch `main`, a repository fact after that branch was deleted at the user's request).

Constraints that shape everything below:

- Fork must stay rebase-able (AGENTS.md § Module Boundaries): new behaviour on seams, upstream spine touched with minimal diffs.
- Trust model is LAN / trusted employees (Plan 1 § 信任模型): no anti-insider mechanisms, but prompt-injection, cross-chat leakage and credential placement are correctness floors.
- Governance: no human code review; Critical Paths need mechanical evidence + reviewer cross-review (AGENTS.md § Critical Paths).
- CONTEXT.md invariants are binding: chat_id is the only workspace key; `Chats.is_chat_owner` is the only predicate; stopped sandboxes restart only via explicit `launch`; `revision` is the only version authority. D13 records one deviation from CONTEXT.md § Core Invariants (credentials in sandboxes) that the CONTEXT.md text adopts in the WebUI-side routes PR (task 3.2), in the same milestone as the OCU lifecycle work — CONTEXT.md lives in this repo, the lifecycle code in the OCU repo.

Terminology: OCU workspace files are 产物 / outputs (`openspec/glossary.md`); "Artifact" is reserved for WebUI's native `Artifacts.svelte` panel. `WorkspaceArtifact.svelte` keeps the file name Plan 1 § 3 assigns.

## Goals / Non-Goals

**Goals:**

- Every chat owner can open a Files/Browser/Terminal sidebar for that chat's sandbox from inside Open WebUI, with new outputs appearing without a model round-trip, edits refreshing in place, and history chats restoring their workspace after a restart.
- Every browser→OCU request is authenticated by the WebUI session and authorized by chat ownership before it reaches OCU; every non-listed OCU path is 404 from the browser.
- Model-generated HTML/SVG never executes with the WebUI origin, whichever way it is opened (sidebar iframe, top-level link, typed URL).
- A sandbox cannot reach the OCU/WebUI control plane at L3, including after stop → launch or restart.
- A stopped sandbox is restarted only by an authorized explicit action.
- Native WebUI Artifacts, RAG and ordinary chat are unaffected (A-T13).

**Non-Goals:**

- Anti-insider mechanisms: single-use tickets, nonce replay protection, a separate workspace domain, penetration-style cross-user testing (Plan 1 § 信任模型 "不做"). Cross-user cases are authorization-denial smoke only.
- Manual Office editing, save, versioning, publish/fence UX — Plan 2.
- Embedding a proxy inside the WebUI process; WebUI adds only the auth endpoint and the describe/launch/refresh/prefs routes (D4).
- A `workspace_id` or any second workspace identifier.
- Browser access to `/system-prompt`, `/skill-list`, `/skill-mounts`, `/api/runtime/cli`, `/mcp`, `/mcp-info`, `/health`, `/api/skill-stats` (D12).
- Restoring the historical minified-JS patch pipeline (`fix_preview_url_detection.py`, `fix_artifacts_auto_show.py`); behaviour is reimplemented in source.
- Bypassing OCU structure tests by restoring deleted directories.
- Removing the residual risks Plan 1 accepts on record: shared server-side `MCP_API_KEY`; admin reaching another user's chat context through WebUI's own completion path (workspace surface still 404s).
- Moving model/sub-agent credentials out of sandboxes (D13 scopes them instead).
- Relative sub-resources (CSS, images, fonts, scripts, `fetch`) referenced by opaque-origin generated documents; documents render what they inline (D19, follow-up issue).
- Revoking already-open WebSockets on logout without Redis-backed token revocation (D18).
- Cascading chat deletion into `ocu_chat_state` through upstream `models/chats.py` (D14).
- Capacity engineering for 20 concurrent sandboxes; capacity is measured, not designed here.
- Any change to upstream Open WebUI REST/socket contracts.

## Decisions

### D1. Per-chat state lives in a new table `ocu_chat_state`, not in `chat.meta` and not client-only

Plan 1 § 1 offers `chat.meta` or a small table, and work package A1 says "含迁移，若采用新表". Chosen: the table, which resolves that condition; the migration is therefore the one Plan 1 names conditionally. Table: `ocu_chat_state(chat_id TEXT PK, last_seen_revision INTEGER NOT NULL DEFAULT 0, prefs JSON NOT NULL DEFAULT '{}', updated_at BIGINT NOT NULL)` in a new model module `backend/open_webui/models/ocu_chat_state.py` and one additive Alembic migration `add_ocu_chat_state`. No foreign-key constraint (see D14). The decision records for D1 and D2 ship in the same PR as the migration (AGENTS.md § Decision records), not at the end.

- Rejected `chat.meta`: upstream rewrites `meta` wholesale on tag/pin/folder updates (`models/chats.py` `update_chat_*` helpers), so fork fields would race with upstream writes and every fork write would touch an upstream write path.
- Rejected client-only (localStorage): loses cross-device consistency and gives history restore no server truth for the last-seen revision; Plan 1 § 3 requires restore "从后端描述恢复".
- Cost accepted: one migration on the AGENTS.md migration Critical Path (`make db-verify` + plan reference). Rollback keeps the table; the feature flag (D9) hides the UI without dropping data.

### D2. Cross-repo home: one change, one epic, task prefixes

Plan 1's A1 and A4 modify the OCU server and its deploy overlay in the sibling checkout `/Users/danker/Documents/31308/open-computer-use` (fork `DankerMu/open-computer-use`). This change and its epic live in `DankerMu/open-webui` because A-T08 (authorization matrix through proxy → WebUI auth → OCU) and A-T01 (headers set by proxy and mirrored by OCU, observed by the WebUI iframe) cannot be verified in either repo alone. Convention: every task and issue title carries `[webui]`, `[ocu]` or `[deploy]`; `[ocu]`/`[deploy]` issue bodies name the sibling checkout, the OCU branch (`codex/plan1-<slug>` off OCU `main` at `7318b2e`), and the fact that existing untracked `deploy/` and `docs/decisions/` in OCU are kept. OCU tests go in the OCU repo root `tests/` (its existing layout). A second OpenSpec change in the OCU repo was rejected: it would split one acceptance matrix into two halves that each cannot go green.

### D3. `GET /api/v1/ocu/auth` contract

- Input: WebUI session (cookie or bearer, via the upstream `get_verified_user` dependency), header `X-Chat-Id` injected by the proxy per route. No URI parsing. There is no second, cookie-less input mode (D19).
- Output: `200` with headers `X-User-Id`, `X-User-Email`, empty body, on `is_chat_owner(chat_id, user.id)`; `401` when no session; `403` for every other case, including non-existent chat, non-saved chat_id (D10 predicate), shared/folder/admin access, and `ENABLE_OCU_WORKSPACE=false`. The proxy maps 403 → 404 (`error_page 403 =404` / Caddy equivalent). The endpoint never creates, starts, or touches a sandbox.
- The endpoint is always registered, independent of the feature flag, so `auth_request` never sees a 404 (nginx turns anything but 2xx/401/403 into 500).
- Rejected: returning 404 from the endpoint; returning the decision in a body (auth subrequests discard bodies); a chat-less "session only" auth mode (D12 removes the endpoints that would need it).

### D4. Workspace routes are thin and never start a sandbox implicitly

Five routes, all in `routers/ocu_workspaces.py`; the four `/workspaces/*` routes are registered only when `ENABLE_OCU_WORKSPACE` is true (D9), the auth endpoint always.

- `GET /workspaces/{chat_id}`: 404 unless owner; returns `{chat_id, status, reason?, capabilities, revision, views, base_url, cli_badge?}`. `capabilities` is computed by WebUI, not OCU: the actions the owner may take now — `launch` when `status` is `stopped`, `refresh` whenever OCU answered, `prefs` always. `status` and `reason` come from OCU's internal `GET /internal/describe/{chat_id}` (D7 mapping); when OCU does not answer the route returns `status: unavailable`, `reason: ocu_unreachable`, `views: []` and the stored cursor. `revision` is the OCU broker's value when OCU answers, otherwise the stored `last_seen_revision`; every successful describe advances `last_seen_revision` to the broker value. `base_url` is the proxied prefix (`/ocu`) the sidebar and the SPA use. The response carries no file list: files come from the proxied outputs listing (D8). It is the only place the SPA gets the `/api/runtime/cli` badge data.
- `POST /launch`: owner-only; calls OCU's internal launch under the per-chat lock (D6, D7 state matrix). `404` when not owner.
- `POST /refresh`: owner-only; calls OCU's outputs listing `GET /api/outputs/{chat_id}` with the internal token (the listing performs the broker reconcile, D11) and returns the resulting `revision`, advancing the cursor; rate-limited per chat (token bucket, 1 per 2 s, burst 3, in-process); metadata only, nothing enters the LLM context.
- `PUT /prefs`: owner-only; body is a whitelisted object `{view?: "files"|"browser"|"terminal", selected_file_id?: string, open?: boolean}`, at most 2 KiB, unknown keys rejected with 422; stored in `ocu_chat_state.prefs`. Same 401/404 semantics as the other routes.
- Mutating routes (`POST /launch`, `POST /refresh`, `PUT /prefs`) are WebUI routes, not proxied rows, so the proxy's Origin checks (D16) never see them. They therefore require the header `X-Requested-With: ocu-workspace` themselves, checked after authentication and before ownership (`401` without a session, `403` without the header, then the owner check): a request from an opaque-origin generated page is cross-site, so it carries no `SameSite=Lax` cookie in either shape (no-cors simple request, or a preflighted request that passes upstream's default `CORS_ALLOW_ORIGIN=*`) and gets 401 before the header check; the 403 branch guards the remaining case, a same-site cookie-bearing caller without the header (a form post or script running in the WebUI origin outside the sidebar client). `src/lib/apis/ocu/` sets the header on every call; it is the same header the SPA's fetch wrapper uses (D16).
- Rejected: a generic proxy route in WebUI (Non-Goal); reading `X-User-Email` from the client (email only ever originates server-side); writing prefs through `refresh` (mixes a read-only reconcile with a write).

### D5. Generated-content isolation is enforced twice, identically

The proxy is the primary control and OCU `app.py` `/files/{chat_id}/{filename}` the mirror. Both set, for `text/html`, `image/svg+xml`, `application/xhtml+xml`, `text/xml`, `application/xml` on non-download file responses: `Content-Security-Policy: sandbox allow-scripts allow-forms` and `X-Content-Type-Options: nosniff`, and strip any other CSP. `?download=1` stays `attachment`. The sidebar loads generated content from the cookie path `/ocu/files/{chat_id}/{path}` in an iframe with `sandbox="allow-scripts allow-forms"` (no `allow-same-origin`), and the trusted OCU SPA in a separate iframe with fixed `sandbox="allow-scripts allow-same-origin allow-forms"`; neither reads `$settings.iframeSandbox*` or `injectCsp`. Rejected: `srcdoc` (needs a WebUI-side fetch of the file and gives a top-level open a different document than the sidebar) and a separate origin (Non-Goal for LAN).

### D6. One `threading.Lock` per chat_id in the OCU process

Implementation amendment: `ocu-lifecycle` and decision `2026-09-22-ocu-lifecycle-lock-and-launch-semantics` require the process-local lock plus shared-filesystem flock, preserving multiple workers. The process-local-only scope below is superseded.

`_get_or_create_container` is synchronous and reached from `asyncio.to_thread` / MCP threads; Plan 2's broker fence is thread-side file I/O. A dict `chat_id → threading.Lock` behind one module-level guard lock, created on first use, never deleted while a container exists. Rejected: `asyncio.Lock` (would be mixed with thread code on the same resource) and a global lock (serialises unrelated chats).

### D7. Stop semantics and the launch state matrix

Implementation amendment: `ocu-lifecycle` supersedes unconditional success in the table below. Dead, readiness timeout and engine refusal fail without deletion; only observed running returns200. Host-owned idle reclamation supersedes reset-before-pause, supports external pause/unpause while OCU is online, and suspends reclamation during OCU downtime.

`_get_or_create_container` returns a running container, or creates one for a chat that never had one (no container and no `.meta.json`); for any existing container whose Docker state is not `running` (`exited`, `paused`, `created`, `restarting`, `dead`), and for a chat whose container is absent but whose `.meta.json` survives (removed by cron), it raises `SandboxStopped` — recreation from meta is launch's job, never the tool path's. The `else: container.start()` branch is deleted along with the `exited` branch. The only start path is OCU's internal `POST /internal/launch/{chat_id}` (called by WebUI `POST /launch`), under the per-chat lock. Status code: Plan 1 § 1 reserves 403 for "已授权但动作不允许"; this design deviates for the one owner action refused because of sandbox state (launch on a chat that never had a container) and answers 409 `never_created`, because the refusal is a state conflict the owner can resolve by sending a first message, not a permission; 403 stays on the auth endpoint. Matrix:

| Container state                               | launch does                                                                                                                                              | HTTP                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| running                                       | nothing                                                                                                                                                  | 200 `running`       |
| exited / paused / created / restarting / dead | start (paused → unpause; restarting → wait)                                                                                                              | 200 `running`       |
| absent, `.meta.json` present                  | recreate from meta, as today's `resurrect-container` does; secrets come from server-side fallbacks in `_create_container`, never from the launch request | 200 `running`       |
| absent, no meta                               | nothing; the first container is created by the tool path on the first message                                                                            | 409 `never_created` |

`/terminal/{chat_id}/restart-container` and `resurrect-container` (browser-reachable allowlist rows per Plan 1 § 2) become thin aliases of the same internal launch function (same lock, same owner check through `auth_request`, same matrix); the `409 "Container already exists"` in resurrect disappears with it, and the SPA's `__stopped__` / `__meta_exists__` branches both call the alias. WebUI's `POST /launch` is therefore the only WebUI route that starts a sandbox, and the aliases are the same start path seen through the proxy, not a second one. CONTEXT.md § Open Terminology's `resurrect (retire)` candidate is closed as `resurrect = alias of launch` in the docs task. Tool calls that hit `SandboxStopped` return a tool error telling the model the workspace is stopped; the retention guard's 168 h stop therefore cannot be undone by `view` or by MCP. Describe status mapping: `running` → `running`; every other existing state, and absent with `.meta.json`, → `stopped` (launch can resume or recreate it); no container and no meta → `unavailable` with `reason: never_created`. OCU computes this mapping in a token-protected `GET /internal/describe/{chat_id}` (Docker state + `.meta.json` presence, read under the per-chat lock, never starting anything) that also returns the broker's current counter, the available views (`files` always; `browser` and `terminal` only when running) and the `/api/runtime/cli` badge; WebUI's describe route is a thin owner-gated wrapper over it and answers `unavailable` / `ocu_unreachable` with the stored cursor when OCU does not answer. `/terminal/{chat_id}/status` cannot serve this purpose: it reports ttyd reachability and answers the same for a running container without ttyd as for a never-created chat. Rejected: keeping get-or-start and adding a "was stopped by retention" flag — two flags, same race.

### D8. Reconciliation identity, and what describe does not carry

`file_id` is a UUID assigned by the OCU outputs broker; indexes `path → file_id` and `(size, sha256) → file_id`; on reconcile, path hit wins; a delete+create pair with equal size triggers hashing and rename continuity; otherwise a new id; deletes leave tombstones and a reused path never inherits the old id. `mtime_ns` is carried for display only. The describe route (D4) carries no file list; the sidebar restores binding/status/view from describe and then lists files from the proxied `/ocu/api/outputs/{chat_id}`. Hashing happens only on suspected renames (Plan 1 § 1): an in-place edit that keeps the same size and forges mtime is therefore invisible to reconcile — a recorded blind spot (Risks), not a promise.

### D9. Feature flag

`ENABLE_OCU_WORKSPACE` (WebUI env, default `false`) gates registration of the four `/workspaces/*` routes and the sidebar button. Off means those routes 404 and the button is absent; the auth endpoint stays registered and answers 403 for every chat (D3). It never re-exposes unauthenticated OCU because the proxy allowlist and the internal token are independent of the flag. The harness (`scripts/dev-bg.sh`) sets `ENABLE_OCU_WORKSPACE=true` so smoke and e2e exercise the routes.

### D10. chat_id validity predicate on the WebUI side

Upstream `utils/chat_id.py:is_saved_chat_id` rejects empty and `temporary:`/`local:`/`channel:` ids but accepts `"default"`. The fork-side guard is the composite `is_saved_chat_id(chat_id) and chat_id != "default"`, implemented in `routers/ocu_workspaces.py`; upstream `chat_id.py` is not modified. OCU rejects the same set independently (fail-closed).

### D11. `revision` authority

The OCU outputs broker keeps one monotonic counter per chat, persisted in its index; it is the only authority (CONTEXT.md). Every listing entry carries `revision` = the counter value at that file's last change, so `path + revision` identifies a file version and unchanged files keep their value. WebUI's `ocu_chat_state.last_seen_revision` is a read cursor: written by the describe route on every successful OCU call, read back only when OCU is unreachable; a stopped container does not matter because the internal describe reads the broker index, not the container. When they diverge, the broker wins and the cursor is advanced. Rejected: per-file counters (no total order across a chat) and a WebUI-owned counter (WebUI never sees file writes).

### D12. Identity endpoints are not proxied (deviation from Plan 1 § 2)

Plan 1 § 2 lists `/system-prompt`, `/skill-list`, `/skill-mounts` as proxied rows ("反代注入 email 后转发"). This design deviates: they leave the browser allowlist and join `/api/runtime/cli` in the not-proxied set. Reasons: (1) they have no `chat_id` in their route, so the `X-Chat-Id` `auth_request` contract (D3) cannot authorize them; (2) `auth_request` discards the subrequest body, and WebUI's session endpoint `GET /api/v1/auths/` returns the user only in its body, so a session-only subrequest can authenticate but cannot inject `X-User-Email` — exactly what these endpoints need; (3) they read `user_email` from a query parameter, so exposing them to browsers would let the client choose the identity; (4) no browser code calls them (`computer_link_filter.py` fetches `/system-prompt` server-side; `/skill-*` appear only in docs). Server-side callers reach them directly with the internal token, and OCU accepts `user_email` only on token-bearing requests. The session-only subrequest shape is still used, without identity injection, for the `/ocu/static/` rows (D15). Rejected: a chat-less variant of `/api/v1/ocu/auth` that injects identity (a second authorization shape on a Critical Path for zero browser callers).

### D13. Credentials enter only the owning chat's sandbox

OCU passes `GITLAB_TOKEN`, `ANTHROPIC_*` and the sub-agent CLI keys into a sandbox's environment at container creation (`docker_manager.py` `_create_container`); the sub-agent CLI needs them, so this change does not remove them. CONTEXT.md's "never reach a sandbox" is narrowed to "reach only the sandbox of the chat they were scoped to": credentials are read from the request-scoped context of the tool call that creates the container, under that chat's lock, and never from another chat's context; the internal proxy token and MCP key are never passed in. The CONTEXT.md invariant line is updated by the WebUI-side routes PR (task 3.2) in the same milestone as the lifecycle work, because CONTEXT.md lives in this repo and the lifecycle code in the OCU repo. Rejected: moving model keys out of sandboxes (breaks the sub-agent CLI, out of scope).

### D14. No foreign-key cascade for `ocu_chat_state`

The harness and default deployment use SQLite without `PRAGMA foreign_keys=ON` (`internal/db.py`), so `ON DELETE CASCADE` would be a no-op there, and upstream deletes dependants explicitly in `models/chats.py`. Touching those three delete paths would add a Critical Path upstream file to the spine. Chosen: no FK; a deleted chat's row is an orphan that nothing can read (every route is owner-gated through `is_chat_owner`, which is false for a missing chat) and that the backup/restore procedure may prune. Rejected: explicit deletes in `models/chats.py` (upstream spine + rebase cost) and enabling the FK pragma globally (changes upstream behaviour for every table).

### D15. Public prefix for the OCU SPA

OCU's `_generate_preview_html` and `preview.js` emit root-absolute URLs (`/static/*`, `/api/outputs/…`, `/files/…`, inline `/terminal/…/heartbeat`). Under the same-origin `/ocu/` topology those would hit WebUI (which mounts its own `/static`). OCU gets `OCU_PUBLIC_PREFIX` (default `""`, the overlay sets `/ocu`); every URL the SPA HTML shell and `preview.js` emit is prefixed with it, the `url` field of every `/api/outputs` entry is emitted by the broker with the prefix (the SPA uses `url` directly as iframe/img/anchor `src`, which no fetch wrapper can rewrite, and also as a fetch argument, which the wrapper therefore must not prefix again — see D16), static assets are served at `{prefix}/static/` and that prefix is in the allowlist as a read-only, session-authenticated path (no chat binding, no identity injection, no OCU state). Three kinds of root-absolute `/static/` URL inside the scripts themselves are out of reach of any fetch wrapper: ES module specifiers (`import … from '/static/x.js'` in `preview.js` and `browser-viewer.js`), `loadScript(...)` which sets a `<script src>`, and bare string assignments (`pdfjsLib.GlobalWorkerOptions.workerSrc`, the PDF `viewerUrl`). These become relative to the script's own URL: module specifiers `./x.js` (resolved against `{prefix}/static/preview.js`, so they need no prefix knowledge and are byte-identical with an empty prefix), and `loadScript`/`workerSrc`/`viewerUrl` bases derived from `import.meta.url`. After the change no `static/*.js` file contains a root-absolute `/static/` literal. Rejected: proxy `sub_filter` rewriting (fragile against minified JS and JSON bodies).

### D16. Mutating GETs are guarded like mutations

Plan 1 § 2 asks for an explicit decision on `/terminal/{chat_id}/heartbeat`, `sessions`, `processes` (GETs with side effects). Decision: the proxy applies the Origin / `Sec-Fetch-Site` / `X-Requested-With: ocu-workspace` requirements to every request whose method is not GET/HEAD/OPTIONS **and** to these three paths, which the allowlist marks `mutating`. The SPA sends all its requests through one fetch wrapper that adds the header to every request and the prefix only to client-constructed root-absolute paths; server-emitted URLs (`apiUrl`, `filesBase`, each entry's `url`, and the WebUI `describeUrl` for the CLI badge) are used verbatim, and the wrapper is idempotent (no-op when the path already starts with the prefix), so no request can be double-prefixed (D15). Rejected: changing the three endpoints to POST (touches SPA and OCU for no gain over the allowlist flag).

### D17. Event is a hint, GET is the truth

`ocu:workspace_changed {chat_id, reason}` is emitted server-side only (socket room `user:{id}`, `socket/main.py:1062-1083`), handled in `Chat.svelte` beside `chat:reload` and before the `history.messages[event.message_id]` gate; the handler only sets a chat-keyed dirty flag. Polling (3 s foreground / 15 s background, existing `preview.js` cadence) and page reconnect do the full reconcile; the `event_emitter=None` path needs no special case.

### D18. WebSocket revocation re-check lives in OCU (deviation from Plan 1 A-T09 for logout)

nginx `auth_request` runs once per handshake and cannot re-check an open connection. OCU's CDP and ttyd WebSocket proxy loops call WebUI's `GET /api/v1/ocu/auth` (with the internal token and the session cookie captured at handshake) every 30 s and close the socket with code 4401 when it is not 200. This catches user deletion or deactivation, loss of chat ownership and JWT expiry. It does not catch logout: upstream `invalidate_token` (`utils/auth.py`) revokes a JWT only when `app.state.redis` is set, `REDIS_URL` defaults to empty, and neither the harness nor the overlay provisions Redis, so a captured cookie keeps answering 200 until the JWT expires (`JWT_EXPIRES_IN` default 4 weeks). Plan 1 A-T09 "登出/撤权时已有 WS … 撤权及时关闭" is met for 撤权 and deviates for 登出 (user decision 2026-09-20, Plan 1 row amended): the browser tab's own sockets close when the page unloads on logout; a socket held elsewhere with the old cookie stays usable until the JWT expires. Rejected: requiring Redis in the overlay and the harness (a new infrastructure dependency for one case the LAN trust model lists under "不做"); a proxy-side connection TTL (kills healthy sessions, still misses revocation inside the window).

### D19. Generated documents are served single-file; relative sub-resources are out of scope (withdrawn path-grant design)

A generated HTML/SVG document runs with an opaque origin — in the sidebar (iframe without `allow-same-origin`) and top-level (`CSP: sandbox`). Its sub-resource requests (relative CSS, images, fonts, scripts, `fetch`) are cross-site from the browser's point of view, so the `SameSite=Lax` WebUI session cookie (`WEBUI_AUTH_COOKIE_SAME_SITE` default) is not sent, the proxy's `auth_request` answers 401 and the sub-resource does not load. Isolation and Plan 1 A-T01's "资源齐全" for relative resources exclude each other on a cookie-only gateway.

Decision (user, 2026-09-20): this change does not solve it. The cookie path `/ocu/files/{chat_id}/{path}` is the only file path; a generated document renders everything it inlines (CSS, JS, data-URI images) and nothing it references relatively; the A-T01 fixture and pass criterion are narrowed accordingly and Plan 1 is amended in the same PR. A signed, short-lived, read-only path grant (`/ocu/f/{grant}/{chat_id}/…`, 302 from the cookie path) was designed and reviewed inside this change and withdrawn: it needs four more proxy-level rules (strip client-supplied grant headers on every non-grant row, a second 401/403 matrix for grant mode, the isolation headers on the grant path, a CORS policy for `Origin: null`) whose only verification seam is the proxy smoke that group 13 has yet to build. The design and its open items are kept in `docs/decisions/proposed/architecture/2026-09-20-ocu-path-grant-for-opaque-documents.md`; a follow-up issue in the epic (`Implementation Ready: no`) tracks it; it becomes its own OpenSpec change once groups 13 and 16 exist.

Rejected now: session cookie `SameSite=None` (opens a CSRF surface on every WebUI API for generated pages); `allow-same-origin` on the generated-content iframe (AGENTS.md note 5); `srcdoc` (D5); an OCU-side bundling endpoint that inlines relative references (a candidate for the follow-up change, not designed here).

## Not yet specified

In scope, visible, but the problem itself is not yet precise enough to cut into specs or tasks (Plan 1 § 验证、发布与回滚 "尚待实施阶段实测"):

- Tool-event ↔ WebUI output structure compatibility: which `_run_tool` return shapes survive `middleware.py`'s output handling when the notification is emitted; observed only once the tool runs inside the fork.
- Office render fidelity recording: the format in which pagination and pixel-level differences between OCU previews and Word/Excel/PowerPoint are recorded. The behaviours A-T02/A-T03/A-T04 already fix (sheet/page switching, uncomputed formulas marked, download fallback on render error) are specified in `outputs-reconciliation` and are not part of this item.
- LAN server capacity: how many concurrent sandboxes one host sustains; a measurement, not a design.

## Sketch seams under test

Fewest, highest seams; each is an existing test seam from CONTEXT.md § Public Interfaces or the harness:

1. **FastAPI `TestClient` on `routers/ocu_workspaces.py`** — the whole 401/403/404 matrix, the D10 predicate, prefs validation and `ocu_chat_state` persistence are observable here without OCU; it is the seam CONTEXT.md names for `/api/v1/ocu/*`.
2. **hurl through the reverse proxy (`smoke/proxy/*.hurl` via `make smoke-proxy`, proxy from the deploy overlay run locally against the harness and a deterministic OCU stub)** — allowlist default-deny, 403→404 mapping, internal-token injection, mutating-GET guards and the CSP/nosniff headers exist only at this seam; unit tests of nginx config are not possible.
3. **Playwright (`e2e/ocu-workspace.e2e.ts`, same stub + proxy)** — A-T01 opaque origin (three open paths), sidebar mount/unmount on chat switch, dirty-flag reconcile; the only seam where "no console errors + no token access from generated page" is observable.
4. **OCU `pytest` (repo root `tests/`)** — per-chat lock, `SandboxStopped` for every non-running state, launch matrix, internal describe mapping, WebSocket re-check close on non-200, `NO_AUTOSTART` passthrough, chat_id fail-closed, subnet check, header mirroring, prefix generation, `file_id`/`revision` reconcile, network membership after stop → launch; OCU has no HTTP-through-proxy seam of its own.

## Risks / Trade-offs

- **Proxy misconfiguration is the single point of policy**: mitigated by the OCU-side mirror (token check, chat_id rejection, subnet check, CSP mirror, prefix generation) and by `make smoke-proxy` being a required CI row (`layer3-integration-tests`), not an optional one.
- **Firewall rules are host state, not code**: a host rebuild without the overlay's init script silently drops L3 isolation; the overlay ships an idempotent rule script and a check that fails deploy if the rules are absent.
- **Reconcile blind spot**: an in-place edit with unchanged size and forged mtime is not detected (D8); the agent's own writes always go through the tool path, which bumps the revision explicitly, so the blind spot is limited to out-of-band edits inside the sandbox.
- **Timers keep running while paused** (`sleep N && kill 1`, `timeout`): this change only ensures pause paths reset the self-kill timer before pausing.
- **Fail-closed token at OCU startup**: an OCU deployment without `OCU_INTERNAL_TOKEN` refuses to start from the group-4 PR on; the overlay provisions the token in the same milestone, and the OCU dev docs say so.
- **Migration on the Critical Path**: additive, reversible, covered by `make db-verify`; no data backfill; orphan rows after chat deletion are accepted (D14).
- **Relative resources in generated pages do not load** (D19): a page that links `style.css` renders unstyled; single-file outputs are unaffected; the follow-up change owns the fix.
- **Logout does not revoke open sockets without Redis** (D18): bounded by JWT expiry and by the browser closing its own sockets on page unload.
- **Cross-repo pin for the proxy smoke**: `make smoke-proxy` needs the OCU overlay's proxy config, which lives in the sibling repo; CI checks that repo out at a SHA pinned in `constraints.yaml`, so every overlay change that the smoke depends on costs one pin bump in this repo. Accepted over copying the config here (would duplicate the overlay and break D2's ownership).
- **Rebase friction**: five upstream files touched (`main.py`, `env.py`, `ChatControls.svelte`, `Chat.svelte`, `Artifacts.svelte`); each touch is a hook of ≤10 lines and is listed in tasks so the diff stays auditable.
