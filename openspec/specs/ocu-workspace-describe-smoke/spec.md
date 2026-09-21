# ocu-workspace-describe-smoke Specification

## Purpose

Harness smoke and Verification Matrix coverage for the already-shipped `GET /api/v1/ocu/workspaces/{chat_id}` owner 200 / foreign-chat 404 contract.

## Requirements

### Requirement: Smoke covers owner 200 and foreign-chat 404

`make smoke` SHALL exercise `GET /api/v1/ocu/workspaces/{chat_id}` against the running harness with `ENABLE_OCU_WORKSPACE=true`. The owner row SHALL use the seed admin session and a chat that admin just created, in `smoke/api.hurl`. The foreign-chat row SHALL use the same session and a chat id that is not that admin's. When OCU is unreachable the owner row SHALL still be HTTP 200 (mapped `unavailable`).

#### Scenario: Owner smoke

- **WHEN** `make smoke` runs after signin and `POST /api/v1/chats/new`
- **THEN** `GET /api/v1/ocu/workspaces/{chat_id}` with that session returns HTTP 200 and a JSON body with `status`

#### Scenario: Foreign chat smoke

- **WHEN** `make smoke` runs `GET /api/v1/ocu/workspaces/not-a-real-chat-id` with the seed admin session
- **THEN** the response is HTTP 404

### Requirement: Verification Matrix names the live smoke

AGENTS.md Verification Matrix SHALL have a row whose surface is `GET /api/v1/ocu/workspaces/{chat_id}`, whose command is `make smoke`, and whose evidence names owner 200 and foreign-chat 404. The Pending row SHALL NOT list that path.

#### Scenario: Matrix row

- **WHEN** `make doc-gate` runs
- **THEN** it exits 0 and AGENTS.md documents `make smoke` for this surface
