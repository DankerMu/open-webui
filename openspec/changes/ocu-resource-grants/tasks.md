# Tasks

The approved oracle is `docs/plans/2026-10-10-opaque-document-resources.md` plus `grill-gate.json`. These are future implementation tasks, not completion claims. Use #35 as the existing tracking epic; do not create a duplicate epic. Issues remain blocked on their real dependencies and the existing implementation queue's required CI gate.

## 1. WebUI resource authorization

Owner: WebUI grant router and paired backend route tests. Depends on: approved stage artifacts. Public contract: design D1–D2; resource-grant spec's capability, per-request authorization and issuance/expiry requirements. No OCU/proxy/frontend/CI edits.

- [ ] 1.1 Implement the registered issuer/verifier and private capability codec in the additive resource-grant router, with only the router hook in main.py; add `docs/decisions/proposed/architecture/2026-10-10-ocu-resource-grants.md`, cross-linking `docs/decisions/proposed/architecture/2026-09-20-ocu-path-grant-for-opaque-documents.md` as historical input without rewriting its withdrawn header-mode design or claiming gateway delivery. Verify with the paired TestClient route suite: distinct grant/session credentials; malformed/oversized/altered/wrong-purpose grant; whole-chat read scope and excluded paths/methods; holder-cookie independence; no-exp/short-exp/legacy-unbindable sessions; deterministic clock-boundary unit cases for session/grant refusal at exact expiry, future grant issuance, non-finite/invalid times and lifetime exceeding600seconds; current user/owner/feature changes; token/per-user/no-Redis/unavailable-Redis revocation; empty-body verifier status matrix; issuer relative302 only after session/ownership checks. Existing session-only auth cases must stay unchanged.

Primary proof: `make test-backend PYTEST_ADDOPTS='-k "ocu_resource_grants or ocu_auth"'`; normal backend lint/coverage and docs checks are hygiene, not an additional acceptance path. New behavior requires red-before/green-after evidence and a direct route smoke.

Suggested fixture level: expanded - new security-sensitive HTTP entrypoints and bearer capability.
Minimal mergeable slice: atomic - issuer and verifier share one credential contract; publishing an issuer without its validator would create unusable capabilities, while a separate unreferenced codec would violate canonicality.

## 2. OCU confined HEAD transport

Owner: ordinary file transport and existing file-header/transport tests. Depends on: #201 descriptor-pinned file serving. Public contract: file-header delta; design D5. No archive implementation, capability codec, proxy or new Range feature.

- [ ] 2.1 Add explicit HEAD through the same confined reader used by GET, preserving allowed in-root behavior and inline/download/header/validator semantics. Extend the existing file transport suite with generated/binary/download/missing/directory/outside-target cases, zero HEAD body, descriptor release and path-swap controls; verify the #201 guarantee remains true for both methods.

Primary proof: the OCU `tests/test_files_headers.py` suite through the repository's Python3.12 pytest command, with the existing descriptor-boundary regression. Exercise actual TestClient requests; do not infer HEAD from a decorator.

Suggested fixture level: expanded - file IO and HTTP method compatibility over sandbox-writable paths.
Minimal mergeable slice: atomic - HEAD and its descriptor lifetime/response-policy proof are one ordinary-file transport behavior; the underlying race repair belongs to #201 and is not duplicated here.

## 3. OCU preview resource base

Owner: trusted HTML preview renderer and its browser harness. Depends on: approved URL contract, not gateway activation. Public contract: resource-grant relative-resource requirement and design D5. Do not modify WebUI components, iframe permissions, Markdown policy or unrelated Office/Drawio behavior.

- [ ] 3.1 Use the final fetch response URL as the generated document's resource base while retaining the canonical file URL for navigation/link messages/state. Extend the existing preview browser harness with a real redirect and relative resource loading, opaque-origin controls, canonical link handling and the no-redirect/unprefixed case; retain existing Office/Drawio checks and capture browser evidence.

Primary proof: `node tests/orchestrator/preview_embedding_browser.cjs` with its documented Python/Playwright prerequisites. This is a consumer proof, not a real gateway or grant-cryptography acceptance claim.

Suggested fixture level: expanded - generated-document origin isolation and shared preview consumer behavior.
Minimal mergeable slice: atomic - final-response base and canonical navigation must change together so resources work without persisting bearer URLs; the consumer remains valid before grants are deployed.

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
