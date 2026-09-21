# Spec Delta

## Purpose

WebUI-side workspace API for OCU: describe, launch, refresh, prefs and the internal auth endpoint, with owner-only authorization, chat_id validity rules and per-chat state persistence. Source: Plan 1 § 1; design D3, D4, D9, D10, D11, D14.

## ADDED Requirements

### Requirement: Owner-only authorization predicate

Every workspace route and the auth endpoint SHALL decide authorization with `Chats.is_chat_owner(chat_id, user.id)` and nothing else. Shared chats, shared folders, public share links, folder read grants and admin role SHALL NOT grant workspace access.

#### Scenario: Owner is authorized

- **WHEN** user A owns chat C and calls `GET /api/v1/ocu/workspaces/C`
- **THEN** the response is 200 with the workspace description

#### Scenario: Shared chat is not authorization (A-T08)

- **WHEN** user B has read access to A's chat C through a share link, a shared folder or `AccessGrants(shared_chat, read)` and calls any `/api/v1/ocu/workspaces/C*` route
- **THEN** the response is 404 with no workspace information in the body

#### Scenario: Admin is not authorization (A-T08)

- **WHEN** an admin user who does not own chat C calls any `/api/v1/ocu/workspaces/C*` route or `GET /api/v1/ocu/auth` with `X-Chat-Id: C`
- **THEN** the workspace routes return 404 and the auth endpoint returns 403

#### Scenario: Anonymous request (A-T08)

- **WHEN** a request without a valid WebUI session reaches the auth endpoint or, with `ENABLE_OCU_WORKSPACE` on, any workspace route
- **THEN** the response is 401 (with the flag off the workspace routes are unregistered and answer 404 to everyone)

### Requirement: Unified status semantics

Workspace routes SHALL return 401 for missing/invalid session, 403 for a mutating request that lacks the `X-Requested-With: ocu-workspace` header (design D4), 404 for both "not owner" and "does not exist" so that existence is not disclosed, 409 for an owner action the sandbox state does not permit (launch on a chat that never had a container), and 422 for an invalid body.

#### Scenario: Non-existent chat

- **WHEN** an authenticated user requests `/api/v1/ocu/workspaces/{id}` for an id that does not exist
- **THEN** the response is 404, identical in shape to the not-owner response

#### Scenario: Launch before first container

- **WHEN** the owner calls `POST /launch` on a chat for which OCU has neither a container nor a `.meta.json`
- **THEN** the response is 409 with `reason: never_created` and no container is created

### Requirement: chat_id validity

Routes SHALL reject chat_ids that fail the fork-side predicate `is_saved_chat_id(chat_id) and chat_id != "default"` (upstream `utils/chat_id.py` is not modified): empty, `default`, and ids prefixed `temporary:`, `local:` or `channel:` (A-T12).

#### Scenario: Invalid chat id short-circuits

- **WHEN** any workspace route or the auth endpoint receives `chat_id` equal to `"temporary:abc"`, `"local:abc"`, `"channel:abc"`, `""` or `"default"`
- **THEN** workspace routes return 404 and the auth endpoint returns 403, and `Chats.is_chat_owner` and the OCU client are called zero times

### Requirement: Internal auth endpoint for the reverse proxy

`GET /api/v1/ocu/auth` SHALL be registered regardless of `ENABLE_OCU_WORKSPACE`; it SHALL read the user from the WebUI session and the chat id from the `X-Chat-Id` request header only (design D3); it SHALL return only 200, 401 or 403, SHALL carry `X-User-Id` and `X-User-Email` response headers on 200, SHALL have an empty body, and SHALL have no side effects.

#### Scenario: Owner subrequest

- **WHEN** the proxy calls the endpoint with A's session cookie and `X-Chat-Id: C` where A owns C and the flag is on
- **THEN** the response is 200 with `X-User-Id: <A.id>` and `X-User-Email: <A.email>` and an empty body

#### Scenario: Missing header

- **WHEN** the endpoint is called with a valid session but no `X-Chat-Id` header
- **THEN** the response is 403

