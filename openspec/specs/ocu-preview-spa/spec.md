# ocu-preview-spa Specification

## Purpose

Make the OCU preview SPA usable behind its public prefix with authorized requests, revision-correct refresh and honest Office content previews.

## Requirements

### Requirement: Prefix-safe request and asset ownership

Authored SPA module imports SHALL be relative, and dynamic local script/worker/viewer assets SHALL derive from module URLs without root-absolute /static/ literals. One request wrapper SHALL add X-Requested-With: ocu-workspace to application-owned scripted HTTP requests. Client root paths SHALL receive the configured prefix once with segment-boundary matching; server-emitted API/file/describe URLs SHALL remain verbatim. Terminal and browser WebSockets SHALL use the correct public base and page protocol. No internal token SHALL enter browser config. Explicit Files-only embedding SHALL suppress runtime discovery, heartbeat and runtime clients without changing standalone behavior.

#### Scenario: Request provenance

- **WHEN** prefix is empty, /ocu or /tools/ocu and a client path, already-prefixed path, relative URL or server-emitted URL is requested
- **THEN** routing matches its provenance, headers preserve request data, and no /ocu/ocu path or wrongly prefixed WebUI describe request is emitted
- **AND** /oculus is not mistaken for an /ocu path segment

#### Scenario: Heartbeat and discovery

- **WHEN** the standalone SPA is mounted and its heartbeat/browser discovery runs
- **THEN** HTTP requests carry the workspace header with the correct prefix and only one heartbeat timer exists
- **AND** unmount cleans up that timer

### Requirement: Describe badge and explicit recovery

The badge SHALL consume cli_badge from the exact shell-emitted describeUrl and SHALL never request runtime-cli. Both stopped recovery branches SHALL call the same existing launch alias; polling SHALL not launch a sandbox, and failed launch SHALL not proceed to ttyd start.

#### Scenario: Badge and stopped branches

- **WHEN** describe supplies a badge or either stopped branch is selected
- **THEN** the badge reflects the describe payload and explicit recovery uses restart-container for both branches
- **AND** describe failure hides the badge without a fallback runtime-cli request

### Requirement: Revision-consistent paginated refresh

The SPA SHALL use path plus entry revision rather than mtime to detect changed content, preserve unchanged view state and selected identity across rename, and remove deleted selection. It SHALL expose a more control for further pages and retain the loaded window on refresh. Only a complete same-revision page chain from the latest request generation SHALL replace displayed state. Midchain stale cursor SHALL trigger at most one restart; failed/incomplete chains SHALL preserve prior display with a visible error state.

#### Scenario: Revision versus display mtime

- **WHEN** a selected file changes revision with unchanged mtime, or only its display mtime changes
- **THEN** the revision change reloads the preview while mtime-only changes do not reset it

#### Scenario: Pagination and late responses

- **WHEN** more than100 files exist, more is selected and a later poll overlaps a slower previous request
- **THEN** later-page files remain reachable and the older response cannot overwrite newer state
- **AND** a stale page cannot be combined with a new first page

#### Scenario: Render completion ordering

- **WHEN** an old preview fetch/render completes after a newer selection or revision
- **THEN** it cannot overwrite the currently selected content

### Requirement: Honest Office content rendering

DOCX, XLSX and PPTX views SHALL display 内容预览 with a fidelity disclaimer. XLSX formulas without cached values SHALL be visibly marked uncomputed, while cached zero/false values remain displayed. Sheet/slide navigation and PPTX failure download fallback SHALL remain usable. Observed revision changes SHALL refresh displayed Office content without stale-cache reuse.

#### Scenario: Office refresh evidence

- **WHEN** real DOCX Chinese/title/table, multisheet XLSX and multislide PPTX fixtures are opened and then size-changed
- **THEN** browser screenshots show updated content and the content-preview label, with no new console errors
- **AND** XLSX uncomputed formulas are not blank or falsely presented as calculated values

### Requirement: Restricted parent selection protocol

