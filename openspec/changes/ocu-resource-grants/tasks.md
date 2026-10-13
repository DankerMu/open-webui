# Tasks

The approved oracle is `docs/plans/2026-10-10-opaque-document-resources.md` plus `grill-gate.json`. These are future implementation tasks, not completion claims. Use #35 as the existing tracking epic; do not create a duplicate epic. Issues remain blocked on their real dependencies and the existing implementation queue's required CI gate.

## 1. WebUI resource authorization

Owner: WebUI grant router and paired backend route tests. Depends on: approved stage artifacts. Public contract: design D1–D2; resource-grant spec's capability, per-request authorization and issuance/expiry requirements. No OCU/proxy/frontend/CI edits.

- [x] 1.1 Implement the registered issuer/verifier and private capability codec in the additive resource-grant router, with only the router hook in main.py; add `docs/decisions/proposed/architecture/2026-10-10-ocu-resource-grants.md`, cross-linking `docs/decisions/proposed/architecture/2026-09-20-ocu-path-grant-for-opaque-documents.md` as historical input without rewriting its withdrawn header-mode design or claiming gateway delivery. Verify with the paired TestClient route suite: distinct grant/session credentials; malformed/oversized/altered/wrong-purpose grant; whole-chat read scope and excluded paths/methods; holder-cookie independence; no-exp/short-exp/legacy-unbindable sessions; deterministic clock-boundary unit cases for session/grant refusal at exact expiry, future grant issuance, non-finite/invalid times and lifetime exceeding600seconds; current user/owner/feature changes; token/per-user/no-Redis/unavailable-Redis revocation; empty-body verifier status matrix; issuer relative302 only after session/ownership checks. Existing session-only auth cases must stay unchanged.

Primary proof: `make test-backend PYTEST_ADDOPTS='-k "ocu_resource_grants or ocu_auth"'`; normal backend lint/coverage and docs checks are hygiene, not an additional acceptance path. New behavior requires red-before/green-after evidence and a direct route smoke.

Suggested fixture level: expanded - new security-sensitive HTTP entrypoints and bearer capability.
Minimal mergeable slice: atomic - issuer and verifier share one credential contract; publishing an issuer without its validator would create unusable capabilities, while a separate unreferenced codec would violate canonicality.

- [x] 1.2 Apply the owner-approved mechanical declaration repair in the existing Office subprocess test doubles and DOCX XML callbacks so the inherited unused-parameter findings do not block `make anti-drift`. Preserve all callback bodies, security/cleanup assertions and accepted callback calls; no gate suppression or threshold change. Verify the Office route-test module, `make smoke-stub` and `make anti-drift`. This is a bounded harness-only exception to group1's authorization scope, not Office behavior or gateway delivery.

### Group 1 risk coverage

| Risk pack                  | Selection and evidence                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public API                 | Selected: issuer GET/HEAD and verifier status/header/body matrix through actual routes.                                                                                        |
| Config / setup             | Selected: both routes stay registered with workspace disabled; configured-but-unavailable Redis returns503.                                                                    |
| File IO / path safety      | Selected for pathname validation: encoded separators, dot/empty segments, backslashes, controls and reserved archive refused; actual filesystem confinement belongs to group2. |
| Schema / fields            | Not selected: no persisted schema change; signed-claim types and duplicate fields are covered by auth/parser cases.                                                            |
| Auth / secrets             | Selected: token confusion, signature/purpose/session binding, fresh role/owner/revocation, credential-free errors and relative redirects.                                      |
| Concurrency / shared state | Selected: mutate role/owner/feature/revocation between issuance and verification; next request refuses without positive caching. No new shared mutable state.                  |
| Resource limits            | Selected:4096-byte token ceiling and bounded expiry, including exact boundaries and invalid numeric values.                                                                    |
| Legacy compatibility       | Selected: unchanged session-only OCU auth suite; legacy sessions without binding refuse; absent Redis retains TTL-bound limitations.                                           |
| Error handling             | Selected: empty no-store verifier denials and503 infrastructure failure; no partial capability on issuer refusal.                                                              |
| Release / dependencies     | Not selected: no dependency or deployment change; gateway activation and pinned integration belong to groups4–6.                                                               |
| Documentation              | Selected: proposed decision plus historical cross-link; decision/docs gates.                                                                                                   |

Governing invariant: possession grants only short-lived ordinary-file reads in the issuing session owner's one currently authorized chat, never WebUI login or execution authority.
Sibling surfaces: issuer, verifier, existing session decoder/revocation helper, current user/owner lookup and unchanged `/api/v1/ocu/auth`; downstream gateway consumes D2 only after its own group4 proof.
No-expiry sessions retain the existing revocation helper's semantics: logout without an effective stored revocation cannot invalidate their grants immediately. The600-second grant cap still applies; group1 does not modify upstream signout.
The owner-approved status boundary preserves `Chats.is_chat_owner` unchanged: its internally swallowed database failures remain403. User-lookup failures and other exceptions surfaced to the router return503; configured revocation-store unavailability always returns503. Exercise both the real predicate's internal-failure refusal and surfaced-exception handling, without replacing the authorization predicate in the internal-failure case.

