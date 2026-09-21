# Spec Delta

## Purpose
The external reverse proxy is the only browser path to OCU: default-deny allowlist, `auth_request` per request, 403→404 mapping, internal token, forced isolation headers on generated content, Origin checks on every mutating request; OCU verifies the token, chat_id and source subnet itself, generates prefixed URLs, re-checks open WebSockets and mirrors the headers. Source: Plan 1 § 2; design D3, D5, D12, D15, D16, D18, D19.

## ADDED Requirements

### Requirement: Default-deny allowlist
The proxy SHALL forward only the path prefixes of the allowlist table (Plan 1 § 2 chat-bound entries plus `/ocu/static/`, minus the identity endpoints — design D12) under `/ocu/`; every other path under `/ocu/` and every unlisted OCU path SHALL return 404 without contacting OCU. Each allowlist row SHALL carry a `mutating` flag; `/terminal/{chat_id}/heartbeat`, `/terminal/{chat_id}/sessions` and `/terminal/{chat_id}/processes` SHALL be flagged `mutating` although they are GETs (design D16). The table file is the contract; adding a row is a reviewed change.

#### Scenario: Unlisted endpoint (A-T08)
- **WHEN** an authenticated owner requests `/ocu/api/runtime/cli`, `/ocu/mcp-info`, `/ocu/health`, `/ocu/api/skill-stats`, `/ocu/mcp`, `/ocu/system-prompt`, `/ocu/skill-list`, `/ocu/skill-mounts` or `/ocu/`
- **THEN** the response is 404 and OCU receives no request

#### Scenario: Listed read-only endpoint
- **WHEN** the owner requests `/ocu/api/outputs/{chat_id}` or `/ocu/preview/{chat_id}`
- **THEN** the request passes `auth_request` and is forwarded with the internal token header and `X-User-Email`

#### Scenario: SPA static assets
- **WHEN** a browser with a valid WebUI session requests `/ocu/static/preview.js`
- **THEN** the proxy requires the session (401 without one), forwards to OCU's `{prefix}/static/` without a chat binding, and the asset is served with its own content type

### Requirement: Public prefix URL generation
OCU SHALL read `OCU_PUBLIC_PREFIX` and SHALL emit every URL in the preview HTML shell (`_generate_preview_html`: stylesheets, scripts, `apiUrl`, `filesBase`, inline heartbeat; it also emits `describeUrl` = WebUI's `/api/v1/ocu/workspaces/{chat_id}`, which is not prefixed because it is a WebUI route), in `preview.js` / `browser-viewer.js` (module specifiers, `loadScript` targets, worker and viewer URLs resolved relative to the script's own URL), and in the `url` field of every `/api/outputs/{chat_id}` entry under that prefix; static assets SHALL be mounted at `{prefix}/static/`; no URL SHALL be root-absolute without the prefix, and no `static/*.js` file SHALL contain a root-absolute `/static/` literal (design D15).

#### Scenario: Sidebar loads the SPA under the prefix
- **WHEN** the sidebar iframe loads `/ocu/preview/{chat_id}` with `OCU_PUBLIC_PREFIX=/ocu`
- **THEN** every stylesheet and script request is to `/ocu/static/…` and returns 200, no request reaches WebUI's `/static`, `apiUrl` is `/ocu/api/outputs/{chat_id}`, and the heartbeat goes to `/ocu/terminal/{chat_id}/heartbeat`

#### Scenario: Outputs entry URLs carry the prefix
- **WHEN** `/api/outputs/{chat_id}` lists `report.html` with `OCU_PUBLIC_PREFIX=/ocu`
- **THEN** the entry's `url` is `/ocu/files/{chat_id}/report.html`, and the SPA's iframe/img/anchor `src` built from it starts with `/ocu/`

#### Scenario: Empty prefix keeps today's URLs
- **WHEN** `OCU_PUBLIC_PREFIX` is unset
- **THEN** the emitted URLs are identical to the baseline

