# Spec Delta

## ADDED Requirements

### Requirement: Office broker rows

The reviewed route table SHALL contain exactly these seven Office broker rows under the `/ocu` prefix, each with chat authentication and the prefix stripped before forwarding:

| Method | Path after `/ocu`                               | Mutating |
| ------ | ----------------------------------------------- | -------- |
| POST   | `/api/office/{chat}/documents/{file}/sessions`  | yes      |
| GET    | `/api/office/{chat}/sessions/{session}`         | no       |
| POST   | `/api/office/{chat}/sessions/{session}/save`    | yes      |
| POST   | `/api/office/{chat}/sessions/{session}/close`   | yes      |
| POST   | `/api/office/{chat}/sessions/{session}/resolve` | yes      |
| GET    | `/api/office/{chat}/documents/{file}/versions`  | no       |
| POST   | `/api/office/{chat}/documents/{file}/restore`   | yes      |

Each row SHALL pass the same owner authentication as every other chat row, with the chat identity taken from the `{chat}` segment and equal to the forwarded chat identity. The five POST rows SHALL be subject to the existing mutation-origin guard; the two GET rows SHALL NOT require the custom header. The placeholders `{file}` and `{session}` SHALL each match exactly one non-empty path segment and SHALL be accepted only in a row that also carries `{chat}`. The existing rejection of traversal, ambiguous separators and double-decoding forms SHALL apply to these segments without contacting OCU. Any other method or path under `/ocu/api/office/` SHALL return 404 without contacting OCU. A route table that differs from the reviewed inventory SHALL fail rendering and leave any previous valid configuration unchanged.

#### Scenario: Owner request on an Office row

- **WHEN** the owner of a chat requests any of the seven rows, supplying the custom header and allowed origin provenance on the POST rows
- **THEN** OCU receives the request at the unprefixed path with the internal Bearer credential and the server-derived chat identity

#### Scenario: Anonymous or foreign-chat request

- **WHEN** an anonymous client or a user who does not own the chat requests an Office row
- **THEN** the gateway returns 401 or 404 respectively without contacting OCU

#### Scenario: Office mutation without origin proof

- **WHEN** a POST Office row arrives with `Origin: null` or without the required custom header
- **THEN** the gateway returns 403 without contacting OCU

#### Scenario: Office read rows need no custom header

- **WHEN** the owner sends GET for a session's status or a document's versions without the custom header
- **THEN** the request is forwarded

#### Scenario: Placeholder spans one segment only

- **WHEN** the `{file}` or `{session}` position holds an empty segment, an extra segment, an encoded slash or backslash, a dot segment or a double-encoded form
- **THEN** the gateway returns 404 without contacting OCU

#### Scenario: Unlisted Office method or path

- **WHEN** a client sends GET to a POST-only Office row, POST to a GET-only Office row, or any request to an Office path that is not one of the seven rows
- **THEN** the gateway returns 404 without contacting OCU

#### Scenario: Unreviewed table or placeholder outside a chat row

- **WHEN** the route table gains, loses or alters a row without matching the reviewed inventory, or a row uses `{file}` or `{session}` without `{chat}`
- **THEN** rendering fails and any previous valid configuration is left unchanged

### Requirement: Control-plane Office and import routes are never proxied

The gateway SHALL NOT forward any request to the DocumentServer-facing control-plane routes `/office/source/{ticket}` and `/office/callback/{chat}/{session}`, or to the internal attachment-import listing `GET /api/uploads/{chat}/imports`. A browser request for any of them, with or without the `/ocu` prefix, by any user including the chat owner, SHALL NOT reach OCU; under the `/ocu` prefix the response SHALL be 404.

#### Scenario: Source and callback routes through the gateway

- **WHEN** any client, including an authenticated chat owner, requests `/ocu/office/source/{ticket}` or `/ocu/office/callback/{chat}/{session}` with any method
- **THEN** the gateway returns 404 without contacting OCU

#### Scenario: Import listing through the gateway

- **WHEN** the owner of a chat sends GET to `/ocu/api/uploads/{chat}/imports`
- **THEN** the gateway returns 404 without contacting OCU

### Requirement: Upload read rows removed

The route table SHALL NOT contain the upload manifest row or the upload list row. `GET /ocu/api/uploads/{chat}/manifest` and `GET /ocu/api/uploads/{chat}/list` SHALL return 404 without contacting OCU, for the chat owner as for anyone else. The upload row `POST /ocu/api/uploads/{chat}/{path}` SHALL remain, with chat authentication and the mutation-origin guard unchanged.

#### Scenario: Removed read rows

- **WHEN** the owner of a chat sends GET to the former manifest or list path
- **THEN** the gateway returns 404 without contacting OCU

#### Scenario: Upload still accepted

- **WHEN** the owner sends POST to `/ocu/api/uploads/{chat}/{path}` with the custom header and allowed origin provenance
- **THEN** the upload is forwarded to OCU at the unprefixed path with the server-derived chat identity

#### Scenario: POST to a former read path is an upload

- **WHEN** the owner sends a guarded POST to `/ocu/api/uploads/{chat}/manifest`
- **THEN** it is handled by the upload row as an upload of a file with that name, and nothing is read back

### Requirement: DocumentServer listener

