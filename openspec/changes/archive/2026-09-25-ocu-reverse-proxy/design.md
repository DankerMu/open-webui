# Design

## Context

Parent design D3/D5/D12/D15/D16/D19 governs the gateway. Existing scripts/proxy-dev.sh is tracked (commit2e423a723), selects deploy/proxy/nginx.conf and execs nginx with its absolute path; it does not render configuration. All existing OCU deploy/ files are untracked user material. Add only deploy/proxy, which does not yet exist.

OCU REST/WS requires Authorization Bearer with OCU_INTERNAL_TOKEN. WebUI chat auth uses Cookie and route-derived X-Chat-Id; static session auth returns identity in its discarded JSON body, not headers. OCU static retains /ocu/static while chat routes are unprefixed upstream. Browser WebSocket APIs cannot set X-Requested-With.

## Goals / Non-Goals

Deliver native, executable proxy configuration with a single reviewed route-table source. Do not change application authorization, owner predicate, stub, launcher, compose, firewall or CI. Full permanent smoke matrix is issue23; issue22 still requires executable security-path evidence, not nginx syntax alone. Docker remains deferred.

User-authorized paired merge gate (2026-09-24, issue22 comment5817655278): implement and review issue22 first, freeze its OCU candidate without merging, then serially implement issue23 against that exact commit. Both reviews and permanent make smoke-proxy/CI must pass before merging OCU first and WebUI second. Any source change invalidates corresponding evidence. One implementer at a time remains mandatory; this explicit exception resolves the one-issue-through-merge workflow conflict without weakening parent task13.1+13.3.

## Decisions

### Engine and rendered configuration

Use nginx with http_auth_request_module. A tracked table and renderer generate a self-contained nginx.conf; table inclusion is at render time, avoiding nginx prefix-relative includes. Render first, then launch through the existing script. No static token or host-specific absolute path is committed.

Required environment: OCU_INTERNAL_TOKEN and OCU_WEBUI_ORIGIN. Explicit upstream/listen inputs have harness defaults: OCU_WEBUI_UPSTREAM=http://127.0.0.1:8080, OCU_PROXY_UPSTREAM=http://127.0.0.1:8090, OCU_PROXY_LISTEN=127.0.0.1:8082. Production supplies internal endpoints and public origin. Validate endpoints/origin/listen syntax and reject control characters/config injection; error messages name variables without values. Accept only OCU's nonempty visible-ASCII token domain (bytes0x21–0x7E), rejecting whitespace, controls and non-ASCII without printing values. Preserve every accepted punctuation byte with correct nginx quoting; invalid token fails without replacing an existing rendered configuration.

Create ignore rules before generating secrets. Render atomically with mode0600; runtime pid/temp/log paths are absolute, private and outside tracked source. Rendered nginx.conf remains gitignored. No nginx -T or token-bearing access/debug logs. Renderer failures do not replace a valid existing config. Documentation identifies rendered files as secret material requiring protected mounts. Plain HTTP upstreams are internal transport for this slice; TLS termination belongs overlay deployment.

### Reviewed route table

Each row contains exact path pattern, allowed methods, auth mode, mutating flag, prefix handling and WebSocket/file-response classification. Generate routing from that one table, not a second handwritten list. Unknown or malformed rows fail rendering.

Chat GET rows: api/outputs/{chat}; api/uploads/{chat}/manifest and list; files/{chat}/archive and files/{chat}/{path}; preview/{chat}; browser/{chat}/status, json and json/version; terminal/{chat}/status, heartbeat, sessions and processes. Heartbeat/sessions/processes are mutating GETs. Chat POST rows: api/uploads/{chat}/{filename}; terminal/{chat}/start-ttyd, stop-ttyd, restart-container, resurrect-container and processes/{pid}/kill. WS GET rows: terminal/{chat}/ws and browser/{chat}/devtools/page/{page}. Session GET row: static/{path}. Every row is under /ocu/. Permit HEAD alongside read-only GET where upstream supports it; do not add OPTIONS/CORS bypass or methods absent from a row. Unknown paths/methods default404 without OCU contact.