### Requirement: Auth subrequest on every request
Every proxied chat-bound request, including WebSocket upgrades for CDP and ttyd, SHALL first pass `auth_request` to `GET /api/v1/ocu/auth` with `X-Chat-Id` extracted by the proxy from the route; the `/ocu/static/` rows SHALL instead pass `auth_request` to WebUI's upstream session endpoint `GET /api/v1/auths/` (session only, no chat binding). 401 SHALL be returned as 401 and 403 SHALL be mapped to 404 (`error_page 403 =404` or Caddy equivalent); `X-User-Id`/`X-User-Email` from the auth response SHALL be copied to the upstream request via `auth_request_set`/`copy_headers`.

#### Scenario: Cross-user WebSocket (A-T08)
- **WHEN** user B opens the CDP or ttyd WebSocket URL for A's chat
- **THEN** the handshake is rejected with 404 before reaching OCU

#### Scenario: Client-supplied identity is ignored
- **WHEN** a browser request carries its own `X-User-Email`, `X-User-Id` or `X-Chat-Id` header
- **THEN** the proxy overwrites them with server-derived values before forwarding

### Requirement: Revocation closes open WebSockets
OCU's CDP and ttyd WebSocket proxy loops SHALL re-call `GET /api/v1/ocu/auth` (internal token + the session cookie captured at handshake, `X-Chat-Id` of the socket) every 30 s and SHALL close the socket with code 4401 when the answer is not 200 (design D18, A-T09). Logout is not a revocation signal without Redis-backed token revocation (design D18, recorded deviation from Plan 1 A-T09).

#### Scenario: Ownership revoked with open terminal (A-T09)
- **WHEN** the owner is deleted or deactivated, or loses ownership of the chat, while a ttyd WebSocket is open
- **THEN** the socket is closed with 4401 within 60 s and no further input is executed

#### Scenario: Logout closes only the browser's own sockets
- **WHEN** the owner logs out in the tab that holds the sidebar
- **THEN** the page unload closes that tab's sockets; a socket held elsewhere with the same cookie is closed by the re-check only once the JWT expires

#### Scenario: Healthy session stays open
- **WHEN** the session stays valid
- **THEN** the periodic re-check never closes the socket and produces no user-visible effect

### Requirement: Internal token
The proxy and every server-side caller (tool path, `computer_link_filter.py`, MCP header trust) SHALL attach the shared internal token header on every request to OCU; OCU SHALL refuse to start when `OCU_INTERNAL_TOKEN` is unset (fail-closed, no dev bypass) and SHALL reject any request on a chat-bound endpoint, and any `X-Chat-Id`/`X-User-Email`/`user_email` it would otherwise trust, that lacks a valid token (A-T09). The token SHALL never be sent to a browser or into a sandbox.

#### Scenario: Startup without token
- **WHEN** OCU starts with `OCU_INTERNAL_TOKEN` unset or empty
- **THEN** the process exits non-zero naming the variable

#### Scenario: Direct OCU access without token (A-T08)
- **WHEN** a request reaches OCU's listen address without the internal token header
- **THEN** OCU responds 401 and performs no action

#### Scenario: MCP headers without token
- **WHEN** an `/mcp` request carries `X-Chat-Id`/`X-User-Email` but no internal token
- **THEN** those headers are ignored and the request is rejected as unauthenticated for chat-bound operations

#### Scenario: Token absent from client-visible surfaces (A-T09)
- **WHEN** the workspace is used end to end (sidebar, links, tool calls, error paths)
- **THEN** the token appears in no browser response, chat message, `Referer`, or default-level log line

### Requirement: Generated-content isolation headers
For responses on `/ocu/files/{chat_id}/*` without `?download=1` whose `Content-Type` is `text/html`, `image/svg+xml`, `application/xhtml+xml`, `text/xml` or `application/xml`, the proxy SHALL set `Content-Security-Policy: sandbox allow-scripts allow-forms` and `X-Content-Type-Options: nosniff` and strip any other CSP; OCU SHALL set the same headers itself in `app.py` (`/files/{chat_id}/{filename}`) as a mirror. `?download=1` SHALL keep `Content-Disposition: attachment`.

#### Scenario: Top-level open of generated HTML (A-T01)
- **WHEN** a generated HTML file containing a button, inline JS, inline CSS and a data-URI image is opened by clicking a message link, by typing its `/ocu/files/...` URL in a new tab, or inside the sidebar iframe
- **THEN** the page renders with its inline resources and its JS runs, `document.origin` is opaque, `localStorage`/cookies of the WebUI origin are unreadable, `fetch` to `/api/v1/*` fails, and the response carries both headers

