# Spec Delta

## ADDED Requirements

### Requirement: Office browser routes are guarded as chat-bound routes

Every request whose path begins with `/api/office/` SHALL be treated as a chat-bound route whose chat id is the path segment that follows `/api/office/`. Before any handler, session, version or filesystem work it SHALL require `Authorization: Bearer` with the internal token and a chat id that passes the same canonical normalization and rejection rules as the other chat-bound routes. No path under the prefix SHALL be exempt: a path that matches no Office handler SHALL still be rejected without the token. A sandbox-subnet peer SHALL receive 403 as on every other route. The guard SHALL NOT decide chat ownership; ownership remains the reverse proxy's decision.

#### Scenario: Missing or wrong internal token

- **WHEN** any `/api/office/{chat}/…` route, for example `POST /api/office/C/documents/F/sessions` or `GET /api/office/C/sessions/S`, is requested without the correct internal token
- **THEN** OCU returns 401 and no session, version or workspace file is read or changed

#### Scenario: Unknown path under the prefix

- **WHEN** `GET /api/office/C/unknown` is requested without the internal token
- **THEN** OCU returns 401, not 404

#### Scenario: Invalid chat identifier

- **WHEN** an `/api/office/` request with a valid internal token carries a chat id that is empty, `default`, or prefixed `temporary:`, `local:` or `channel:`, including percent-encoded variants
- **THEN** it receives a client error before handler work and no chat directory is created

#### Scenario: Authorized request reaches the handler

- **WHEN** an `/api/office/` request carries the internal token and a valid chat id
- **THEN** the guard passes it to the Office handler unchanged

#### Scenario: Sandbox peer

- **WHEN** a peer inside OCU_SANDBOX_SUBNET sends an `/api/office/` request with a valid internal token
- **THEN** it receives 403 before handler work

### Requirement: DocumentServer-facing routes authenticate without the internal token

`GET /office/source/{ticket}` and `POST /office/callback/{chat}/{session}` SHALL NOT require the internal token and SHALL NOT accept it as their credential: the internal token, alone or together with an invalid ticket or DocumentServer JWT, SHALL NOT authenticate a request to either route. `GET /office/source/{ticket}` SHALL be authenticated only by its signed, unexpired ticket. `POST /office/callback/{chat}/{session}` SHALL be authenticated only by the DocumentServer JWT carried in the request. A request that fails this authentication SHALL be rejected with a client-error status before any version content is returned and before any session, version or workspace file is changed. On both routes a transport peer in OCU_SANDBOX_SUBNET SHALL receive 403 before handler work, even when it presents a valid ticket or DocumentServer JWT, and client-supplied forwarding headers SHALL NOT bypass that denial. The `{chat}` segment of the callback route SHALL pass the canonical chat-id rules before handler work. Office editing is enabled on the OCU server when the DocumentServer server-to-server address is configured; there is no separate switch. When it is not enabled, both routes SHALL respond 404 and perform no work. Neither route SHALL appear in the reverse-proxy route table.

#### Scenario: Valid ticket without the internal token

- **WHEN** DocumentServer requests `GET /office/source/{ticket}` with a valid, unexpired ticket and no internal token
- **THEN** the guard does not reject the request for the missing token and the handler serves the content the ticket is bound to

#### Scenario: Internal token is not a substitute for a ticket

- **WHEN** `GET /office/source/{ticket}` is requested with the correct internal token and a ticket that is malformed, expired or wrongly signed
- **THEN** the request is rejected with a client error and no version content is returned

#### Scenario: Valid callback without the internal token

- **WHEN** DocumentServer posts to `/office/callback/C/S` with a valid DocumentServer JWT and no internal token
- **THEN** the guard does not reject the request for the missing token and the callback is processed

#### Scenario: Internal token is not a substitute for the DocumentServer JWT

- **WHEN** a request posts to `/office/callback/C/S` with the correct internal token and a missing or invalid DocumentServer JWT
- **THEN** the request is rejected with a client error and no session, version or workspace file is changed

#### Scenario: Sandbox peer with a valid credential

