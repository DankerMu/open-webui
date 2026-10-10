## ADDED Requirements

### Requirement: Launch error verification distinguishes engine lookup and retirement refusal

Lifecycle verification SHALL exercise an actual engine lookup failure through the explicit launch boundary and independently exercise unpause refusal. Lookup failure SHALL remain a structured status500 `launch_failed` error without engine mutation; retirement APIError SHALL remain status409 `migration_required`. Verification SHALL reject removal of the lookup translation and preserve the existing app-fixture restoration checks without asserting the fixture's own substitutions as evidence.

#### Scenario: Launch engine lookup is unavailable

- **WHEN** the Docker lookup dependency raises during an explicit launch
- **THEN** the public launch boundary raises LaunchFailed with status500 and reason `launch_failed`, and the HTTP launch route exposes that structured failure
- **AND** no sandbox is created, removed, started or unpaused

#### Scenario: Lookup translation regresses

- **WHEN** a disposable version of the launch implementation omits its engine-lookup exception translation
- **THEN** the same lookup regression case fails rather than accepting the escaping Docker exception

#### Scenario: Retirement refuses after observing a running sandbox

- **WHEN** retirement execution fails during a running launch or a restarting launch that reaches running
- **THEN** the existing migration-required status409 propagates without deletion or reclassification as launch-failed

#### Scenario: Fixture teardown retains isolation

- **WHEN** the lifecycle route tests finish using the isolated app fixture
- **THEN** its original hook/class identities and saved module state are restored through the existing teardown checks
