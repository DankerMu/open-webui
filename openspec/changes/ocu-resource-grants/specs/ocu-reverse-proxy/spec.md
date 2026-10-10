## MODIFIED Requirements

### Requirement: Default-deny exact routing and identity alignment

Only reviewed method/path rows SHALL reach OCU. Static asset paths SHALL retain /ocu/static upstream; ordinary session chat paths SHALL strip exactly /ocu. The sole grant-file row SHALL remove its grant prefix and forward only to the ordinary `/files/{chat}/{path}` handler, with the authorized chat identity equal to the forwarded chat. An unambiguous `download=1` query on a grant-file URL SHALL return404 before auth or upstream dispatch; downloads SHALL remain on the canonical cookie path. Except for this rejection, query strings and encoded filename characters SHALL retain their meaning. Ambiguous separators, traversal/dot segments, archive aliases and double-decoding forms SHALL be rejected without contacting OCU. Unlisted paths/methods SHALL return404.

#### Scenario: Allowed owner request and nested static asset

- **WHEN** an authorized owner requests a listed session chat row or a session requests a nested static asset
- **THEN** the request reaches the correct unprefixed chat path or prefixed static path respectively

#### Scenario: Hidden endpoint and traversal

- **WHEN** a client requests OCU health, docs, MCP, identity, internal routes, an unlisted method or an ambiguous traversal path
- **THEN** the gateway returns404 without contacting OCU

#### Scenario: Encoded filename and query

- **WHEN** an owner requests a nested file whose name includes encoded space, hash, plus or percent with a query string
- **THEN** canonical entry and grant forwarding preserve filename/query meaning without changing the chat being authorized

#### Scenario: Grant scope cannot dispatch archive or another service

- **WHEN** a valid grant targets an archive alias, directory/listing, private/control path, another chat or a write/execution method
- **THEN** it is refused without contacting OCU, and no broader route or fallback is selected

#### Scenario: Download query on a grant URL

- **WHEN** a GET or HEAD request to a grant-file URL carries an unambiguous `download=1` query
- **THEN** the gateway returns404 before any auth subrequest or OCU request, without selecting a download fallback

### Requirement: Cookie authentication and authoritative headers

Every ordinary session chat request including WS handshake SHALL pass cookie owner authentication through WebUI `/api/v1/ocu/auth` with route-derived X-Chat-Id. Static rows SHALL use session-only `/api/v1/auths/`. Canonical non-download ordinary-file entry SHALL accept GET and HEAD and use the separately session-authenticated grant issuer as a content handler; it SHALL authorize before returning302, never before an access-phase check can run. Archive and all other rows SHALL retain their authority and method matrix. Grant-file requests SHALL use only the separate grant verifier and route-derived inputs; they SHALL NOT use a holder's cookie or Authorization as authority. The existing `/api/v1/ocu/auth` SHALL remain session-only. Auth401 SHALL remain401 and auth403 SHALL become404; unexpected auth responses SHALL fail closed. Client identity/credential/mode headers SHALL NOT determine OCU identity or select grant authority. OCU-bound requests SHALL receive the internal Bearer credential and current server-derived identity, with captured cookies only on existing session transport that needs them, never grant-file transport. Static identity headers SHALL be cleared. Internal auth locations SHALL not be directly accessible. OCU-origin error statuses SHALL remain unchanged.

#### Scenario: Anonymous, foreign chat and forged headers

- **WHEN** an anonymous client or foreign-chat user sends forged identity or grant-mode headers to an ordinary session route
- **THEN** the gateway denies401 or404 respectively before OCU contact
- **WHEN** an owner sends forged identity headers
- **THEN** OCU receives only server-derived identity and the internal Bearer credential

#### Scenario: Static session and upstream error

- **WHEN** a valid session requests static content
- **THEN** the proxy forwards without client-supplied identity or grant headers
- **WHEN** an authorized OCU request returns403 or409
- **THEN** that upstream status is preserved, not mapped as an auth denial

#### Scenario: Grant header isolation and holder cookies

- **WHEN** a grant-file request includes forged chat/user headers or a different browser session
- **THEN** only path-derived grant authority is verified, OCU receives the issuing user's current identity, and neither the grant nor browser credentials are forwarded to OCU
- **WHEN** the same grant is supplied on terminal, upload, Office, static or ordinary auth routes
- **THEN** it creates no additional authority and cannot select the grant verifier

#### Scenario: Issuer failure and download preservation

- **WHEN** canonical entry cannot authorize or contact its issuer
- **THEN** it fails closed without a redirect, grant or OCU request
- **WHEN** an owner uses canonical `download=1`
- **THEN** the original session-authorized attachment path is used, without issuing a grant

#### Scenario: Canonical HEAD entry and grant HEAD parity

- **WHEN** an authorized owner sends HEAD to a canonical non-download ordinary-file URL
- **THEN** the issuer authorizes the request before returning an empty302 with a relative grant Location
- **WHEN** the client sends HEAD to that grant Location
- **THEN** the final response has GET-equivalent status and file headers with no body, satisfying the confined ordinary-file GET and HEAD parity requirement

### Requirement: MIME-dependent generated-file isolation

For final non-download file responses with HTML, SVG, XHTML or XML MIME types, including MIME parameters, the gateway SHALL replace upstream CSP with sandbox allow-scripts allow-forms and set nosniff without duplicates. This SHALL cover the final grant response after canonical entry redirects, not merely the redirect. Other response types and canonical download=1 SHALL preserve upstream policy and attachment disposition. The proxy SHALL NOT emit the internal credential in responses or logs.

#### Scenario: Generated HTML and SVG

- **WHEN** an owner follows canonical entry to an HTML or SVG file carrying an upstream CSP
- **THEN** exactly the enforced sandbox CSP and nosniff reach the final browser response, including responses using always-header semantics

#### Scenario: Binary or download

- **WHEN** a response is a non-generated MIME type or canonical download=1
- **THEN** its upstream security policy and attachment disposition are preserved rather than receiving generated-document policy

## ADDED Requirements

### Requirement: Grant-only opaque-origin CORS and credential containment

Validated grant-file GET/HEAD requests with Origin:null SHALL receive Access-Control-Allow-Origin:null and Vary:Origin without Access-Control-Allow-Credentials. No grant response SHALL widen unrelated CORS or set browser cookies. Unsupported methods, including OPTIONS, SHALL return404 without OCU contact. Canonical redirects and grant responses SHALL carry no-store and no-referrer. Grants SHALL NOT be exposed in gateway/application logs, reflected diagnostic bodies, persisted application state, or internal/control credentials. Error-path logging SHALL be covered, not just successful access logs.

#### Scenario: Font module and fetch resource requests

- **WHEN** a valid grant GET/HEAD arrives with Origin:null
- **THEN** its ordinary file response permits credential-free opaque-origin reading and retains its MIME-dependent isolation policy
- **WHEN** a request targets a non-grant route or an unsupported preflight/method
- **THEN** existing CORS/method denials remain in force without grant-based authority

#### Scenario: Redirect and upstream failure diagnostics

- **WHEN** the issuer returns a grant redirect or an authorized grant request encounters an auth/upstream failure
- **THEN** responses and captured server logs contain no session/internal credentials or raw grant, except the intentional Location on successful issuance; no referrer sends that Location onward
