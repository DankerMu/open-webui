# Spec Delta

## ADDED Requirements

### Requirement: Selected file has a compact metadata and download bar

The selected region SHALL retain the accessible name `Selected workspace file`. Its one-row hairline-bordered bar SHALL show a decorative kind icon consistent with the list, a medium-weight truncated filename with full-name tooltip, muted directory only for nested files, and muted canonical formatted size. It SHALL use existing theme-aware compact row utilities and leave action space on the right. The icon download action SHALL remain an anchor with the unchanged URL, download filename and accessible name `Download <name>`, plus a tooltip. It SHALL NOT add a filename-labelled button or another action.

#### Scenario: Root and nested selected metadata

- **WHEN** a root file or nested file is selected
- **THEN** the bar shows its display basename, kind and formatted size, with the full directory only for the nested file
- **AND** its download link retains the original href, download attribute and accessible name; long names remain available through the tooltip

### Requirement: Selected preview is framed without changing preview behavior

The preview surface below the bar SHALL be rounded, bordered and clipped at its corners, and fill remaining height; its iframe SHALL have no border of its own. Generated-content and Office iframe sandbox, source and title values SHALL remain identical to the accepted reference. Preview selection, keyed lifecycle, message validation and deadlines SHALL remain unchanged. Office pending status SHALL retain its existing text and `role="status"`, with a decorative spinner; failure SHALL retain its status text/role and `Retry Office preview` action in a styled error block. Unsupported files SHALL show a centered decorative kind icon, existing status text and a download action styled as a button. This secondary action SHALL be an anchor named `Download`, without the filename, so the single existing `Download <name>` link selector remains unambiguous. It SHALL perform the same download, not add an open/copy/revision action.

#### Scenario: Generated, Office and unsupported branches

- **WHEN** generated content, a connecting/rendering/failed Office file, or an unsupported file is selected
- **THEN** the respective existing branch renders inside the framed surface, pending Office status has a spinner and failure has the unchanged retry action
- **AND** retry retains its original frame restart behavior, downloads remain available and unsupported content retains its status role

#### Scenario: Browser presentation and isolation

- **WHEN** a selected HTML file and an unsupported file are viewed in light and dark themes
- **THEN** four screenshots show the bar and framed surface without horizontal overflow, with remaining height available to the preview
- **AND** existing selectors and A-T01 opaque-origin behavior pass with zero unexpected console/page errors

## MODIFIED Requirements

### Requirement: File tree preserves pagination and preview space

More files SHALL remain a named, muted full-width control after the loaded rows, present only when another page exists and disabled while busy; it SHALL invoke the existing pagination action. The list SHALL scroll independently. With a selected file its height SHALL be capped at approximately two fifths of the panel so the preview retains remaining space; with none selected it MAY use the full available height. Header presentation, iframe authority and protocol SHALL remain unchanged.

#### Scenario: Selection and another page

- **WHEN** a row is clicked, clicked again for an already selected Office file, or More files is activated
- **THEN** the existing respective selection/restart/pagination behavior occurs without duplicate actions
- **AND** with a selection the scrolling list leaves remaining height for preview, while More files is absent without a cursor and disabled during its request

#### Scenario: Browser proof uses real nested fixtures

- **WHEN** the browser harness creates the new nested-list scenario chat and opens Files in light and dark themes
- **THEN** it asserts full-path headers, indentation, collapse/expand and selection styling, captures both screenshots and has zero unexpected console/page errors
- **AND** existing browser selectors and A-T01 generated-content isolation continue to pass