## 2. OCU confined HEAD transport

Owner: ordinary file transport and existing file-header/transport tests. Depends on: #201 descriptor-pinned file serving. Public contract: file-header delta; design D5. No archive implementation, capability codec, proxy or new Range feature.

- [x] 2.1 Add explicit HEAD through the same confined reader used by GET, preserving allowed in-root behavior and inline/download/header/validator semantics. Extend the existing file transport suite with generated/binary/download/missing/directory/outside-target cases, zero HEAD body, descriptor release and path-swap controls; verify the #201 guarantee remains true for both methods.

Primary proof: the OCU `tests/test_files_headers.py` suite through the repository's Python3.12 pytest command, with the existing descriptor-boundary regression. Exercise actual TestClient requests; do not infer HEAD from a decorator.

Suggested fixture level: expanded - file IO and HTTP method compatibility over sandbox-writable paths.
Minimal mergeable slice: atomic - HEAD and its descriptor lifetime/response-policy proof are one ordinary-file transport behavior; the underlying race repair belongs to #201 and is not duplicated here.

### Group 2 risk coverage

| Risk pack              | Selection and evidence                                                                                                                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API             | Selected: explicit ordinary-file HEAD returns GET-equivalent status and file headers for generated/binary/download inputs; actual TestClient and HTTP requests, not decorator inspection.                                                                                                      |
| Config / setup         | Not selected: no dependency, runtime configuration or service change. Use the source repository's Python3.12 environment and canonical single-root test discovery.                                                                                                                             |
| File IO / path safety  | Selected: missing, directory, non-regular, outside/private-state targets refuse; preserve safe in-root aliases and existing regular-file selection. Reuse the confined opener unchanged.                                                                                                       |
| Schema / fields        | Not selected: no stored schema or new visibility index. Existing metadata/validator header semantics remain the oracle.                                                                                                                                                                        |
| Auth / secrets         | Selected: GET/HEAD retain the existing service-auth boundary and denial behavior; only temporary benign canaries, never live/private secrets. No capability or gateway changes.                                                                                                                |
| Concurrency / ordering | Selected: leaf/ancestor/root replacement cannot redirect descriptor bytes or HEAD metadata; setup/fstat/send cancellation and disconnect retain the existing single owner and close ordering.                                                                                                  |
| Resource limits        | Selected: HEAD does not read or emit file payload, including empty/multi-chunk files. Observe ASGI body frames or target reads as well as the client-visible body, because clients may discard HEAD bytes. Success/failure/completion release acquired descriptors.                            |
| Legacy compatibility   | Selected: preserve GET, inline/download isolation, encoded filenames, aliases, fresh-read and validator semantics. Retain the characterized ignored-Range/full200 behavior; no new Range feature. Archive GET stays unchanged; HEAD must not fall through to an ordinary file named `archive`. |
| Error handling         | Selected: preserve denial statuses and absence of target metadata; exercise setup/metadata/send failure and cancellation without leaking, prematurely closing or double-closing descriptors.                                                                                                   |
| Release / packaging    | Not selected: no image, deployment or dependency delivery. Run the existing app import/package consumer if the selected source seams affect it.                                                                                                                                                |
| Documentation          | Selected: source changelog and this shared fixture record the method contract; control-repository docs/decision gates remain hygiene.                                                                                                                                                          |

Governing invariant: an ordinary-file request's metadata and any bytes refer only to its one validated, owned descriptor; HEAD sends no file payload and releases that ownership through the same failure/cancellation paths as GET.
Sibling surfaces: ordinary route registration and handler, `WorkspaceFileResponse` open/fstat/send/finally, the unchanged uploads/descriptor opener, service-auth/error middleware, and the separately owned archive GET route. The existing descriptor reader, same-inode mutation and hard-link/bind-mount provenance limits are not redesigned here.
Required seams: `tests/test_files_headers.py` owns HTTP/header/race parity; `tests/test_file_response.py` owns raw response/worker/descriptor lifetime; `tests/test_descriptor_io.py` preserves shared acquisition. Extend the existing observers instead of importing test modules into one another or creating a second response implementation. Native HTTP smoke must observe real HEAD status/headers and an empty wire body.

## 3. OCU preview resource base

Owner: trusted HTML preview renderer and its browser harness. Depends on: approved URL contract, not gateway activation. Public contract: resource-grant relative-resource requirement and design D5. Do not modify WebUI components, iframe permissions, Markdown policy or unrelated Office/Drawio behavior.

