# Spec Delta

## Purpose

Harness smoke and Verification Matrix coverage for the already-shipped `GET /api/v1/ocu/auth` owner 200 / anonymous 401 contract.

## ADDED Requirements

### Requirement: Smoke covers owner 200 and anonymous 401

`make smoke` SHALL exercise `GET /api/v1/ocu/auth` against the running harness with `ENABLE_OCU_WORKSPACE=true`. The owner row SHALL use the seed admin session and a chat that admin just created, in `smoke/api.hurl`. The anonymous row SHALL send no session and SHALL run from a separate hurl file so the signin cookie store cannot satisfy `get_verified_user`.

#### Scenario: Owner smoke

- **WHEN** `make smoke` runs after signin and `POST /api/v1/chats/new`
- **THEN** `GET /api/v1/ocu/auth` with that session and `X-Chat-Id` of the new chat returns HTTP 200, `X-User-Id` and `X-User-Email` headers, and a zero-byte body

#### Scenario: Anonymous smoke

- **WHEN** `make smoke` runs `smoke/ocu-auth-anon.hurl` with no prior signin
- **THEN** `GET /api/v1/ocu/auth` with no Authorization or Cookie returns HTTP 401 with a zero-byte body

### Requirement: Verification Matrix names the live smoke

AGENTS.md Verification Matrix SHALL have a row whose surface is `GET /api/v1/ocu/auth`, whose command is `make smoke`, and whose evidence names owner 200 and anonymous 401. The Pending row SHALL NOT list `/api/v1/ocu/auth`.

#### Scenario: Matrix row

- **WHEN** `make doc-gate` runs
- **THEN** it exits 0 and AGENTS.md documents `make smoke` for this surface
