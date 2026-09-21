# ocu-workspace-routes Specification

## Purpose

Flag-gated owner-only describe/launch/refresh/prefs on the existing OCU router.

## Requirements

### Requirement: Flag-gated workspace routes

When `ENABLE_OCU_WORKSPACE` is true, `GET /api/v1/ocu/workspaces/{chat_id}`, `POST …/launch`, `POST …/refresh`, `PUT …/prefs` SHALL exist. When false they SHALL 404 without calling `is_chat_owner` or `OcuClient`. `GET /api/v1/ocu/auth` SHALL remain registered.

#### Scenario: Flag off

- **WHEN** the flag is false and the owner calls describe or launch
- **THEN** both return 404

### Requirement: Describe mapping and cursor

Describe SHALL use `OcuClient.describe`, SHALL NOT call launch, SHALL map D7 states, SHALL return `capabilities` (`launch` iff stopped, `refresh` iff OCU answered, `prefs` always), SHALL advance `last_seen_revision` to the broker value when OCU answered (including stopped), and SHALL return the stored cursor only on `OcuUnreachable` with `views: []`.

#### Scenario: Stopped has launch capability

- **WHEN** OCU describe returns a non-running existing state
- **THEN** the response is 200 `status: stopped` with `launch` in `capabilities` and no sandbox start

#### Scenario: Unreachable keeps cursor

- **WHEN** `OcuClient.describe` raises `OcuUnreachable` and the cursor is 5
- **THEN** the response is 200 `unavailable` / `ocu_unreachable`, `revision` 5, `views` []

### Requirement: Mutating header and launch 409

Launch, refresh and prefs SHALL require `X-Requested-With: ocu-workspace` after authentication and before the owner check. Missing header SHALL 403 with client and `is_chat_owner` uncalled. Launch `OcuNeverCreated` SHALL 409.

#### Scenario: Same-site without header

- **WHEN** a valid session calls launch without the header
- **THEN** the response is 403 and the client is not called

#### Scenario: Launch never_created

- **WHEN** `OcuClient.launch` returns `OcuNeverCreated`
- **THEN** the response is 409 and no container is assumed started