- **WHEN** a peer inside OCU_SANDBOX_SUBNET requests either route with a valid ticket or a valid DocumentServer JWT, with or without a forged X-Forwarded-For value
- **THEN** it receives 403 before handler work

#### Scenario: Invalid chat identifier on the callback

- **WHEN** a callback is posted to `/office/callback/default/S` or to a path whose chat segment is empty or prefixed `temporary:`, `local:` or `channel:`, including percent-encoded variants
- **THEN** it receives a client error before handler work, whatever JWT it carries

#### Scenario: Office editing not enabled

- **WHEN** Office editing is not enabled on the OCU server and either route is requested with any credential
- **THEN** the response is 404 and no ticket, JWT, session or file is evaluated

### Requirement: Office editing fails closed at startup without a DocumentServer secret

When Office editing is enabled on the OCU server, that is, when the DocumentServer server-to-server address is configured, the server SHALL exit non-zero before serving if the DocumentServer JWT secret is absent or blank, including the packaged multi-worker entrypoint, and SHALL name the missing setting on standard error without printing any secret value. It SHALL NOT start with Office editing silently disabled and SHALL NOT fall back to unsigned DocumentServer requests or callbacks. When Office editing is not enabled, the absence of the secret SHALL NOT prevent startup.

#### Scenario: Enabled without a secret

- **WHEN** the production startup command runs with Office editing enabled and the DocumentServer JWT secret absent, empty or whitespace-only
- **THEN** the parent process exits non-zero without a serving listener or a respawning worker loop, and standard error names the missing setting

#### Scenario: Enabled with a secret

- **WHEN** the startup command runs with Office editing enabled and a non-blank DocumentServer JWT secret
- **THEN** startup proceeds and the secret value appears in no log line

#### Scenario: Not enabled

- **WHEN** the startup command runs with Office editing not enabled and no DocumentServer JWT secret
- **THEN** startup proceeds and both DocumentServer-facing routes respond 404

## MODIFIED Requirements

### Requirement: Service authorization before protected work

Every chat-bound HTTP route, upload, preview and CDP/ttyd handshake, and the identity endpoints /system-prompt, /skill-list and /skill-mounts SHALL require the internal token before protected work, except the two DocumentServer-facing control-plane routes `GET /office/source/{ticket}` and `POST /office/callback/{chat}/{session}`, which are excepted from the internal-token rules of this requirement and SHALL authenticate as specified by the requirement "DocumentServer-facing routes authenticate without the internal token". REST and WebSocket upstream handshakes SHALL accept only Authorization Bearer with the internal token. Credentials SHALL NOT appear in URLs, responses or logs or be propagated to sandboxes. A source ticket is not such a credential: it is a short-lived capability bound to one version of one document, it MAY appear in the path of the source route and inside the signed editor configuration, and it SHALL NOT be written to logs.

#### Scenario: Missing or wrong service token

- **WHEN** any protected route is requested without the correct token
- **THEN** HTTP returns 401 or the WebSocket is rejected before upgrade, without filesystem, container or identity work

#### Scenario: Authorized requests remain useful

- **WHEN** a valid upstream service token and valid chat ID are supplied
- **THEN** route processing preserves its existing successful payload and traversal protections

#### Scenario: Public health and unrelated runtime API

- **WHEN** a non-sandbox peer requests health or the unrelated runtime-cli endpoint without a token
- **THEN** their existing public behavior remains available

#### Scenario: Source ticket is not logged

- **WHEN** DocumentServer fetches `GET /office/source/{ticket}` and the request is logged
- **THEN** the log line does not contain the ticket

#### Scenario: DocumentServer-facing routes are excepted

- **WHEN** `GET /office/source/{ticket}` is requested with a valid ticket, or `POST /office/callback/{chat}/{session}` with a valid DocumentServer JWT, and neither request carries the internal token
- **THEN** neither request is rejected for the missing internal token, and each is authenticated only as the requirement "DocumentServer-facing routes authenticate without the internal token" specifies
- **AND** every other chat-bound route, `/api/office/` included, still returns 401 without the internal token
