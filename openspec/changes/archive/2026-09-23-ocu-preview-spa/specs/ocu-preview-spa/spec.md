# Spec Delta

## Purpose

Make the OCU preview SPA usable behind its public prefix with authorized requests, revision-correct refresh and honest Office content previews.

## ADDED Requirements

### Requirement: Prefix-safe request and asset ownership

Authored SPA module imports SHALL be relative, and dynamic local script/worker/viewer assets SHALL derive from module URLs without root-absolute /static/ literals. One request wrapper SHALL add X-Requested-With: ocu-workspace to application-owned scripted HTTP requests. Client root paths SHALL receive the configured prefix once with segment-boundary matching; server-emitted API/file/describe URLs SHALL remain verbatim. Terminal and browser WebSockets SHALL use the correct public base and page protocol. No internal token SHALL enter browser config.

#### Scenario: Request provenance

- **WHEN** prefix is empty, /ocu or /tools/ocu and a client path, already-prefixed path, relative URL or server-emitted URL is requested
- **THEN** routing matches its provenance, headers preserve request data, and no /ocu/ocu path or wrongly prefixed WebUI describe request is emitted
- **AND** /oculus is not mistaken for an /ocu path segment

#### Scenario: Heartbeat and discovery

- **WHEN** the SPA is mounted and its heartbeat/browser discovery runs
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