- [x] 3.1 Use the final fetch response URL as the generated document's resource base while retaining the canonical file URL for navigation/link messages/state. Extend the existing preview browser harness with a real redirect and relative resource loading, opaque-origin controls, canonical link handling and the no-redirect/unprefixed case; retain existing Office/Drawio checks and capture browser evidence.

Primary proof: `node tests/orchestrator/preview_embedding_browser.cjs` with its documented Python/Playwright prerequisites. This is a consumer proof, not a real gateway or grant-cryptography acceptance claim.

Suggested fixture level: expanded - generated-document origin isolation and shared preview consumer behavior.
Minimal mergeable slice: atomic - final-response base and canonical navigation must change together so resources work without persisting bearer URLs; the consumer remains valid before grants are deployed.

### Group 3 risk coverage

| Risk pack                  | Selection and evidence                                                                                                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public consumer contract   | Selected: actual standalone SPA fetch follows a real redirect; relative resource effects identify the final response directory, while file selection, download links and intercepted navigation remain canonical.                                                                   |
| Config / setup             | Not selected: no new dependency or runtime option. Use documented Python3.12, Playwright1.62.1/Chromium and prepared local Drawio materials.                                                                                                                                        |
| Input handling             | Selected: nested/encoded file paths, relative links with parent segments/query/fragment, safe insertion of URL data into HTML and the interception script. No root-absolute/external resource rewriting.                                                                            |
| Auth / secrets             | Selected: sandbox remains exactly allow-scripts allow-forms; generated content cannot read parent DOM/storage or acquire parent authority. A synthetic final resource URL must not become a canonical navigation message or trusted persisted state. No real grant/credential used. |
| Concurrency / shared state | Selected for compatibility: retain selected-file identity and existing renderer retirement/selection controls. No polling, cancellation or renderer lifecycle redesign.                                                                                                             |
| Resource limits            | Not selected: no new unbounded loop, cache, worker or payload allocation policy. Existing fetch/render behavior remains.                                                                                                                                                            |
| Legacy compatibility       | Selected: no-redirect and unprefixed deployment remain valid; retain existing Office/Drawio, Markdown, content/link isolation and all three prefix checks. Embedded Files mode does not gain HTML support.                                                                          |
| Error handling             | Selected: preserve existing canonical fallback and per-case console/network error attribution; do not suppress new errors or weaken existing negative cases.                                                                                                                        |
| Release / dependencies     | Not selected: no gateway, browser-cookie, capability, proxy, image or deployment change. The sole executable acceptance path is the existing preview browser harness.                                                                                                               |
| Documentation              | Selected: source changelog and shared fixture/evidence identify the consumer boundary without claiming end-to-end grant delivery.                                                                                                                                                   |

Governing invariant: transient resource resolution follows the fetched document's final URL, while trusted workspace identity and user navigation remain canonical and generated content stays opaque-origin.
Sibling surfaces: `renderHtmlPreview`, `fetchOutput`, link interception and `handleLinkClick`, selected-file/download state, standalone prefix handling, and the unchanged embedded Office/Drawio/Markdown consumers.
Required proof: a redirect to a different directory must change actual CSS/image/script/data resource effects, not just a base-tag string; a relative click must emit a canonical resolved URL and select the intended canonical neighbor. Include same-document and external-link controls without rewriting unsupported authored resource forms. Observe sandbox/parent/storage denial and zero unexpected errors; retain screenshots. Parent qualification must reject final-base loss, canonical-navigation leakage and sandbox widening without mutating production source.

Concrete group 3 oracles:

- Use a canonical nested HTML file such as `reports/space "'&<>.html`, with each pathname segment percent-encoded in its URL, redirected to a different synthetic resource directory. CSS changes a known computed color, a local image decodes to known dimensions, a script sets a known visible value, and relative JSON supplies distinct fixture data. Neither quotes nor markup-shaped filename characters create an injected element or script effect.
- Clicking `../neighbor.txt?view=one#part` emits the canonical workspace `neighbor.txt` URL with that query/fragment, selects the listed canonical neighbor and keeps its download URL canonical. Clicking `#section` emits the canonical current-file URL plus fragment without selecting another file or navigating the trusted top-level page; this slice does not introduce new fragment-scroll behavior. An authored `https://example.invalid/document` link retains the existing confirmation dialog and is not fetched/opened until confirmation; cancel leaves selection unchanged.
- Retain the harness's existing superseded-render and Drawio selection-retirement controls. Also hold a redirected HTML response, select a different listed file, then release the old response: the visible replacement preview, selected filename and canonical download URL must remain unchanged.
- Abort only the first canonical HTML fetch using the harness's existing browser network-fault boundary, then allow the fallback document request. The fallback iframe has canonical `src`, no `srcdoc`, and exactly `allow-scripts allow-forms`; only the correlated first-request network diagnostic is expected. No page error or unrelated network/console error is accepted.

