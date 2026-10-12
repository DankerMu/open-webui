## ADDED Requirements

### Requirement: Office smoke credentials use private request transport

Office Hurl launches SHALL keep owner and non-owner cookie or token values out of process arguments, including retained variables on later requests. Each request SHALL supply its effective Office variables through a dedicated0600 file under owned0700 scratch; explicit current values, including empty anonymous cookies, SHALL override earlier values. The dedicated file SHALL be removed on completion or failure without changing the base credential file or weakening the existing Office matrix.

#### Scenario: Retained credentials stay off argv

- **WHEN** owner or non-owner variables are supplied and a subsequent request retains them
- **THEN** no corresponding cookie or token appears in any Office child argv
- **AND** Hurl receives the effective values from the private request file

#### Scenario: Anonymous overrides prior credentials

- **WHEN** an anonymous request explicitly supplies an empty cookie after an authenticated request
- **THEN** Hurl receives the empty value rather than a prior owner or non-owner cookie

#### Scenario: Request lifetime cleanup and matrix preservation

- **WHEN** Hurl succeeds, returns nonzero, fails to launch or is interrupted
- **THEN** the dedicated request file is removed and the original result or failure propagates
- **AND** normal smoke execution still proves all seven owner rows,24authentication/guard denials and five unlisted denials
