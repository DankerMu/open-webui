# ocu-stub Specification

## Purpose

Deterministic OCU HTTP stub and fail-loud proxy-dev launcher so later proxy smoke can run without a real OCU.

## Requirements

### Requirement: Stub serves fixture states and files

`scripts/ocu-stub.py` SHALL serve describe/launch/outputs/files/preview/heartbeat/static fixtures. Launch SHALL flip `stopped` to `running` and SHALL 409 `never_created`. Received `Authorization` and `X-Requested-With` SHALL be echoed as `X-Echo-*`. The stub SHALL NOT start containers. Describe `views` follow the parent sandbox-lifecycle rule: `["files"]`, plus `browser` and `terminal` when running.

#### Scenario: Launch flips stopped

- **WHEN** describe of the stopped fixture is `stopped` and launch is POSTed
- **THEN** the next describe is `running`

#### Scenario: Never created stays 409

- **WHEN** launch is POSTed for the never_created fixture
- **THEN** the response is 409 with `reason: never_created`

### Requirement: Launcher names missing prerequisites

`scripts/proxy-dev.sh` SHALL exit non-zero and name the missing checkout, `deploy/proxy/` config, or proxy binary. It SHALL NOT skip.

#### Scenario: Missing checkout

- **WHEN** `OCU_CHECKOUT` points at a path with no `deploy/proxy/`
- **THEN** the script exits non-zero and the message contains that path

### Requirement: Upload allocation preserves synthetic backend errors

The stub SHALL reserve the exact names `backend403` and `backend409` during upload allocation. Accepted bytes SHALL remain accessible under the returned deduplicated name and appear in that chat's outputs listing, while the bare synthetic paths retain their original errors. Existing HTML error fixture behavior SHALL remain unchanged.

#### Scenario: Synthetic errors survive same-chat uploads

- **WHEN** valid multipart uploads named `backend403` and `backend409` are submitted in a chat with no previous uploads under those names
- **THEN** the returned names are `backend403 (2)` and `backend409 (2)`
- **AND** GETs of the bare names return 403 with `backend 403` and 409 with `backend 409`
- **AND** GETs of the returned names return 200 with the exact uploaded bytes and both returned paths appear in that chat's outputs listing

#### Scenario: Existing HTML error remains reserved

- **WHEN** a valid multipart upload uses `backend-html403.html`
- **THEN** it is retrievable as `backend-html403 (2).html` without changing the bare fixture's HTML403 response
