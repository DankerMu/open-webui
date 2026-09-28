# Spec Delta

## MODIFIED Requirements

### Requirement: Honest generation-aware embedded rendering

The Files-only embedded view SHALL reuse existing Office renderers and report loading, ready, error, missing or unsupported for the current selection. It SHALL support only broker types docx/xlsx/pptx and SHALL additionally refuse MIME essence text/html, image/svg+xml, application/xhtml+xml, application/xml, text/xml or any +xml suffix regardless of type. It SHALL report ready only after successful rendering; corrupt Office content SHALL produce error and a visible failure indication so the parent can offer its own authorized download. The fixed trusted iframe sandbox SHALL not be widened to enable downloads. A superseded request SHALL not overwrite the display or emit a current result.

#### Scenario: Real Office and stale completion

- **WHEN** a valid Office file is selected, a corrupt Office file is selected, and a delayed old render resolves after a newer selection
- **THEN** valid content is visible with ready, corrupt content has error for the parent's download fallback, and only the newest selection controls the display and result

#### Scenario: Generated document refusal

- **WHEN** broker metadata has a non-Office type or forbidden MIME, including svg-as-image, xhtml-as-other, xml-as-code and drawio
- **THEN** Files embedding reports unsupported without invoking a trusted DOM renderer or reading user sandbox settings

### Requirement: Read-only embedded lifecycle

Files-only embedded mode SHALL not mount runtime views or perform heartbeat, browser/terminal discovery, CLI badge, launch or ttyd operations. It SHALL have no independent polling, autoselection or child-link selection path; re-resolution requires a newer parent request. All Files embedding listeners, timers and render observers SHALL be released on teardown. Standalone preview behavior SHALL remain compatible.

#### Scenario: Passive preview lifecycle

- **WHEN** a Files-only embedded preview is opened, changed, removed and opened again
- **THEN** only necessary file/listing requests occur, no runtime action occurs and removed instances cannot send results or retain owned effects

## ADDED Requirements

### Requirement: Selected runtime embedding

The authenticated preview page SHALL support framed `embed=browser` and `embed=terminal` modes that display only the selected existing runtime interface without independent Files listing, nested view tabs or automatic switching to another view. Exactly one recognized embed parameter and a parent frame SHALL be required; invalid or repeated embed values and non-framed embedding SHALL render a visible error without runtime requests. All runtime HTTP and WebSocket requests SHALL remain on the configured public prefix and browser origin. Opening a mode SHALL NOT implicitly launch a stopped sandbox.

#### Scenario: Selected view with no outputs

- **WHEN** a parent opens Browser or Terminal embedding for a running workspace with zero outputs
- **THEN** the selected runtime surface remains usable and its actual client uses only the same-origin prefixed service endpoints
- **AND** no Files listing or unselected runtime client is mounted

#### Scenario: Invalid embedding

- **WHEN** embed is repeated, unknown, or requested without a parent frame
- **THEN** a visible invalid-embedding state appears and no runtime action occurs

#### Scenario: Runtime unavailable

- **WHEN** browser discovery is unavailable, malformed, non-successful or reports inactive
- **THEN** the page presents a distinct non-active status without attempting implicit sandbox launch

### Requirement: Runtime embedding owns resource lifetime

Runtime embedding SHALL own at most one heartbeat timer and SHALL release its polling, pending status work, reconnection timers and WebSockets when removed. Late responses or connection completions SHALL NOT create replacement resources for a retired frame. Standalone runtime and Files-only embedding SHALL preserve their existing behavior.

#### Scenario: Repeated mount and delayed completion

- **WHEN** Browser and Terminal frames are opened and removed20times, including removal during pending status and connection work
- **THEN** each live frame uses only its selected client and every removed frame leaves zero active owned connections and no future polls/reconnects after pending work settles

### Requirement: Runtime shell has a dedicated content policy

Runtime embed HTML SHALL carry a CSP restricting scripts, styles, fonts, images and connections to the approved same-origin assets and explicit inline/data/blob exceptions in the design. Only its nonce-bound configuration script SHALL execute inline; external script/network destinations and nested frames SHALL be denied. The parent iframe policy SHALL remain fixed at allow-scripts allow-same-origin allow-forms, independent of user-generated-content settings. Generated document responses and Files-only rendering SHALL retain their existing isolation rules.

#### Scenario: Allowed runtime and denied external content

- **WHEN** an actual runtime embed loads local modules/styles/fonts, opens its same-origin service WebSocket and attempts an unapproved external script or connection
- **THEN** normal runtime initialization succeeds, the external operation is blocked by CSP and no parent sandbox permission is widened
