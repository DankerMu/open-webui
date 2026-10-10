# Resource grant design

## Context

The approved source plan is `docs/plans/2026-10-10-opaque-document-resources.md`; `grill-gate.json` records the confirmed branches. Grants are not implemented. The old proposed path-grant record is historical input, not an instruction to add a header-selected mode to `/api/v1/ocu/auth`.

## Goals / Non-Goals

Goals: enable the approved relative resources through a read-only single-chat capability, preserve canonical links, session revocation and opaque-origin isolation, and provide independent module-sized proofs.

Non-Goals: other-chat/private/control/archive/listing access, mutations, global CORS/cookie changes, background renewal, bundling, custom-header/credentialed CORS requests, root-absolute or external URL rewriting, new services/dependencies/schema, real-editor or LAN acceptance. Do not edit archived OpenSpec history.

## D1. Capability format and trust owner

Add `backend/open_webui/routers/ocu_resource_grants.py` with registered issuer and verifier routes; keep the existing OCU auth endpoint and upstream auth code unchanged. One router include/import in `main.py` is the only upstream-spine hook. Reuse the current verified-user roles, saved-chat predicate, `Chats.is_chat_owner`, `Users` lookup and `is_valid_token` revocation helper.

The token is two base64url components: canonical UTF-8 JSON payload and HMAC-SHA256 signature. Derive its key from the existing WebUI session secret using the fixed label `ocu-resource-grants`; never use `create_token` or the session signing key directly. Verify with constant-time comparison. Maximum token length4096bytes, reject malformed/duplicate/mistyped claims and unknown purpose. The purpose is `ocu-resource-read`; signed claims bind user id, chat id, issuing session jti/iat, grant issued-at/expiry and session expiry when present. A fresh grant must have a session jti and issuance time; a legacy session missing either must sign in again, not receive an unbound capability. No raw session token, email or internal OCU credential is embedded.

Expiry is `min(now+600, session_exp)` when a session expiry exists, otherwise `now+600`. Reject expired sessions, non-finite/invalid times, future grant issuance and grants whose lifetime exceeds600seconds. Do not cache positive authorization decisions. Each verifier request re-resolves user/role, rejects invalid/default/transient chat ids, rechecks ownership and calls the existing revocation helper with the issuing session claims. Configured revocation-storage errors fail closed; absent Redis retains the agreed TTL-bound logout behavior.

## D2. Separate issuer and verifier interfaces

