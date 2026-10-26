## MODIFIED Requirements

### Requirement: Theme-aware workspace panel chrome

The workspace panel header SHALL be a single row with a bottom hairline border holding, on the left, the Files, Browser and Terminal segmented switch and, on the right, Refresh and Close icon buttons. It SHALL show no visible title and no loaded-file count; the panel SHALL keep the accessible name `Workspace Files`, and pagination SHALL remain visible through the Files view's `More files` action. Refresh and close SHALL be icon buttons with tooltips retaining accessible names `Refresh workspace files` and `Close workspace`; refresh SHALL remain disabled while busy and its icon SHALL spin. Decorative icons SHALL NOT alter accessible names. The switch SHALL keep a visibly filled active segment, visible disabled state and existing capability-based absence and `aria-pressed` semantics, SHALL size its segments to their content and SHALL NOT stretch to the panel width. Each segment SHALL contain a decorative icon and its visible label when the header has room, and only the icon, with unchanged accessible name and a tooltip showing the label, when it does not; the header SHALL NOT overflow horizontally at the minimum panel width. Styles SHALL use existing theme-aware application utilities and icons, without a new dependency or manual locale values.

In-scope controls SHALL use approximately 28–32 px compact rows, 16 px line icons marked `aria-hidden`, reusing neighboring panel radii, spacing, focus and theme colors. This requirement SHALL NOT restyle the file list or selected-file area.

#### Scenario: Loaded count and refresh progress

- **WHEN** the panel holds three loaded files without another page, then one hundred with another page
- **THEN** the header row shows the view switch, Refresh and Close, with no title and no file count, and the paged case shows `More files` in the Files view
- **AND** while refresh is busy its named button is disabled and its icon indicates progress

#### Scenario: View availability remains authoritative

- **WHEN** a workspace advertises Browser but not Terminal and then stops
- **THEN** Terminal is absent, Browser becomes visibly disabled, and Files remains available
- **AND** selecting an available view uses the existing action and pressed state without changing its accessible name

#### Scenario: Content-sized switch

- **WHEN** only Files is available, then Files, Browser and Terminal are available at the default panel width, then the panel is at its minimum width
- **THEN** each segment is as wide as its icon and label and the switch does not fill the header, and at the minimum width the segments show icons only with their accessible names and tooltips while the header does not overflow
