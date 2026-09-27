# Spec Delta

## MODIFIED Requirements

### Requirement: Describe mapping and cursor

Describe SHALL use OcuClient.describe, SHALL NOT call launch, SHALL map successful D7 states, SHALL return capabilities (launch iff stopped, refresh iff a successful OCU answer, prefs always), and SHALL advance last_seen_revision only on successful broker data. On OcuUnreachable it SHALL retain200 unavailable/ocu_unreachable with stored cursor and views []. On OcuUpstreamError it SHALL return502 with only reason ocu_upstream_error and SHALL not change cursor/prefs or fabricate stopped/launch capability.

#### Scenario: Stopped has launch capability

- **WHEN** OCU describe returns a successful non-running existing state
- **THEN** the response is200 status stopped with launch capability and no sandbox start

#### Scenario: Unreachable keeps cursor

- **WHEN** OcuClient.describe raises OcuUnreachable and the cursor is5
- **THEN** the response is200 unavailable/ocu_unreachable, revision5, views []

#### Scenario: Upstream failure is not stopped

- **WHEN** describe receives an upstream HTTP failure while a higher cursor and preferences exist
- **THEN** the response is502 with only reason ocu_upstream_error and persisted state is unchanged

## ADDED Requirements

### Requirement: Mutation dependency failures remain failures

Launch and refresh SHALL return502 with only reason ocu_upstream_error for OcuUpstreamError and502 with only reason ocu_unreachable for transport failure. They SHALL not report successful launch or revision0 from a failed response. Exact launch OcuNeverCreated SHALL retain409 reason never_created. Existing401/403/404 authentication, mutating-header, ownership and flag gates SHALL retain precedence. Failed dependency calls SHALL not change stored cursor or preferences, and raw upstream details SHALL not reach the response.

#### Scenario: Launch and refresh fail safely

- **WHEN** a real route receives an upstream failure carrying a distinctive marker or a transport failure
- **THEN** it returns the documented502 reason without that marker, an unhandled exception or a successful payload
- **AND** its stored cursor and preferences remain unchanged

### Requirement: Frontend consumers observe one failure shape

The OCU frontend helper SHALL reject HTTP failures and transport failures as WorkspaceRequestError with numeric status and stable reason, never resolve null. Fetch rejection SHALL use status0/reason request_failed. HTTP401/403/404 SHALL map to unauthorized/forbidden/not_found before inspecting the body; otherwise recognized reasons SHALL be never_created, ocu_upstream_error and ocu_unreachable, with request_failed for other failures. Malformed successful JSON SHALL retain its HTTP status and reject invalid_response, including status200/invalid_response for malformed200. Raw failed body text or arbitrary detail SHALL not be copied into the error or console.

#### Scenario: Reason-only and non-JSON failure

- **WHEN** launch returns409 reason never_created, an empty/non-JSON error body, or fetch rejects
- **THEN** callers receive the stable error shape with the appropriate status/reason and no successful null
