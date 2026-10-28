# ocu-reverse-proxy Specification

## Purpose

Provide a default-deny browser gateway that binds every OCU chat request to WebUI ownership, preserves session revocation credentials and isolates generated content without exposing internal authentication material.

## Requirements

### Requirement: Fail-loud private configuration rendering

The gateway SHALL derive routing from one reviewed method/path/auth/mutating table and SHALL reject missing credentials or invalid configuration without disclosing credential values or replacing a valid rendered configuration. Tokens SHALL use OCU's nonempty visible-ASCII domain (bytes0x21–0x7E); whitespace, control characters and non-ASCII SHALL be rejected, while accepted punctuation SHALL be preserved byte-for-byte. The rendered secret-bearing configuration SHALL be untracked and owner-readable only, and SHALL launch through the existing proxy-dev entrypoint after rendering.

#### Scenario: Missing token or configuration injection

- **WHEN** rendering receives an empty, whitespace-containing or non-ASCII token, or invalid control characters in a configuration input
- **THEN** it fails naming the variable, does not disclose its value and leaves any previous valid config unchanged

#### Scenario: Accepted token punctuation

- **WHEN** a visible-ASCII token contains accepted punctuation
- **THEN** native nginx validation succeeds and the OCU-bound Bearer credential preserves its exact bytes without disclosing them in configuration errors

#### Scenario: Native launcher compatibility

- **WHEN** valid configuration is rendered for the local WebUI harness and OCU stub
- **THEN** nginx configuration validation passes and the existing launcher starts the gateway without Docker

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

### Requirement: Distinct mutation-origin protection and WebSocket transport

Mutating rows including GET heartbeat/sessions/processes SHALL require X-Requested-With:ocu-workspace and either the exact configured Origin or Sec-Fetch-Site:same-origin. Origin:null SHALL always fail. Mutation denial SHALL return403 independently of auth-denial mapping. WS rows SHALL not require the browser-impossible custom header, SHALL preserve upgrade/cookie transport after owner authentication, and SHALL use explicit idle timeouts longer than60seconds.

#### Scenario: Opaque-origin mutation and legitimate SPA mutation

- **WHEN** Origin:null or a missing required custom header accompanies a mutating row
- **THEN** the gateway returns403 without OCU contact, not404 or an internal sentinel
- **WHEN** the owner supplies the custom header and allowed origin provenance
- **THEN** the mutation is forwarded

#### Scenario: WebSocket handshake

- **WHEN** an owner opens either listed CDP or ttyd WS path with its session cookie
- **THEN** the upstream receives an authenticated upgrade and cookie without requiring X-Requested-With

### Requirement: MIME-dependent generated-file isolation

For final non-download file responses with HTML, SVG, XHTML or XML MIME types, including MIME parameters, the gateway SHALL replace upstream CSP with sandbox allow-scripts allow-forms and set nosniff without duplicates. This SHALL cover the final grant response after canonical entry redirects, not merely the redirect. Other response types and canonical download=1 SHALL preserve upstream policy and attachment disposition. The proxy SHALL NOT emit the internal credential in responses or logs.

#### Scenario: Generated HTML and SVG

- **WHEN** an owner follows canonical entry to an HTML or SVG file carrying an upstream CSP
- **THEN** exactly the enforced sandbox CSP and nosniff reach the final browser response, including responses using always-header semantics

#### Scenario: Binary or download

- **WHEN** a response is a non-generated MIME type or canonical download=1
- **THEN** its upstream security policy and attachment disposition are preserved rather than receiving generated-document policy

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

### Requirement: Every deployment start restarts the proxy last

After `deploy/up.sh` has started the core, WebUI and proxy snapshots successfully, it SHALL restart the proxy and Messages ingress services with the same Compose project, project directory, env file and snapshot, so that nginx in both resolves its upstreams against the backend containers of this run. It SHALL log `deploy: proxy and messages-ingress restarted for` and the proxy snapshot path on stderr. A failed restart SHALL end `up.sh` with a non-zero exit and a message naming the proxy snapshot. A failed core or WebUI start SHALL neither start nor restart the proxy or the ingress.

#### Scenario: Upgrade recreates the backends

- **WHEN** `deploy/up.sh` runs and the core and WebUI starts recreate `computer-use-server`, `documentserver` and `open-webui` while the proxy and ingress containers are unchanged
- **THEN** after the proxy snapshot `up`, `up.sh` restarts `proxy` and `messages-ingress`, logs `deploy: proxy and messages-ingress restarted for` with the proxy snapshot path, and exits 0

#### Scenario: Proxy restart fails

- **WHEN** the restart exits non-zero
- **THEN** `up.sh` exits non-zero with `deploy: proxy and messages-ingress restart failed for` and the proxy snapshot path, and removes its temporary configs