The gateway SHALL serve a second listener, on its own listen address, that forwards to DocumentServer on its control-plane address. This listener is not derived from the route table and has no chat rows. Every request on it, including a WebSocket handshake, SHALL pass session-only authentication through WebUI `/api/v1/auths/` using the browser's cookie. Auth 401 SHALL remain 401; any other non-success authentication outcome, including an unreachable or failing WebUI, SHALL deny the request without contacting DocumentServer. The listener SHALL preserve WebSocket upgrade with explicit idle timeouts longer than 60 seconds. It SHALL forward the browser-facing host, port and scheme of the DocumentServer origin so that URLs DocumentServer builds point back to this listener. DocumentServer-bound requests SHALL NOT carry the internal Bearer credential, the internal token header, chat or user identity headers, or the WebUI session cookie, which is used for the authentication subrequest only; client-supplied copies of those identity headers SHALL be cleared. Internal authentication locations SHALL NOT be directly accessible on this listener. The listener's listen address and DocumentServer upstream SHALL be render inputs under the existing fail-loud contract.

#### Scenario: Signed-in request

- **WHEN** a browser with a valid WebUI session cookie requests a DocumentServer path on the second listener
- **THEN** the request reaches DocumentServer with the same path and query

#### Scenario: Anonymous request

- **WHEN** a client without a valid session requests any path on the second listener
- **THEN** the gateway returns 401 without contacting DocumentServer

#### Scenario: Unexpected authentication outcome

- **WHEN** the authentication request returns a status other than success or 401, or WebUI cannot be reached
- **THEN** the request is denied and DocumentServer receives nothing

#### Scenario: WebSocket to the editor

- **WHEN** a signed-in browser opens a DocumentServer WebSocket on the second listener and the connection stays idle for more than 60 seconds
- **THEN** DocumentServer receives an authenticated upgrade and the connection is not closed by the gateway's idle timeout

#### Scenario: Anonymous WebSocket handshake

- **WHEN** a client without a valid session attempts a WebSocket handshake on the second listener
- **THEN** the gateway returns 401 and no upgrade reaches DocumentServer

#### Scenario: No OCU credential or identity reaches DocumentServer

- **WHEN** a signed-in client sends a request on the second listener with forged chat and user identity headers
- **THEN** DocumentServer receives neither the internal Bearer credential, nor the internal token header, nor any chat or user identity header, nor the WebUI session cookie

#### Scenario: Public URLs built by DocumentServer

- **WHEN** DocumentServer builds an absolute URL from the forwarded request
- **THEN** the URL uses the browser-facing DocumentServer origin, not a control-plane address or the WebUI origin

#### Scenario: Missing DocumentServer render input

- **WHEN** rendering receives a missing or invalid DocumentServer upstream or second listen address
- **THEN** it fails naming the variable and leaves any previous valid configuration unchanged

### Requirement: Listener separation

The two listeners SHALL NOT forward to each other's upstreams. The OCU gateway listener SHALL never forward a request to DocumentServer, whatever its path. The DocumentServer listener SHALL never forward a request to OCU or to WebUI's application paths; WebUI is contacted on that listener only for the authentication subrequest.

#### Scenario: OCU path on the DocumentServer listener

- **WHEN** a signed-in client requests `/ocu/api/outputs/{chat}`, an Office broker row or `/office/callback/{chat}/{session}` on the DocumentServer listener
- **THEN** OCU receives no request

#### Scenario: WebUI path on the DocumentServer listener

- **WHEN** a signed-in client requests a WebUI page or API path on the DocumentServer listener
- **THEN** WebUI receives no request other than the authentication subrequest

#### Scenario: DocumentServer path on the OCU gateway listener

- **WHEN** a client requests a DocumentServer path on the OCU gateway listener
- **THEN** DocumentServer receives no request

## MODIFIED Requirements

### Requirement: Fail-loud private configuration rendering

The gateway SHALL derive the routing of its OCU gateway listener from one reviewed method/path/auth/mutating table and SHALL reject missing credentials or invalid configuration without disclosing credential values or replacing a valid rendered configuration. The DocumentServer listener is a fixed single-upstream pass-through that is not derived from that table: its rendered form SHALL be part of the reviewed renderer, and rendering SHALL fail when its inputs are missing or invalid. Tokens SHALL use OCU's nonempty visible-ASCII domain (bytes0x21–0x7E); whitespace, control characters and non-ASCII SHALL be rejected, while accepted punctuation SHALL be preserved byte-for-byte. The rendered secret-bearing configuration SHALL be untracked and owner-readable only, and SHALL launch through the existing proxy-dev entrypoint after rendering.

#### Scenario: Missing token or configuration injection

- **WHEN** rendering receives an empty, whitespace-containing or non-ASCII token, or invalid control characters in a configuration input
- **THEN** it fails naming the variable, does not disclose its value and leaves any previous valid config unchanged

#### Scenario: Accepted token punctuation

- **WHEN** a visible-ASCII token contains accepted punctuation
- **THEN** native nginx validation succeeds and the OCU-bound Bearer credential preserves its exact bytes without disclosing them in configuration errors

#### Scenario: Native launcher compatibility

- **WHEN** valid configuration is rendered for the local WebUI harness and OCU stub
- **THEN** nginx configuration validation passes and the existing launcher starts the gateway without Docker

#### Scenario: DocumentServer listener is rendered outside the table

- **WHEN** valid configuration is rendered with the DocumentServer upstream and the second listen address supplied
- **THEN** every route of the OCU gateway listener comes from the reviewed table, and the DocumentServer listener is rendered by the reviewed renderer as a pass-through to exactly one upstream, with no route taken from the table
- **AND** when the DocumentServer upstream or the second listen address is missing or invalid, rendering fails naming the variable and leaves any previous valid configuration unchanged
