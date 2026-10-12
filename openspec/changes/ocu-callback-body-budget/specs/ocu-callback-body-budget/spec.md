# Spec Delta

## ADDED Requirements

### Requirement: Header-first bounded callback admission

The DocumentServer callback admission owner SHALL treat any present Authorization header as authoritative, verifying it by the existing rules without reading or streaming the body or parsing body JSON. Only requests without Authorization SHALL enter body-token admission. That branch SHALL count actual raw bytes and accept at most 1,048,576 bytes inclusively, checking before appending a chunk that would exceed the bound. Overflow SHALL immediately return HTTP 413 with `{"error":1,"reason":"callback_body_too_large"}`, without parsing the oversized JSON, requesting further body chunks, downloading, persisting, publishing or mutating Office state. Content-Length SHALL NOT replace actual byte counting.

#### Scenario: Valid header bypasses body reception

- **WHEN** a valid header JWT with the existing nested status-1 payload reaches a bound opening session, regardless of body length or metadata
- **THEN** authentication and existing callback processing succeed without body receive calls or body JSON parsing, and the session becomes editing

#### Scenario: Invalid present header cannot use body credentials

- **WHEN** Authorization exists but is empty, whitespace, non-Bearer or fails JWT validation while a valid body token is available
- **THEN** the existing HTTP 401 `invalid_token` response is returned without body reception/parsing, download or state/file changes

#### Scenario: Inclusive raw-byte boundary

- **WHEN** an absent-header request carries a valid body-token envelope of exactly 1,048,576 raw bytes, including a multibyte string
- **THEN** authentication succeeds and existing status-1 processing transitions the bound session from opening to editing

#### Scenario: One byte above the boundary

- **WHEN** a body-token request contains 1,048,577 raw bytes
- **THEN** the response is HTTP 413 with exactly `{"error":1,"reason":"callback_body_too_large"}`, no body JSON parsing occurs and state/files/download observations remain unchanged

#### Scenario: Stream crosses the boundary without trustworthy length

- **WHEN** many received chunks cross the budget, with missing or forged-small Content-Length
- **THEN** actual accumulated byte counts cause the same 413 before the crossing chunk is appended; no subsequent chunk is requested and no state/file or download effect occurs

#### Scenario: Malformed bounded body keeps authentication errors

- **WHEN** an absent-header body is within the budget but malformed, has an invalid token or does not contain the existing token envelope
- **THEN** the existing HTTP 401 `invalid_token` response and no-mutation behavior are preserved

### Requirement: Preserve control-plane and processing authority

The body-token budget SHALL NOT change sandbox-peer-first rejection, Office-disabled routing, the control-plane network boundary, internal-token exemption, canonical chat/session/key binding, verified-payload-only processing, source delivery or existing callback status handling. The body-token budget SHALL NOT be interpreted as a downloaded document size limit.

#### Scenario: Sandbox peer is refused before reception

- **WHEN** a sandbox-subnet peer supplies any callback credential or body
- **THEN** the existing 403 is returned before credential or body work, without changes to state/files

#### Scenario: Existing DocumentServer callbacks and source tickets

- **WHEN** the established valid header/body callback, unsigned-field, wrong-key, internal-token, disabled-route and source-ticket fixtures execute
- **THEN** their existing success/refusal, durability and downloaded-content behavior remains intact