`GET/HEAD /api/v1/ocu/resource-grants/issue` is a content endpoint, not an auth_request endpoint. It requires an actually validated WebUI session JWT (not an API key), applies the existing verified-user/owner checks, and validates route-derived `X-Chat-Id`, `X-Ocu-Resource-Path` (encoded relative file path) and `X-Ocu-Resource-Query` (original query). It returns an empty302 with a relative Location `/ocu/f/{grant}/{chat}/{path}` plus the preserved query, `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. It never contacts OCU. A missing/invalid session yields401, ownership/eligibility/flag/scope refusal403, and an infrastructure validation failure503; no error contains a credential. It never redirects to a caller-supplied origin.

`GET /api/v1/ocu/resource-grants/auth` is the separate grant verifier for auth_request. Inputs: `X-Ocu-Grant`, `X-Chat-Id`, `X-Ocu-Resource-Path`, `X-Ocu-Resource-Method`. It ignores browser Cookie/Authorization as authority: a valid grant is a bearer capability even if its holder has a different browser session. Success200 has an empty body and fresh `X-User-Id`/`X-User-Email`; missing grant401; malformed/expired/wrong-chat/revoked/ineligible/disabled/out-of-scope grant403; configured storage failure503. All responses have empty bodies and no-store. Both routes remain registered when the workspace flag is off and deny403 rather than disappearing.

Ordinary file paths reject empty/dot segments, backslashes, separators hidden by encoding, double decoding, control characters and the exact reserved `archive` path. They never select a directory/listing or private Office route. Whole-chat scope is not authorization-by-listing: an ordinary file under outputs does not become private merely because the broker omits its name. Preserve the existing reader's allowed in-root behavior, including aliases it can resolve safely; #201 owns descriptor confinement. Private Office/control storage is outside outputs. Target ownership is the chat, not a stale file_id or mtime.

## D3. Gateway routing and redirect phase

Extend the existing reviewed table/renderer/template together; update its reviewed row count/hash. Add `/ocu/f/{grant}/{chat}/{path}` GET/HEAD with grant auth and explicit rewrite to `/files/{chat}/{path}`; validate both raw/decoded chat and path, reject archive aliases before upstream dispatch. Do not introduce a catch-all grant proxy. The canonical ordinary-file row gains HEAD; archive and all other rows keep their authority and method matrix.

For canonical non-download file entry, proxy the content request to the WebUI issuer with incoming headers disabled and only the session cookie plus server-derived target inputs. The issuer performs authorization before producing302. Do NOT emit a rewrite-phase `return302` after an `auth_request` directive: nginx rewrite processing precedes access authorization. Map the issuer's403 to404 on this entry-only surface; preserve401 and fail closed on upstream errors. No fallback to direct file access on issuer failure.

Canonical `download=1` follows the existing unambiguous lowercase query rule and the original session auth/file forwarding path; use a separately authorized internal download location if necessary. An unambiguous `download=1` on a grant URL is rejected404 before auth/upstream dispatch; downloads remain on the canonical cookie path. Never send Office/terminal/static requests to the grant verifier. Keep the existing behavior for duplicate/case-variant canonical download queries and filename/query encoding.

The grant location uses an internal auth subrequest that forwards ONLY route-derived grant/chat/path/method, never a client auth-mode header, cookie or Authorization. All other auth locations continue to disable inherited request headers and all non-grant OCU rows clear grant-related headers. Grant-file forwarding removes the grant and browser credentials, injects the internal OCU credential and verifier-derived identity, and preserves only the ordinary target/query. Internal locations stay unreachable from either public listener. DocumentServer listener behavior is unchanged.

## D4. Response policy and credential containment

The final grant response reuses the existing MIME/download isolation owner: generated HTML/SVG/XHTML/XML retain exactly `sandbox allow-scripts allow-forms` and nosniff; other file policies remain intact. Canonical redirects and all grant responses have no-store and no-referrer. Strip upstream Set-Cookie and CORS credentials on grant responses.

After successful grant authorization, only a request with `Origin: null` receives `Access-Control-Allow-Origin: null` and `Vary: Origin`; never `*` or Access-Control-Allow-Credentials. Expose only the ordinary resource response, not issuer/verifier internals. Ordinary null-origin file fetch, module and font GETs need no preflight; OPTIONS and unsupported methods remain404 with no OCU contact. Existing mutation null-origin denials do not change.

Keep gateway access logging off as configured. Suppress native raw-URI error logging specifically in grant-file and grant-auth locations because upstream failures otherwise include the capability URL; retain sanitized status/error reporting without token values. Application diagnostics and harness public output never print grants. Native tests inject auth/upstream failures and inspect logs as well as responses; masking only successful access logs is insufficient. No persistent grant storage, prompt/filter/listing rewrite or background renewal is introduced.

## D5. Confined transport and preview consumer

Grant activation depends on #201. Its descriptor-open owner must enforce that streamed bytes and HEAD metadata refer to one validated ordinary file beneath this chat's outputs directory. Explicitly register HEAD and close held resources on HEAD, failure and completion; preserve existing no-store, MIME, CSP, attachment, fresh-read and validator semantics. No new Range feature is added; any supported ranges must remain bound to the same descriptor.

For OCU `renderHtmlPreview`, use the final fetch Response.url directory as the resource base. Preserve the canonical file URL separately for user navigation/link messages; do not persist or forward a grant as a canonical workspace URL. Keep the existing iframe sandbox, content/link isolation and standalone unprefixed deployment behavior. Sidebar and direct top-level file navigation inherit the final redirect URL without changing stored workspace URLs.

## D6. Verification and delivery

Six task groups are separate module boundaries: WebUI authorization, OCU transport, OCU preview consumer, OCU gateway, WebUI native integration/pin, WebUI browser acceptance. Authorization and preview consumer can be delivered independently; transport follows #201; gateway follows authorization and transport; the pin includes all OCU changes; browser acceptance follows the real-auth smoke. Harness work consumes #76 and #229 rather than duplicating their cleanup/credential fixes.

The pin update supplies already-defined Office listener render inputs when the selected OCU revision requires them, using the stub upstream. Coordinate this overlap with #172; do not implement or claim its real-editor target here. Grant-specific verification must not silently drop existing Office gateway coverage. No stage issue changes CI policy or bypasses required checks.

The native smoke uses real WebUI grant issuance and verifies the full path matrix. For expiry, create a genuinely short-lived synthetic owner session using the existing session-token helper and private harness configuration; obtain a grant through the real issuer, wait for that short session to expire, then require refusal before OCU contact. Do not add production test clocks/TTL knobs, change global session settings, print credentials or wait the full600seconds. Keep grant URLs/cookies out of Hurl argv and public failure output. Unit tests deterministically cover clock boundaries and configured/absent/unavailable revocation storage.

## Sketch seams under test

- WebUI TestClient grant routes with the harness DB: highest owner/role/session boundary; token confusion and all auth outcomes are observable here.
- OCU file transport/header suite: real GET/HEAD and swap controls prove descriptor confinement and metadata/body parity.
- Existing OCU preview browser harness: final-response base and canonical navigation are tested in the actual HTML renderer without requiring gateway release.
- OCU native proxy tests: route phase ordering, header provenance, CORS/status mapping, encoding and error-log redaction with recorded auth/OCU requests.
- `make smoke-proxy`: real WebUI auth plus exact pinned gateway and deterministic upstream; denies prove zero OCU contact.
- `make verify-ui-ocu`: actual resource rendering and opaque-origin isolation in sidebar, direct navigation and message popup; screenshots and zero unexpected console/page errors.

## Risks / Trade-offs

Whole-chat bearer read authority and TTL-bound no-Redis logout are approved trade-offs, not security bugs to hide. Browser history may retain a grant URL until normal history cleanup. Files intentionally copied into the visible workspace are within scope; private paths must never become reachable through routing or pathname races. Unsupported root-absolute URLs and credentialed/custom-header CORS are outside the approved relative-file protocol.

## Migration Plan

Land and verify the WebUI endpoints, descriptor prerequisite/HEAD and preview consumer before activating the proxy change. Move the WebUI harness pin atomically with its updated request/resource fixtures. Widen live Plan1 A-T01 only after all opening modes pass; do not edit archived acceptance history. Roll back the matched gateway/routes/pin to cookie-only behavior if authority or isolation fails; remove obsolete grant code in that rollback rather than keep a shim. User deployment remains manual.

## Not yet specified

None. Unverified runtime behavior is assigned explicit implementation/verification tasks, not represented as already delivered.