Static paths retain /ocu/static upstream. Other rows strip exactly /ocu. Chat identity captured from the matched route must equal the identity in the forwarded path; never case-fold it. Encoded filename characters (space, #, +, %) and query strings must survive forwarding without becoming raw invalid HTTP bytes. Reject ambiguous route/chat separators, dot-segment or double-decoding forms before upstream contact; do not normalize a rejected route into an allowed different chat. Nested file/static paths remain supported. Files archive row precedes file catch-all, matching OCU.

### Authentication and header ownership

Internal-only auth locations call WebUI directly, never through the gateway: chat rows GET /api/v1/ocu/auth; static GET /api/v1/auths/. Send captured Cookie, clear Authorization and client identity headers, and set chat header only for chat auth. Do not forward request bodies to auth. Upstream user Bearer authentication is not a browser gateway mode; cookie is the shared handshake credential required by WS rechecks.

Chat auth200 supplies X-User-Id and percent-encoded X-User-Email; copy bytes verbatim, never read identity from client headers or body. Static auth supplies no identity headers; clear those on its upstream request. Always overwrite upstream Authorization with internal Bearer; clear client X-OCU-Internal-Token and X-Chat-Id before setting authoritative chat value. Preserve Cookie for OCU WebSocket revocation. Auth401 remains401; auth403 maps404; unexpected auth status fails closed. Keep proxy_intercept_errors off so OCU-origin failures pass through unchanged.

### Mutation checks and status provenance

For each mutating row or allowed non-safe method, require X-Requested-With: ocu-workspace and either exact OCU_WEBUI_ORIGIN or Sec-Fetch-Site:same-origin. Origin:null always fails. The accepted OR policy is parent D16; do not invent a stricter conjunction. Failed mutation checks return403, not auth's404.

Use distinct internal error provenance: mutation guard returns an internal sentinel routed to a named deny location that returns403 without inheriting auth's403 mapping; proxied auth locations map only their auth403 to404. Never expose the sentinel. Do not place the X-Requested-With guard on WS rows. Existing SameSite cookie restrictions plus owner auth govern WS handshakes; no new signed ticket or path grant.

### Forwarding and file headers

WS rows forward Upgrade/Connection and Cookie, with explicit3600s proxy read/send timeouts so nginx's default60s does not defeat idle sessions. HTTP rows clear upgrade headers. Uploads retain the backend's unbounded-body policy (client_max_body_size0), rather than silently introducing nginx's1MiB cap; future quotas are separate policy.

For non-download files with MIME text/html, image/svg+xml, application/xhtml+xml, text/xml or application/xml (case-insensitive, parameters allowed), replace all upstream CSP with sandbox allow-scripts allow-forms and set nosniff. Apply response headers with always semantics. For other types or download=1 preserve upstream security headers and Content-Disposition rather than inventing a new policy. Avoid duplicate CSP: hide upstream CSP/nosniff then emit selected forced or preserved values. Preview shell and static assets are not generated-file responses. Never rewrite response bodies or signed-resource URLs; no /ocu/f grant path exists.

Outside /ocu, forward to WebUI; /ocu and all unlisted /ocu/ paths return404. Internal auth and denial locations are inaccessible directly. No browser path to OCU health/docs/MCP/identity/internal endpoints.

## Evidence and handoff

Issue22 tests renderer failures/config escaping/table validation without secret output, nginx -t, native proxy through actual WebUI auth plus existing OCU stub via proxy-dev launcher. A temporary recording upstream can additionally prove no-contact, URI/header preservation, WS and response policy; it must not replace the required actual-harness/stub launch proof. No actual Docker.

The existing stub reflects Authorization in X-Echo-Authorization on all responses; this is fixture-only leakage, not production behavior to copy or hide with a stub-specific proxy rule. Issue23 must restrict that echo to internal paths and add private request observations before claiming its no-token-response matrix. Issue22 must not claim credential containment against that unsafe stub response; use a non-echoing recording upstream to verify the real proxy policy and document this limit. Extend no stub/launcher files here.

## Risks / Trade-offs

- Renderer precedes launcher → an unrendered installation fails loudly; deployment owns render/protected mount.
- Static session auth admits pending users → static files contain no chat data and are already public at OCU; no owner authority is granted.
- Cookie-only gateway → server-side tool/MCP callers continue using direct internal OCU credentials, not this gateway.
- Real path decoding differs across clients → exercise encoded filename and traversal cases against actual nginx, not source-text assertions.
- Existing stub cannot prove full route/token matrix → issue23 owns permanent fixture expansion, while temporary recording upstream provides issue22 behavioral evidence.
