# Design

## Context

Issue21 supplies tracked scripts/ocu-stub.py, smoke-stub.sh and proxy-dev.sh. Issue22 supplies reviewed OCU deploy/proxy at 8990f751d839cfb24733b13d32c145215601c4a6, held in PR15. The user authorized paired verification before either PR merges. The actual gateway contract lives in ocu-reverse-proxy; this change builds its permanent judge, not a second policy implementation.

## Goals / Non-Goals

Run native nginx against real WebUI owner/session authentication and deterministic OCU responses, locally and on Ubuntu CI, without Docker. Ordinary make smoke must continue without OCU checkout/proxy. No production auth/router/UI edits, topology/firewall changes or deployment access.

## Decisions

### Command and exact source

Makefile stays thin: make smoke-proxy calls scripts with the repository's fail-loud conventions. Require a healthy harness via make dev-status and seed through the existing command; do not reset a database. OCU_CHECKOUT defaults to the sibling checkout and CI overrides it with .run/open-computer-use. Require the directory, renderer/table/launcher, native nginx auth_request capability, hurl and Python prerequisites; missing inputs fail nonzero naming the prerequisite, never skip.

constraints.yaml owns ocu_checkout.sha as the full reviewed commit 8990f751d839cfb24733b13d32c145215601c4a6. Verify checkout HEAD and tracked source cleanliness before rendering; ignored runtime config is permitted, no fetch or checkout mutation in the smoke command. CI uses the pinned SHA, not a branch or latest tag. Preserve that tested source SHA after OCU merge.

Isolate the launcher layout as well as its processes: after checking the original checkout HEAD and tracked cleanliness, copy only reviewed tracked deploy/proxy sources byte-for-byte into the private per-run scratch layout. Do not copy, read, overwrite or remove the original ignored nginx.conf/runtime. Render in the owned copy and supply that copy as OCU_CHECKOUT only to the child launcher. Record source identities so this isolation does not substitute a different gateway. A pre-existing ignored config/runtime sentinel must survive success, failure and interruption unchanged.

### Owned runtime and data

Create private per-run scratch under .run with0700 directories/0600 sensitive files. Generate a synthetic visible-ASCII internal token without logging it; no production .env access. Render for selected loopback stub/proxy ports and the real harness endpoint; start existing proxy-dev launcher, not a second proxy entrypoint. Observe actual readiness with bounded deadlines, monitor unexpected exits, and terminate/wait only owned processes on success, failure and interruption. Do not stop a preexisting unrelated service or leave orphan workers. Runtime config remains protected and excluded from artifacts.

Use seeded admin only to provision/sign in test identities and chats through real APIs. Use real owner and distinct non-owner sessions, including a valid session that passes session-only static auth but fails owner auth. Create unique harness-owned data and delete only those records during cleanup; preserve seeded/preexisting data. Cookies and Hurl variables live in private files rather than command-line values. The command uses the already-running WebUI backend and never restarts it silently; CI starts/stops the harness through existing make targets.

### Single stub and private observations

Extend scripts/ocu-stub.py, not a parallel fake OCU server. Keep describe/launch state semantics and existing internal echo assertions for make smoke-stub. Browser-accessible routes never echo Authorization or Cookie. Optional private JSONL recording captures method, raw target, authoritative identity, internal credential comparison result or digest, and upload byte digest/length; do not expose these observations through a proxied endpoint or stdout. Full credential bytes need not be retained: compare to the synthetic expected token inside the fixture and record a boolean. Per-request snapshots/counts prevent one request borrowing another request's proof.

Add only deterministic responses required by the table: nested static/files, generated MIME variants, binary/download/attachment, preview prefixed URLs, uploads including manifest/list filename collisions and body digests, mutating GET/POST routes, browser discovery and both WS echo handshakes. Stub routing must not derive the expected allowlist from candidate-generated config: it is an independent controlled dependency. Unlisted-path denial requires unchanged OCU contact count, not merely a stub404.

### Permanent matrix and oracle qualification

Hurl files in smoke/proxy carry specified HTTP scenarios; a small shared Python assertion/lifecycle helper may cover WS, private receipt assertions and response-byte containment not expressible reliably in Hurl. Avoid reimplementing the gateway's policy in that helper. Every exercised browser response (headers and body) is checked for the synthetic internal token; privately prove allowed requests actually received the credential so omission cannot satisfy containment vacuously. Do not upload raw Hurl traces containing cookies or tokens.

Required matrix:

- Owner listed request200; anonymous401; valid-session foreign-chat404; static requires session and retains /ocu/static. Auth error mapping must not map mutation403 or OCU403/409 to404.
- Unlisted /ocu root, identity/MCP/health/docs/internal rows and unlisted methods return404 without OCU contact.
- Client identity and Authorization/custom API headers do not control OCU identity. Cookie-less x-api-key JWT is401 for chat/static under default active WebUI configuration; owner cookie succeeds and foreign owner fails. The earlier actual configured-custom-header old200/new401 proof is retained from #22; this command does not restart WebUI for arbitrary header configuration.

Before alternate-header denial assertions, send a cookie-less, Authorization-less request directly to WebUI /api/v1/ocu/auth with the owner JWT solely in x-api-key and the owned X-Chat-Id; require200 and owner identity. Then the same JWT-only header through proxy chat/static must401 with unchanged OCU arrivals. If the direct positive control fails, report an inactive-header prerequisite and stop without restarting WebUI. This prevents an unused header from producing a vacuous negative.

- Opaque Origin:null POST and no-cors GET heartbeat403 with no OCU contact; legitimate SPA mutation with required header/provenance succeeds. Per-request private observations prove exact chat identity/URI, not stale receipts.
- HTML/SVG/XML file CSP sandbox and nosniff, upstream CSP replaced once; binary/download preserve upstream policy and attachment. Cookie-less relative resource401; preview has /ocu static/outputs/files URLs and unprefixed WebUI describe URL.
- Encoded filenames/query and upload bodies survive unchanged; nested assets/files work. Both WS rows use cookie owner auth and echo a frame; foreign handshake denied before OCU contact. Browser WS does not need X-Requested-With.
- Every exercised response excludes internal token; observed allowed upstream requests confirm token receipt. Public echo regression is semantic RED on the existing stub before correction; isolated missing-auth/wrong-route/credential-echo faults qualify the permanent judge without editing tracked OCU source.

Generated-content stub fixtures must challenge the proxy: provide a distinct/weaker upstream CSP and at least one generated response without nosniff, then require exactly one forced policy. Observe every HTTP/WS arrival including unmatched routes; scan error/binary responses and WS handshake responses for token bytes without printing them.

### CI and documentation

CI layer3 reads and validates ocu_checkout.sha, checks out DankerMu/open-computer-use at that SHA with actions/checkout under .run/open-computer-use, installs native nginx with auth_request, and runs make smoke-proxy after harness readiness. Existing make smoke remains a separate preceding step. CI credentials must not enter the proxy/fixture environment; use explicit environment values. Always-run cleanup preserves original failure status. AGENTS.md Verification Matrix and constraints verification surface name the new actual target and its response/no-contact/containment evidence.

## Risks / Trade-offs

- Permanent security matrix may exceed400lines → justify atomic verification boundary; no threshold relaxation or dead assertion padding.
- Stub is not Docker/real OCU → source pin plus #22 native proof supports gateway behavior; integrated deployment remains issue36.
- Runtime response scans can reveal synthetic token on failure → report failing row/header name only, never leaked bytes or full responses.
- CI-only nginx/environment differences → capture first failure and reproduce relevant target without weakening assertions.
