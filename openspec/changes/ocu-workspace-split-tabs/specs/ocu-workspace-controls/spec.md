## MODIFIED Requirements

### Requirement: Theme-aware workspace panel chrome

The workspace panel SHALL show a compact medium-weight title and a muted loaded-file count, omitted for zero files and marked with `+` while another page exists. Refresh and close SHALL be icon buttons with tooltips retaining accessible names `Refresh workspace files` and `Close workspace`; refresh SHALL remain disabled while busy and its icon SHALL spin. Decorative icons SHALL NOT alter accessible names. Files, Browser and Terminal SHALL form a segmented switch with a visibly filled active segment, visible disabled state and existing capability-based absence and `aria-pressed` semantics. The switch SHALL size its segments to their content and SHALL NOT stretch to the panel width. Styles SHALL use existing theme-aware application utilities and icons, without a new dependency or manual locale values.

The header SHALL be a single row with a bottom hairline border. Each view segment SHALL contain a decorative icon and its visible label. In-scope controls SHALL use approximately 28–32 px compact rows, 16 px line icons marked `aria-hidden`, medium-weight title text and muted `text-xs` metadata, reusing neighboring panel radii, spacing, focus and theme colors. This requirement SHALL NOT restyle the file list or selected-file area.

#### Scenario: Loaded count and refresh progress

- **WHEN** the panel holds three loaded files without another page, then one hundred with another page, then no files
- **THEN** the summary shows `3 files`, then `100+ files`, then no file count
- **AND** while refresh is busy its named button is disabled and its icon indicates progress

#### Scenario: View availability remains authoritative

- **WHEN** a workspace advertises Browser but not Terminal and then stops
- **THEN** Terminal is absent, Browser becomes visibly disabled, and Files remains available
- **AND** selecting an available view uses the existing action and pressed state without changing its accessible name

#### Scenario: Content-sized switch

- **WHEN** only Files is available, and then Files, Browser and Terminal are available
- **THEN** each segment is as wide as its icon and label, and the switch does not fill the panel width in either case
