## MODIFIED Requirements

### Requirement: Stub serves fixture states and files

`scripts/ocu-stub.py` SHALL serve describe/launch/outputs/files/preview/heartbeat/static fixtures. Launch SHALL flip `stopped` to `running` and SHALL answer 409 for `never_created` with OCU's error envelope `{"detail": {"detail": "...", "reason": "never_created"}}`. Received `Authorization` and `X-Requested-With` SHALL be echoed as `X-Echo-*`. The stub SHALL NOT start containers. Describe `views` follow the parent sandbox-lifecycle rule: `["files"]`, plus `browser` and `terminal` when running.

#### Scenario: Launch flips stopped

- **WHEN** describe of the stopped fixture is `stopped` and launch is POSTed
- **THEN** the next describe is `running`

#### Scenario: Never created stays 409

- **WHEN** launch is POSTed for the never_created fixture
- **THEN** the response is 409 with `detail.reason: never_created` in OCU's error envelope
