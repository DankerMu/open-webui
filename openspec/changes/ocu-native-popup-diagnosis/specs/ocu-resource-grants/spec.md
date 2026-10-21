## ADDED Requirements

### Requirement: Deterministic native popup observation

The e2e oracle for message-link opening SHALL observe a natively created popup target through the browser target channel and SHALL not depend on Playwright's context init script reaching that target before the document's inline script runs: the collector the popup document posts to SHALL be installed by the observer on its own attached session before the paused target is resumed, the document projection SHALL distinguish an absent collector from an empty one, and every observation SHALL leave a sanitized, timestamped trace (gesture, target creation and attachment, resume, execution context, frame navigation, canonical request and response, Playwright page exposure, collector state per poll) under the UI evidence directory. Existing grant-chain, CSP, nosniff, console, storage/parent/cookie and cleanup assertions and all deadlines SHALL stay unchanged. A repeat entry point SHALL run one required spec N times against one owned stack, and SHALL fail before the stack starts on any incomplete or invalid configuration, while the default verification keeps running every required spec once.

#### Scenario: Native SVG popup with the collector installed by the observer

- **WHEN** the modified click opens the generated SVG in a new tab on a native Linux host and the SVG's inline script posts its event during parsing
- **THEN** the projection reports the expected `fixture-svg` event with origin `null` and all probes `blocked`, the trace shows the collector install acknowledged before the observer's resume, and the proof, grant chain and CSP assertions hold

#### Scenario: Absent collector is reported, not masked

- **WHEN** the collector is not present in the popup document at a poll
- **THEN** the projection reports `collector: absent` and a timeout names that state together with the document's posted timestamp, instead of reporting an empty event list

#### Scenario: Repeat entry point validation

- **WHEN** `OCU_UI_SPEC` or `OCU_UI_REPEAT` is set without the other, names a spec outside the allowed set, or a non-positive or non-integer repeat count
- **THEN** the harness fails before any owned service starts; with a valid pair it runs only that spec with the given repeat count, and without the pair it runs every required spec once as before