## 4. OCU grant gateway

Owner: deploy/proxy route table, renderer, template, native fixtures/tests and its README. Depends on: groups1 and2. Public contract: reverse-proxy delta and design D2–D4. No WebUI implementation, file-reader rewrite, new deployment service or DocumentServer listener behavior change.

- [ ] 4.1 Implement the canonical GET/HEAD issuer content-proxy path, separately authorized download path and exact GET/HEAD grant-file row with dedicated verifier subrequest. Update reviewed table count/hash and validators atomically. Extend native proxy tests to prove authorization precedes redirects, canonical-entry HEAD redirects followed by grant HEAD with GET-equivalent status/file headers and no body, no client-header mode switch, fresh server identity, no cookie/grant forwarding, correct encoded target/query, archive/control/method denials, unambiguous `download=1` on grant URLs returning404 before any auth or OCU request, final MIME isolation, null-origin credential-free CORS, no-store/no-referrer and credential-free failure logs. Denied requests must have zero OCU arrivals; existing session/Office/WS rows remain intact.

Primary proof: the existing native `deploy/proxy/tests` suite with Python3.12 and nginx. The native auth fixture exercises the published issuer/verifier interface; group5 supplies real WebUI issuance proof.

Suggested fixture level: expanded - browser authorization, URI dispatch, CORS and credential containment at the shared gateway.
Minimal mergeable slice: atomic - publishing the grant route without its verifier selection, method/path guards, final response policy and diagnostics protection would create an unsafe authorization surface; renderer and table are one reviewed configuration owner.

## 5. WebUI real-auth grant smoke and pin

Owner: native smoke harness, OCU stub/resource fixtures, Hurl matrix and constraints.yaml OCU pin. Depends on: groups1–4, #76 and #229. Public contract: proxy-smoke delta and design D6. No UI/component, production auth, CI workflow or real-editor implementation.

- [ ] 5.1 Atomically move the OCU pin to reviewed source containing groups2–4 and update the smoke/stub/Hurl matrix for real issuer redirects, canonical-entry HEAD redirects followed by grant HEAD with GET-equivalent status/file headers and no body, valid resources/HEAD, unchanged unsigned canonical401 and foreign404, header forgery, grant-as-session rejection, tampering/wrong-chat/expired grants, excluded targets, and unambiguous `download=1` on grant URLs returning404 before contacting the verifier or OCU. Verify CORS, isolation and no-contact denials. Use a real short-lived synthetic session for expiry without production clock knobs or global-setting changes. Keep all grant/cookie variables private and out of argv/public errors. Supply the selected renderer's existing Office listener inputs using the stub and retain the full Office matrix; coordinate this already-defined pin/input overlap with #172 without claiming its real-editor target.

Primary proof: `make smoke-proxy` against the exact pinned OCU revision, including positive and failure controls and owned resource cleanup. The changed pin, deterministic resources and updated assertions form one executable request-level path; #172's separate real-editor path is excluded.

Suggested fixture level: expanded - credential-bearing verification scripts, cross-repo pin and gateway response contract.
Minimal mergeable slice: atomic - the new proxy changes canonical file responses, so pin/fixtures/assertions must move together to keep the single smoke command meaningful and green.

## 6. WebUI browser acceptance and live contract closure

Owner: existing OCU Playwright fixtures/cases and live Plan1 A-T01/decision documentation. Depends on: group5. Public contract: resource-grant browser/expiry requirements; preserve original isolation controls. No production frontend behavior change or archive-history edits.

- [ ] 6.1 Replace only the old expected relative-resource failure with positive computed-style/image/font/classic-script/module-script/fetch proofs in sidebar, direct file navigation and message popup, using the pinned real proxy. Retain origin/token/localStorage/parent/execution controls, add canonical reopen after expiry and generated SVG isolation, and verify downloads plus existing Office/Drawio consumers. Capture screenshots and zero unexpected console/page errors. Only after this evidence, widen live Plan1 A-T01, move the group1 record `docs/decisions/proposed/architecture/2026-10-10-ocu-resource-grants.md` to `docs/decisions/implemented/architecture/2026-10-10-ocu-resource-grants.md`, update its status and reference links, and document expiry/reopen and no-Redis revocation limits; do not describe failed/untested behavior as delivered.

Primary proof: `make verify-ui-ocu`; docs/decision verification is accompanying hygiene. Browser loading is independent of group5's HTTP matrix, so it is a separate issue rather than a multi-path exception.

Suggested fixture level: expanded - real browser security/isolation and visible relative-resource behavior.
Minimal mergeable slice: atomic - all three supported opening modes must satisfy the same isolation/resource invariant before A-T01 is widened; partial mode coverage cannot certify the declared browser contract.