The existing preview page SHALL offer explicit Files-only embedding using the exact message schemas in this change's design. It SHALL accept only its same-origin parent, matching chat identity and monotonically increasing valid generation. Unknown fields, arbitrary URLs, invalid origins or sources SHALL not cause selection, requests or execution. Embedded mode SHALL publish its ready handshake only after its listener is installed and SHALL target the exact parent origin.

#### Scenario: Parent and child separation

- **WHEN** a valid parent selects a file_id while a sibling, opaque child, wrong-chat sender or malformed message attempts another selection
- **THEN** only the valid parent request is processed and responses carry its chat/file/generation identity

### Requirement: Authoritative bounded file resolution

Selection SHALL resolve file_id against current authorized broker metadata using a coherent paginated listing and bounded page/time work. It SHALL never use parent-supplied paths or URLs. Missing SHALL mean complete coherent enumeration without the identity; network errors, partial pages, stale chains and exceeded limits SHALL produce error instead. Resolved URLs SHALL remain on the same origin and configured chat file path.

#### Scenario: Later page and deletion

- **WHEN** the selected identity exists on a later page, is deleted, and the parent re-requests that file_id with a higher generation
- **THEN** it first renders the correct file and the re-request reports missing only after a complete coherent listing proves absence
- **AND** a failed or truncated listing never reports missing

### Requirement: Honest generation-aware embedded rendering

The embedded view SHALL reuse existing Office renderers and report loading, ready, error, missing or unsupported for the current selection. It SHALL support only broker types docx/xlsx/pptx and SHALL additionally refuse MIME essence text/html, image/svg+xml, application/xhtml+xml, application/xml, text/xml or any +xml suffix regardless of type. It SHALL report ready only after successful rendering; corrupt Office content SHALL produce error and a visible failure indication so the parent can offer its own authorized download. The fixed trusted iframe sandbox SHALL not be widened to enable downloads. A superseded request SHALL not overwrite the display or emit a current result.

#### Scenario: Real Office and stale completion

- **WHEN** a valid Office file is selected, a corrupt Office file is selected, and a delayed old render resolves after a newer selection
- **THEN** valid content is visible with ready, corrupt content has error for the parent's download fallback, and only the newest selection controls the display and result

#### Scenario: Generated document refusal

- **WHEN** broker metadata has a non-Office type or forbidden MIME, including svg-as-image, xhtml-as-other, xml-as-code and drawio
- **THEN** embedding reports unsupported without invoking a trusted DOM renderer or reading user sandbox settings

### Requirement: Read-only embedded lifecycle

Embedded mode SHALL not mount runtime views or perform heartbeat, browser/terminal discovery, CLI badge, launch or ttyd operations. It SHALL have no independent polling, autoselection or child-link selection path; re-resolution requires a newer parent request. All embedding listeners, timers and render observers SHALL be released on teardown. Standalone preview behavior SHALL remain compatible.

#### Scenario: Passive preview lifecycle

- **WHEN** an embedded preview is opened, changed, removed and opened again
- **THEN** only necessary file/listing requests occur, no runtime action occurs and removed instances cannot send results or retain owned effects

### Requirement: Converted Office content is not executable

Document-converted HTML SHALL be sanitized before insertion into the trusted SPA DOM using the locally pinned approved sanitizer. This protection SHALL apply at the canonical renderer boundary in both embedded and standalone modes. Scriptable tags, event attributes, unsafe URL schemes and document-controlled style-map output SHALL not execute or escape the approved content subset. Normal content, tables and supported inline images SHALL remain usable; safe-link behavior SHALL be explicit and unsolicited external-resource requests SHALL be prevented.

#### Scenario: Real malicious DOCX

- **WHEN** a genuine DOCX contains a script-bearing hyperlink or hostile embedded style-map output and is rendered through the bundled converter under the fixed trusted iframe sandbox
- **THEN** activating its content cannot execute frame or parent sentinels or navigate to an executable URL
- **AND** ordinary DOCX text/table/inline-image content and approved safe links remain usable
