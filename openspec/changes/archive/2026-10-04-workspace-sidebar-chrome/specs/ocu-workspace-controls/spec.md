# Spec Delta

## ADDED Requirements

### Requirement: Theme-aware workspace panel chrome

The workspace panel SHALL show a compact medium-weight title and a muted loaded-file count, omitted for zero files and marked with `+` while another page exists. Refresh and close SHALL be icon buttons with tooltips retaining accessible names `Refresh workspace files` and `Close workspace`; refresh SHALL remain disabled while busy and its icon SHALL spin. Decorative icons SHALL NOT alter accessible names. Files, Browser and Terminal SHALL form a segmented switch with a visibly filled active segment, visible disabled state and existing capability-based absence and `aria-pressed` semantics. Styles SHALL use existing theme-aware application utilities and icons, without a new dependency or manual locale values.

The header SHALL be a single row with a bottom hairline border. Each view segment SHALL contain a decorative icon and its visible label. In-scope controls SHALL use approximately 28–32 px compact rows, 16 px line icons marked `aria-hidden`, medium-weight title text and muted `text-xs` metadata, reusing neighboring panel radii, spacing, focus and theme colors. This requirement SHALL NOT restyle the file list or selected-file area.

#### Scenario: Loaded count and refresh progress

- **WHEN** the panel holds three loaded files without another page, then one hundred with another page, then no files
- **THEN** the summary shows `3 files`, then `100+ files`, then no file count
- **AND** while refresh is busy its named button is disabled and its icon indicates progress

#### Scenario: View availability remains authoritative

- **WHEN** a workspace advertises Browser but not Terminal and then stops
- **THEN** Terminal is absent, Browser becomes visibly disabled, and Files remains available
- **AND** selecting an available view uses the existing action and pressed state without changing its accessible name

### Requirement: Workspace state blocks preserve actions and isolation

Loading SHALL display three decorative skeleton rows and retain its status text for assistive technology. Unavailable, stopped and empty states SHALL display muted icons and their existing text/actions. Unreachable and load-error states SHALL use theme-aware error styles and retain their existing alert roles/actions. The notice SHALL be a compact alert banner. Runtime frames SHALL fill a bordered rounded remaining-height container. Existing visible messages, action names, enabling conditions and callback behavior SHALL remain unchanged. Every frame's sandbox, source, title, identity and message-validation contract SHALL remain unchanged.

#### Scenario: State feedback remains usable

- **WHEN** loading, unavailable, disconnected, error, stopped, empty or notice state is presented
- **THEN** its existing status or alert text and applicable Launch, Reconnect or Retry action remain accessible
- **AND** no state presentation starts a stopped workspace or adds a request

#### Scenario: Presentation does not widen runtime authority

- **WHEN** Browser or Terminal is selected, or generated content is previewed
- **THEN** the existing frame sandbox/source/title and lifecycle remain unchanged
- **AND** the existing A-T01 generated-content case retains an opaque origin and no token access

#### Scenario: Both application themes render intentional chrome

- **WHEN** the browser suite opens Files in the light and dark themes
- **THEN** the title, count, icon controls, switch and state feedback remain legible and fit the panel
- **AND** both screenshots are retained with zero unexpected console or page errors and unchanged existing selectors
