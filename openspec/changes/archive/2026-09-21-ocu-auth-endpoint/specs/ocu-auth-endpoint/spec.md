# Spec Delta

## Purpose

Gives the reverse proxy a WebUI session-mode authorization subrequest that answers only 200, 401 or 403 with an empty body, so nginx `auth_request` never sees a 404 and never forwards a non-owner to OCU.

## ADDED Requirements

### Requirement: Auth endpoint status matrix

`GET /api/v1/ocu/auth` SHALL be registered regardless of `ENABLE_OCU_WORKSPACE`. It SHALL authenticate via `get_verified_user` (cookie or bearer). It SHALL read the chat id only from the `X-Chat-Id` request header. On success it SHALL return 200 with response headers `X-User-Id` and `X-User-Email` and a zero-byte body. It SHALL return 401 when there is no valid session. It SHALL return 403 for every other failure, including a missing header, an invalid chat id, a non-owner, a non-existent chat, and `ENABLE_OCU_WORKSPACE=false`. Every 200, 401 and 403 response SHALL have a zero-byte body. Empty-body handling SHALL be local to this endpoint and SHALL NOT change other routes' auth or error responses. It SHALL NOT return 404. It SHALL NOT call OCU. It SHALL NOT create, start or touch a sandbox.

#### Scenario: Owner subrequest

- **WHEN** the proxy calls the endpoint with A's session cookie and `X-Chat-Id: C` where A owns C and the flag is on
- **THEN** the response is 200 with `X-User-Id` equal to A's id, `X-User-Email` equal to A's email, and a zero-byte body

#### Scenario: Anonymous request

- **WHEN** a request without a valid WebUI session reaches the endpoint
- **THEN** the response is 401 with a zero-byte body

#### Scenario: Shared, folder, admin or missing chat

- **WHEN** an authenticated user who does not own chat C (share link, folder grant, or admin role) or who names a non-existent id calls the endpoint with `X-Chat-Id: C`
- **THEN** the response is 403 with a zero-byte body

#### Scenario: Missing header

- **WHEN** the endpoint is called with a valid session but no `X-Chat-Id` header
- **THEN** the response is 403 with a zero-byte body

#### Scenario: Flag off

- **WHEN** `ENABLE_OCU_WORKSPACE` is false and the owner's session calls the endpoint with `X-Chat-Id: C`
- **THEN** the response is 403 with a zero-byte body (never 404)

### Requirement: Invalid chat id short-circuits before ownership lookup

The endpoint SHALL reject chat ids that fail `is_saved_chat_id(chat_id) and chat_id != "default"` (upstream `utils/chat_id.py` is not modified): empty, `"default"`, and ids prefixed `temporary:`, `local:` or `channel:`. For those ids it SHALL return 403 with a zero-byte body and SHALL call `Chats.is_chat_owner` zero times.

#### Scenario: Invalid chat id

- **WHEN** the endpoint receives `X-Chat-Id` equal to `"temporary:abc"`, `"local:abc"`, `"channel:abc"`, `""` or `"default"`
- **THEN** the response is 403 with a zero-byte body and `Chats.is_chat_owner` is called zero times

### Requirement: Harness enables the flag

The harness SHALL set `ENABLE_OCU_WORKSPACE=true` so later smoke and e2e exercise the endpoint. The application default SHALL remain false.

#### Scenario: Harness flag

- **WHEN** `scripts/dev-bg.sh` starts the backend
- **THEN** `ENABLE_OCU_WORKSPACE` is true in that process environment
