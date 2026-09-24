# Design

## Source authority

Issue19 tasks11.1/11.2, parentD18, gateway revocation. CDP app.py896–952 relays text; ttyd1213–1276 negotiates tty and relays text/binary. Both currently cancel losing pumps without awaiting; default close can race4401. WebUI get_current_user prioritizes Authorization over cookie, so the internal token MUST NOT be sent as Bearer to WebUI.

## Configuration and credentials

- Add OCU_WEBUI_AUTH_URL: explicit absolute http(s) URL with host, exact path /api/v1/ocu/auth, no userinfo/query/fragment. Invalid nonempty value fails startup naming only the variable, not its possibly sensitive value. Missing/empty is allowed for non-WS server use, but both WS routes deny before backend lookup/connection rather than disable checks or guess an origin. Deployment env/network reachability is supplied by later overlay#22/#24, not modified here.
- Capture the handshake Cookie header and canonical route chat_id per connection. Require a nonempty token cookie before opening backend. Do not take identity from client X-User-* or a frame. Send captured Cookie, X-Chat-Id and X-OCU-Internal-Token from configured server env to exactly the configured auth URL. Never forward client Authorization as the WebUI credential; WebUI authenticates the token cookie and performs owner check, while its current endpoint does not authenticate the internal header. Do not imply that inert header independently authorizes WebUI.
- Auth HTTP client disables redirects and environment proxy/cookie-jar inheritance; each request carries its own captured cookie so parallel sockets cannot overwrite each other. No credentials to sandbox backend or logs. TLS verification default remains enabled. Auth response body/identity headers are not authorization evidence; only200 is accepted. Do not read unbounded response bodies.

## State machine and timing

- Existing outer internal-token/subnet/chat guard remains before route. A missing auth config/cookie is preaccept denial1008 and no Docker/backend action. Perform one bounded auth check before backend connection; denied/unavailable initial check denies preaccept1008. This complements proxy handshake ownership and avoids a30s unauthorized window on direct trusted callers.
- Once accepted and connected, recheck every30s with total5s HTTP deadline. First periodic check30s after initial success; no overlapping auth checks. Every non200 (including redirects/5xx), timeout or transport error revokes. Worst normal check+timeout <=35s after last authorization; acceptance bound60s.
- On revocation set a per-connection revoked flag before stopping pumps, cancel/await both directions, then close frontend4401 and backend; no pump-finalizer1000 can overwrite the revocation close. Neither direction may begin another send once revoked. Do not claim retracting bytes already sent before the decision. The flag is checked after receive and immediately before send; already blocked sends are cancelled/awaited before close.
- Healthy rechecker stays alive across multiple ticks; FIRST_COMPLETED must not end a connection merely because one200 was observed. Normal frontend/backend close cancels/awaits timer/auth request and sibling pump. Route cancellation propagates after cleanup. Backend-connect failures preserve1011; absent sandbox preserves1008 after authorization. Keep CDP text-only and tty text/binary/subprotocol semantics.
- Bound revocation frontend/backend close cleanup so a stuck close handshake cannot retain tasks indefinitely; backend ws_close deadline at most5s. Reuse aiohttp and existing asyncio patterns, no dependency or event-loop thread blocking.

## Evidence

Tests in tests/orchestrator/test_ws_recheck.py use injected/monkeypatched sleep/clock for30s ticks, actual route handlers and fake socket/auth dependencies; do not mock the supervisor under test. Prove both routes healthy multiple ticks,401/403/5xx/redirect/error/timeout close4401, capturedcookie+chat pairing across concurrent sockets, no cookies/tokens at backend, no queued input after revocation, cancellation and awaited cleanup. Preserve auth_guard denied handshake behavior; update successful authorized WS fixture to provide valid capturedcookie/config/checker dependency where appropriate, not weaken production.

Parent loopback smoke uses real aiohttp auth HTTP and WS backend plus real OCU websocket route, no Docker (patch only container service-address dependency). Verify CDPtext and ttybinary roundtrip, then auth403→client4401 and backend receives no postdecisionmarker. Accelerated injected timing is reported explicitly; production30s/5s constants exercised by deterministic-clock tests. Redirect target receives zero requests. Semantic RED must show open/forwarding wrong state, not missingimport. Separate timer check from actual socket-close evidence.

## Limits and risks

No logout guarantee without Redis token revocation; user deletion/deactivation/ownership loss/JWT expiry only. No production gateway or LAN access. Auth URL must be reachable from orchestrator deployment, tracked in overlay issue scope. This shared relay refactor is only the duplicated pump/cleanup boundary needed for revocation; no other terminal behavior changes.
