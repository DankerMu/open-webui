## ADDED Requirements

### Requirement: Runtime capability fault display

When a browser or terminal status payload carries a string `reason` (the server's typed capability fault, such as `gateway_publication_unassigned`), the preview SPA SHALL render a capability-error panel in that view, in both the embedded and the standalone surfaces, that shows the `reason` and `detail` as text and is distinct from the empty state and from the generic unavailable state. The terminal view SHALL read the status before starting the terminal and again after a successful container recovery, and on a fault SHALL neither request a terminal start nor open its WebSocket nor enter the reconnect loop. A connected shell viewer SHALL NOT be unmounted by a fault payload. Status payloads without `reason`, and failed status reads, SHALL render and behave exactly as before, apart from the one additional status read before a terminal start or after a recovery.

#### Scenario: Browser fault in either surface

- **WHEN** the browser status route answers `active: false` with `reason` and `detail`
- **THEN** the embedded browser view and the standalone browser tab show an alert containing the reason and the detail text, no viewer connection or page-list request is made, and neither the "no browser yet" empty state nor "Browser unavailable" is shown

#### Scenario: Terminal fault stops before start

- **WHEN** the terminal status route answers with `reason` and `detail` and the user opens the terminal
- **THEN** the view shows an alert containing the reason and the detail text with no recover action
- **AND** no terminal start request, WebSocket upgrade or "session ended" message occurs

#### Scenario: Fault after a recovered container

- **WHEN** a stopped container is shown with its recover action, the recovery succeeds, and the status route then answers with `reason`
- **THEN** the view shows the fault alert instead of opening the WebSocket

#### Scenario: Payloads without a reason are unchanged

- **WHEN** the status routes answer as before (active, inactive, unavailable, malformed, stopped container, removed container, start failure)
- **THEN** the views render and behave exactly as before this requirement, apart from the additional status read
