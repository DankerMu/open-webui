# Spec Delta

## MODIFIED Requirements

### Requirement: Describe mapping and cursor

Describe SHALL use OcuClient.describe, SHALL NOT call launch, SHALL map successful D7 states, SHALL return capabilities (launch iff stopped, refresh iff a successful OCU answer, prefs always), and SHALL advance last_seen_revision only on successful broker data. Every authorized200 describe response SHALL include nested `prefs` from that chat's persisted WebUI preference object, preserving existing `view`, `selected_file_id`, `open` keys, missing keys and explicit null values; absent stored preferences SHALL yield `{}`. Preferences SHALL NOT come from OCU metadata and describe SHALL NOT mutate them. On OcuUnreachable it SHALL retain200 unavailable/ocu_unreachable with stored cursor and views [], including local prefs or `{}` when no row exists. On OcuUpstreamError it SHALL return502 with only reason ocu_upstream_error and SHALL not change cursor/prefs or fabricate stopped/launch capability. Existing authorization and feature gates SHALL prevent preference disclosure.

#### Scenario: Stopped has launch capability

- **WHEN** OCU describe returns a successful non-running existing state
- **THEN** the response is200 status stopped with launch capability and no sandbox start

#### Scenario: Unreachable keeps cursor

- **WHEN** OcuClient.describe raises OcuUnreachable and the cursor is5
- **THEN** the response is200 unavailable/ocu_unreachable, revision5, views [] and the stored preference object

#### Scenario: Upstream failure is not stopped

- **WHEN** describe receives an upstream HTTP failure while a higher cursor and preferences exist
- **THEN** the response is502 with only reason ocu_upstream_error and persisted state is unchanged

#### Scenario: Persisted preferences survive independent reads

- **WHEN** an owner writes preferences through PUT /prefs and an independent client describes that chat while OCU reports running, stopped or never-created
- **THEN** describe includes exactly the current stored prefs, advances only the existing cursor contract and does not call launch
- **AND** a later preference replacement including `selected_file_id: null` is returned without stale values or synthesized defaults

#### Scenario: Local storage overrides upstream metadata

- **WHEN** successful OCU metadata includes a conflicting prefs object
- **THEN** describe exposes only the authorized chat's WebUI prefs and leaves them unchanged in storage

#### Scenario: No preference row

- **WHEN** a saved owner chat has no preference row and describe succeeds or OCU is unreachable
- **THEN** its response contains `prefs: {}` and no sandbox is started
- **AND** the unreachable read does not create a local state row

#### Scenario: Foreign and anonymous callers cannot read preferences

- **WHEN** an anonymous caller, foreign owner or flag-disabled request describes a chat with stored preferences
- **THEN** existing401/404 responses remain and contain no prefs; owner and dependency access retain existing gate precedence
