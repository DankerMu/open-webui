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

Only reviewed method/path rows SHALL reach OCU. Static asset paths SHALL retain /ocu/static upstream; chat paths SHALL strip exactly /ocu, and the authorized chat identity SHALL equal the forwarded chat identity. Query strings and encoded filename characters SHALL retain their meaning. Ambiguous separators, traversal and double-decoding forms SHALL be rejected without contacting OCU. Unlisted paths/methods SHALL return404.

#### Scenario: Allowed owner request and nested static asset

- **WHEN** an authorized owner requests a listed chat row or a session requests a nested static asset
- **THEN** the request reaches the correct unprefixed chat path or prefixed static path respectively

#### Scenario: Hidden endpoint and traversal

- **WHEN** a client requests OCU health, docs, MCP, identity, internal routes, an unlisted method or an ambiguous traversal path
- **THEN** the gateway returns404 without contacting OCU

#### Scenario: Encoded filename and query

- **WHEN** an owner requests a nested file whose name includes encoded space, hash, plus or percent with a query string
- **THEN** forwarding preserves filename and query meaning without changing the chat being authorized

### Requirement: Cookie authentication and authoritative headers

Every chat request including WS handshake SHALL pass cookie owner authentication through WebUI /api/v1/ocu/auth with route-derived X-Chat-Id. Static rows SHALL use session-only /api/v1/auths/. Auth401 SHALL remain401 and auth403 SHALL become404; unexpected auth responses SHALL fail closed. Client identity/credential headers SHALL NOT determine OCU identity. OCU-bound requests SHALL receive the internal Bearer credential, chat auth response identity copied verbatim, and the captured cookie for WS; static identity headers SHALL be cleared. Internal auth locations SHALL not be directly accessible. OCU-origin error statuses SHALL remain unchanged.

#### Scenario: Anonymous, foreign chat and forged headers

- **WHEN** an anonymous client or foreign-chat user sends forged identity headers
- **THEN** the gateway denies401 or404 respectively before OCU contact
- **WHEN** an owner sends forged identity headers
- **THEN** OCU receives only the server-derived identity and internal Bearer credential

#### Scenario: Static session and upstream error

- **WHEN** a valid session requests static content
- **THEN** the proxy forwards without client-supplied identity headers
- **WHEN** an authorized OCU request returns403 or409
- **THEN** that upstream status is preserved, not mapped as an auth denial

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

For non-download file responses with HTML, SVG, XHTML or XML MIME types, including MIME parameters, the gateway SHALL replace upstream CSP with sandbox allow-scripts allow-forms and set nosniff without duplicates. Other response types and download=1 SHALL preserve upstream policy and attachment disposition. The proxy SHALL NOT emit the internal credential in its own responses or default logs.

#### Scenario: Generated HTML and SVG

- **WHEN** an owner retrieves an HTML or SVG file carrying an upstream CSP
- **THEN** exactly the enforced sandbox CSP and nosniff reach the browser, including responses using always-header semantics

#### Scenario: Binary or download

- **WHEN** a response is a non-generated MIME type or download=1
- **THEN** its upstream security policy and attachment disposition are preserved rather than receiving generated-document policy
