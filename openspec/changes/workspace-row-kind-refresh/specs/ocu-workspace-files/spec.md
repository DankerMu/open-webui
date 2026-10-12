## MODIFIED Requirements

### Requirement: Grouped workspace rows form an accessible local file tree

The Files list SHALL render the existing display rows as full-path folder headers followed by indented file rows, with root files unindented and flat listings having no folder header. A folder header SHALL be a real button with chevron, decorative folder icon, muted path and loaded count; its accessible name SHALL start with a word such as `Folder`, and its `aria-expanded` SHALL reflect local collapse. Groups SHALL start expanded. Collapse SHALL hide only that group's rows without requests, persist only for the open panel and reset after closing/reopening; it SHALL NOT change file selection or another chat.

Each file row SHALL be a whole-row button with a decorative kind icon, truncated `text-sm` display name with full-name tooltip and muted formatted size. Its accessible name SHALL remain exactly `file.name || file.path`, excluding icon and size. No added non-file button SHALL introduce a file-name accessible label that collides with existing substring row selectors. Rows SHALL use existing theme-aware utilities, approximately28–32px height,16px icons, rounded hover/selected backgrounds and visible keyboard focus. Selected rows SHALL retain `aria-pressed=true` and a visible selected style hook. The existing selection callback and selected Office re-click preview restart SHALL remain unchanged.

Accepted listing metadata for an existing `file_id` SHALL update its displayed glyph to the current display kind without requiring reselection or replacing the selectable row element. Its selection and accessible name SHALL remain coherent with the current file. An in-place kind transition that does not move the row SHALL preserve focused-row continuity. Display updates SHALL NOT change classification rules or preview/edit eligibility.

#### Scenario: Nested and flat listings

- **WHEN** loaded files contain two directories, a three-level directory and root files, or instead contain only roots
- **THEN** the former shows full-path folder headers, correctly indented rows, kind icons and formatted sizes, while the latter has no folder header
- **AND** existing accessible file names and selected-file identity remain unchanged

#### Scenario: Local collapse does not request or retarget

- **WHEN** an expanded folder is collapsed and expanded, then the panel is closed and reopened or changes chat
- **THEN** its rows hide/reappear without a request or selection change, and the new panel/chat begins expanded

#### Scenario: Stable identity crosses display kinds on refresh

- **WHEN** an accepted refreshed listing keeps a selected file's `file_id` but changes its path and type/MIME to a different display kind
- **THEN** its actual displayed SVG changes to the new kind and agrees with its current kind metadata without another selection action
- **AND** the same selectable row retains its selection, updates its accessible name and keeps focus when its position is unchanged
- **AND** the existing classifier, grouping, selected-file presentation and preview/edit policy remain unchanged
