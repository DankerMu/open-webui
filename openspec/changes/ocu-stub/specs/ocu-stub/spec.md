# Spec Delta

## Purpose

Deterministic OCU HTTP stub and fail-loud proxy-dev launcher so later proxy smoke can run without a real OCU.

## ADDED Requirements

### Requirement: Stub serves fixture states and files

`scripts/ocu-stub.py` SHALL serve describe/launch/outputs/files/preview/heartbeat/static fixtures. Launch SHALL flip `stopped` to `running` and SHALL 409 `never_created`. Received `Authorization` and `X-Requested-With` SHALL be echoed as `X-Echo-*`. The stub SHALL NOT start containers.

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