#### Scenario: Relative sub-resource is a recorded limitation (A-T01, design D19)
- **WHEN** a generated page opened in the sidebar iframe or top-level references `style.css` relatively
- **THEN** the sub-resource request carries no session cookie, the proxy answers 401 and OCU receives nothing, and the page still renders its inline content

#### Scenario: SVG with script (A-T01)
- **WHEN** a generated SVG containing `<script>` is opened top-level
- **THEN** the same headers are present and the script cannot reach the WebUI origin

#### Scenario: Proxy header missing, OCU mirror holds
- **WHEN** the proxy is misconfigured and forwards the file response unchanged
- **THEN** the OCU response already carries the two headers

### Requirement: Origin checks on mutating requests
For every proxied request whose method is not GET/HEAD/OPTIONS, and for every allowlist row flagged `mutating`, the proxy SHALL require `Origin` equal to the WebUI origin or `Sec-Fetch-Site: same-origin`, SHALL reject `Origin: null`, and SHALL require the header `X-Requested-With: ocu-workspace`; the SPA SHALL send every request through one fetch wrapper that adds that header, prefixes only client-constructed root-absolute paths, and is a no-op for server-emitted or already-prefixed URLs (design D15, D16).

#### Scenario: Generated page posts to upload
- **WHEN** JS inside a sandboxed generated page issues `fetch('/ocu/api/uploads/{chat_id}', {method:'POST', mode:'no-cors'})`
- **THEN** the proxy returns 403 and OCU receives nothing

#### Scenario: Generated page pings heartbeat
- **WHEN** JS inside a sandboxed generated page issues a no-cors GET to `/ocu/terminal/{chat_id}/heartbeat`
- **THEN** the proxy returns 403 and the sandbox self-kill timer is not reset

#### Scenario: SPA request carries the header
- **WHEN** the SPA starts ttyd, uploads a file or calls `sessions`
- **THEN** the request carries `X-Requested-With: ocu-workspace` and is forwarded

### Requirement: OCU-side fail-closed checks
OCU SHALL reject chat_ids in `{"", "default"}` and prefixed `temporary:`/`local:`/`channel:` on every chat-bound endpoint (A-T12), SHALL reject requests whose source address is inside the sandbox subnet (A-T08), and SHALL replace `allow_origins=["*"]` with the configured WebUI origin only.

#### Scenario: Tool wrapper forces default
- **WHEN** a tool call arrives with an empty chat_id (currently coerced to `"default"` by `computer_use_tools.py`)
- **THEN** OCU returns a validation error and neither creates nor reuses the `default` container

#### Scenario: Request from the sandbox subnet (A-T08)
- **WHEN** a process inside a sandbox sends an HTTP request that reaches OCU's listener with a sandbox-subnet source address
- **THEN** OCU responds 403 before any handler runs

#### Scenario: CORS tightened
- **WHEN** a browser on a non-WebUI origin sends a credentialed cross-origin request to OCU
- **THEN** no `Access-Control-Allow-Origin` matching that origin is returned

### Requirement: Server-side callers carry the token and skip the proxy
`computer_use_tools.py` (`Valves.ORCHESTRATOR_URL`, upload path) and `computer_link_filter.py` (`/system-prompt` fetch) SHALL call OCU's internal address with the internal token; `X-User-Email` / `user_email` SHALL be injected only from server-side `__user__`; the browser-visible link base (`PUBLIC_BASE_URL`) SHALL be the proxied `/ocu` base.

#### Scenario: Upload from tool
- **WHEN** the tool uploads a file for chat C on behalf of `__user__`
- **THEN** the request carries the token and `X-User-Email` from `__user__`, and OCU accepts it; the same request without the token is rejected

#### Scenario: System prompt fetch (A-T13)
- **WHEN** `computer_link_filter.py` fetches `/system-prompt` for the current user
- **THEN** the request carries the token and succeeds; the injected system prompt is unchanged from baseline

#### Scenario: Filter link base
- **WHEN** the filter appends a preview link for `report.html` in chat C
- **THEN** the link is `{PUBLIC_BASE_URL}/files/C/report.html` with `PUBLIC_BASE_URL` = the proxied `/ocu` base, and the sidebar recogniser accepts it
