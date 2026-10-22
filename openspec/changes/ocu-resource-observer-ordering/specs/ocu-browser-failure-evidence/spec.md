## ADDED Requirements

### Requirement: Wire observation is independent of CDP event order

The browser test observer that records network requests over CDP SHALL produce the same record for a request without redirects no matter in which order that request's CDP events arrive. Response-side events received before the request event SHALL be kept and applied when the request is recorded. A later request event for the same request that is not a redirect hop SHALL NOT erase response-side fields already recorded. A redirect hop SHALL replace them, so that the record describes the last hop. When an expected refusal is not observed in time, the failure SHALL name the probe and the unmet fields without exposing credential values.

#### Scenario: Response information arrives before the request

- **WHEN** the observer receives the response status and the CORS failure for a probe before the probe's request event
- **THEN** the probe's record holds the request, its status and its CORS failure, the same as for in-order events

#### Scenario: Redirected request

- **WHEN** a probe is redirected and the observer receives the redirect hop's request event after the first hop's response status
- **THEN** the probe's record holds the last hop's URL and status, and not the redirect status

#### Scenario: Refusal never observed

- **WHEN** an expected refusal does not match any recorded request within the timeout
- **THEN** the failure message names the probe index, its redacted URL and each unmet field

### Requirement: Browser failures leave redacted evidence in CI

When a browser case fails in CI, the uploaded failure artifact SHALL contain that case's failure screenshot and error context, and for OCU cases its recorded wire rows, with text evidence redacted against the run's known secrets. Playwright traces SHALL NOT be uploaded.

#### Scenario: OCU browser case fails

- **WHEN** an OCU browser case fails during `make verify-ui` in CI
- **THEN** the artifact contains the case's screenshot, its redacted error context and its redacted wire rows, contains no trace archive, and contains none of the run's secret values

#### Scenario: Baseline browser case fails

- **WHEN** a baseline browser case fails during `make verify-ui` in CI
- **THEN** the artifact contains that case's screenshot and error context
