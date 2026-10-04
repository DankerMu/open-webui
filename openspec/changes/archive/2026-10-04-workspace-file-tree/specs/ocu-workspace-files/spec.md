# Spec Delta

## ADDED Requirements

### Requirement: Grouped workspace rows form an accessible local file tree

The Files list SHALL render the existing display rows as full-path folder headers followed by indented file rows, with root files unindented and flat listings having no folder header. A folder header SHALL be a real button with chevron, decorative folder icon, muted path and loaded count; its accessible name SHALL start with a word such as `Folder`, and its `aria-expanded` SHALL reflect local collapse. Groups SHALL start expanded. Collapse SHALL hide only that group's rows without requests, persist only for the open panel and reset after closing/reopening; it SHALL NOT change file selection or another chat.

Each file row SHALL be a whole-row button with a decorative kind icon, truncated `text-sm` display name with full-name tooltip and muted formatted size. Its accessible name SHALL remain exactly `file.name || file.path`, excluding icon and size. No added non-file button SHALL introduce a file-name accessible label that collides with existing substring row selectors. Rows SHALL use existing theme-aware utilities, approximately28–32px height,16px icons, rounded hover/selected backgrounds and visible keyboard focus. Selected rows SHALL retain `aria-pressed=true` and a visible selected style hook. The existing selection callback and selected Office re-click preview restart SHALL remain unchanged.

#### Scenario: Nested and flat listings

- **WHEN** loaded files contain two directories, a three-level directory and root files, or instead contain only roots
- **THEN** the former shows full-path folder headers, correctly indented rows, kind icons and formatted sizes, while the latter has no folder header
- **AND** existing accessible file names and selected-file identity remain unchanged

#### Scenario: Local collapse does not request or retarget

- **WHEN** an expanded folder is collapsed and expanded, then the panel is closed and reopened or changes chat
- **THEN** its rows hide/reappear without a request or selection change, and the new panel/chat begins expanded

### Requirement: File tree preserves pagination and preview space

More files SHALL remain a named, muted full-width control after the loaded rows, present only when another page exists and disabled while busy; it SHALL invoke the existing pagination action. The list SHALL scroll independently. With a selected file its height SHALL be capped at approximately two fifths of the panel so the preview retains remaining space; with none selected it MAY use the full available height. Header and selected-preview presentation, iframe authority and protocol SHALL remain unchanged.

#### Scenario: Selection and another page

- **WHEN** a row is clicked, clicked again for an already selected Office file, or More files is activated
- **THEN** the existing respective selection/restart/pagination behavior occurs without duplicate actions
- **AND** with a selection the scrolling list leaves remaining height for preview, while More files is absent without a cursor and disabled during its request

#### Scenario: Browser proof uses real nested fixtures

- **WHEN** the browser harness creates the new nested-list scenario chat and opens Files in light and dark themes
- **THEN** it asserts full-path headers, indentation, collapse/expand and selection styling, captures both screenshots and has zero unexpected console/page errors
- **AND** existing browser selectors and A-T01 generated-content isolation continue to pass