#### Scenario: Flag off

- **WHEN** `ENABLE_OCU_WORKSPACE` is false and the owner's session calls the endpoint with `X-Chat-Id: C`
- **THEN** the response is 403 (never 404, so nginx `auth_request` never turns it into 500)

#### Scenario: No sandbox side effect

- **WHEN** the endpoint returns 200 for a chat whose sandbox is stopped or absent
- **THEN** no container is created or started

### Requirement: Feature flag gates the workspace routes

When `ENABLE_OCU_WORKSPACE` is false the four `/api/v1/ocu/workspaces/*` routes SHALL NOT be registered (every request to them is 404) and the sidebar button SHALL be absent; when true they SHALL be registered. The harness SHALL set the flag to true.

#### Scenario: Flag off routes

- **WHEN** the flag is false and the owner calls `GET /workspaces/C` or `POST /workspaces/C/launch`
- **THEN** both return 404

### Requirement: Describe route never starts a sandbox

`GET /api/v1/ocu/workspaces/{chat_id}` SHALL return `chat_id`, `status ∈ {unavailable, stopped, running}` and, when unavailable, `reason ∈ {never_created, ocu_unreachable}` (design D7 mapping obtained from OCU's internal `GET /internal/describe/{chat_id}`: `running` → running; any other existing container state, or absent with `.meta.json` → stopped; no container and no meta → unavailable / never_created; OCU not answering → unavailable / ocu_unreachable), `capabilities` (WebUI-derived actions: `launch` iff stopped, `refresh` iff OCU answered, `prefs` always), `revision`, `views`, `base_url` and optional `cli_badge`; SHALL NOT include a file list; SHALL NOT create or start a sandbox (A-T06, A-T15).

#### Scenario: Stopped sandbox description

- **WHEN** the owner opens a history chat whose sandbox was stopped by retention
- **THEN** the description returns `status: stopped` with the broker's `revision` (cursor advanced), files remain readable through the gateway, and the sandbox stays stopped

#### Scenario: Paused container reads as stopped

- **WHEN** the container is in Docker state `paused` or `created`
- **THEN** the description returns `status: stopped`

#### Scenario: OCU unreachable

- **WHEN** OCU does not answer the internal describe call (connection refused or timeout)
- **THEN** the response is 200 with `status: unavailable`, `reason: ocu_unreachable`, `views: []` and `revision` equal to the stored cursor; the harness without OCU observes exactly this

#### Scenario: CLI badge comes from WebUI

- **WHEN** the SPA needs the sub-agent CLI badge that OCU exposes at `/api/runtime/cli`
- **THEN** it reads `cli_badge` from the describe response; `/api/runtime/cli` is never proxied

### Requirement: Revision cursor

`ocu_chat_state.last_seen_revision` SHALL be a read cursor: the describe route SHALL return the OCU broker's `revision` when OCU answers and SHALL advance the cursor to it; when OCU is unreachable it SHALL return the cursor; a stopped container is not a reason to return the cursor, because the internal describe reads the broker index. The broker value SHALL always win on divergence (design D11).

#### Scenario: Cursor behind broker

- **WHEN** the cursor is 5 and the OCU broker reports 7
- **THEN** describe returns `revision: 7` and the stored cursor becomes 7

### Requirement: Launch is the only WebUI-side start route

`POST /api/v1/ocu/workspaces/{chat_id}/launch` SHALL be the only WebUI route that starts or resumes a stopped sandbox, executed through OCU's internal launch under the per-chat lock (design D7 matrix). The proxied `/terminal/{chat_id}/restart-container` and `resurrect-container` rows are thin aliases of that same internal launch (same lock, same owner check via `auth_request`, same state matrix); no other path, user-facing or internal, restarts a stopped or otherwise existing container. First creation of a chat's container by the tool path on the first message (design D7, absent + no meta row) is unaffected.

#### Scenario: Explicit launch after retention stop (A-T15)

- **WHEN** the owner calls `/launch` on a sandbox stopped at 168 h
- **THEN** the sandbox starts with its volume intact and the response reports `status: running`

### Requirement: Refresh is rate-limited metadata only

`POST /api/v1/ocu/workspaces/{chat_id}/refresh` SHALL call OCU's outputs listing `GET /api/outputs/{chat_id}` with the internal token (the listing performs the broker reconcile, design D11), SHALL return the resulting `revision` and advance the cursor, SHALL be rate-limited per chat (1 per 2 s, burst 3), and SHALL NOT feed any file content into the LLM context.

#### Scenario: Burst refresh

- **WHEN** the owner sends 5 refresh requests within one second
- **THEN** the first 3 return 200 and the rest return 429 with `Retry-After`

### Requirement: Preferences route

`PUT /api/v1/ocu/workspaces/{chat_id}/prefs` SHALL accept only the object `{view?: "files"|"browser"|"terminal", selected_file_id?: string, open?: boolean}` of at most 2 KiB, SHALL reject unknown keys or oversize bodies with 422, SHALL be owner-only with the same 401/404 semantics as the other routes, and SHALL store the object in `ocu_chat_state.prefs`.

#### Scenario: Owner writes prefs

- **WHEN** the owner sends `{"view":"terminal","selected_file_id":"f1"}`
- **THEN** the response is 200 and a following describe-driven reload restores the Terminal view and file `f1`

#### Scenario: Non-owner and anonymous

- **WHEN** user B or an anonymous client sends a prefs body for A's chat
- **THEN** the responses are 404 and 401 respectively and nothing is stored

#### Scenario: Unknown key

- **WHEN** the body contains `{"token":"x"}` or exceeds 2 KiB
- **THEN** the response is 422 and nothing is stored

### Requirement: Mutating routes require the workspace client header

`POST …/launch`, `POST …/refresh` and `PUT …/prefs` SHALL require the request header `X-Requested-With: ocu-workspace`, checked after authentication and before the owner check; a request without it SHALL receive 403 and SHALL call neither `is_chat_owner` nor the OCU client (design D4). `src/lib/apis/ocu/` SHALL send the header on every call.

#### Scenario: Generated page cannot launch

- **WHEN** JS inside an opaque-origin generated page issues `fetch('/api/v1/ocu/workspaces/C/launch', {method:'POST', mode:'no-cors'})`, or a preflighted request carrying the header from `Origin: null`
- **THEN** the route answers 401 in both shapes (an opaque origin sends no `SameSite=Lax` cookie, so neither reaches the header check), and no sandbox is started

#### Scenario: Same-site caller without the header

- **WHEN** a request with a valid session cookie but without `X-Requested-With: ocu-workspace` reaches launch, refresh or prefs
- **THEN** the route answers 403 before the owner check and calls neither `is_chat_owner` nor the OCU client

#### Scenario: Client sends the header

- **WHEN** the sidebar's API client calls launch, refresh or prefs with a valid session
- **THEN** the header is present and the request proceeds to the owner check

### Requirement: Per-chat state persistence

The fork SHALL persist per-chat workspace state in table `ocu_chat_state(chat_id PK, last_seen_revision, prefs JSON, updated_at)` via one additive Alembic migration without a foreign-key constraint (design D14); the migration SHALL round-trip under `make db-verify`; deleting a chat SHALL leave no readable state (design D14).

#### Scenario: Preferences survive reload

- **WHEN** the owner selects the Terminal view and a file, reloads the page and reopens the chat
- **THEN** the sidebar restores the same view and file from `ocu_chat_state.prefs`

#### Scenario: Chat deletion

- **WHEN** chat C is deleted
- **THEN** every workspace route for C returns 404 for every user; the orphan row, if any, is unreadable through the API and is pruned by the backup/restore procedure; OCU data on disk is kept per retention policy

#### Scenario: Branch or clone does not inherit

- **WHEN** chat C is branched or cloned into C2
- **THEN** C2 has no `ocu_chat_state` row and no workspace until its owner uses it
