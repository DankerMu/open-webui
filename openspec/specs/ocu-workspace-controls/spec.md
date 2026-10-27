# ocu-workspace-controls Specification

## Purpose

Expose chat-owned workspace controls for saveable chats, preserving upstream persistence, panel lifecycle and isolated Files/Browser/Terminal view selection.

## Requirements

### Requirement: Saveable-chat entry persists before workspace access

When the feature is enabled, a workspace action SHALL be reachable in every saveable non-embedded chat, including an unsaved chat. Temporary mode and temporary/local/channel/default identifiers SHALL hide the action and prohibit persistence/workspace requests. Unsaved activation SHALL reuse the upstream save path and wait for the server-issued saved id before any workspace request. Concurrent activations SHALL share one save; a save overlapping message submission SHALL not create two chats. Save failure or a retired chat context SHALL not open a workspace or adopt its id/URL into another chat.

#### Scenario: Unsaved chat ordering

- **WHEN** an unsaved chat with a draft and controls state activates the workspace action twice while saving
- **THEN** one chat is persisted, draft/controls remain intact and the first workspace request uses only the returned saved id

#### Scenario: Temporary or failed save

- **WHEN** temporary mode is enabled, an unsaveable id is active, or saving fails
- **THEN** temporary/unsaveable chats perform no save or workspace request; save failure presents a visible error and permits an explicit retry

#### Scenario: Navigation during save

- **WHEN** an unsaved chat save resolves after switching to another chat or enabling temporary mode
- **THEN** the old completion neither replaces the active chat identity/URL nor starts its workspace request

#### Scenario: First Send owns creation

- **WHEN** a normal first message is awaiting its server-issued chat id
- **THEN** the workspace action remains visible but disabled with a pending-state explanation, and no parallel chat creation occurs
- **AND** after successful adoption it accesses only that saved chat, while failure or navigation cannot adopt stale identity

#### Scenario: First message after workspace persistence

- **WHEN** workspace activation has persisted an otherwise empty chat before its first normal message
- **THEN** the message uses that saved id and retains the configured first-message title/tag generation behavior without duplicating chat creation

### Requirement: Chat-owned open and change policy

Accepted workspace state SHALL own independent open/view/acknowledged-change and first-output latches per chat. First accepted nonempty output state SHALL auto-open once unless the user has closed the panel. Subsequent changes SHALL show an indicator without reopening a user-closed panel; explicit open SHALL acknowledge the change. Listing reconciliation SHALL not erase the close latch. Event delivery and ongoing reconciliation are separate producers, not a second polling implementation in controls.

#### Scenario: First output then explicit close

- **WHEN** an accepted first output opens chat A, the user closes it and a newer output revision is accepted
- **THEN** A stays closed with a change indicator until explicitly opened
- **AND** chat B does not inherit A's latches or selected view

### Requirement: Runtime selection reuses trusted same-origin embedding

The panel SHALL offer Files and capability-gated Browser/Terminal views. Runtime views SHALL be usable with zero outputs when describe advertises them for a running workspace. They SHALL load only current-chat same-origin preview URLs with the selected runtime embed mode and fixed allow-scripts allow-same-origin allow-forms sandbox. Files generated-content isolation SHALL remain unchanged. User sandbox settings SHALL not widen either policy. Only explicit permitted Launch SHALL change stopped runtime state.

#### Scenario: Empty running workspace and stopped workspace

- **WHEN** a running workspace has no outputs and advertises Browser/Terminal, then reports stopped
- **THEN** both runtime views are available while running; stopped state preserves Files and offers explicit permitted Launch without automatic startup

#### Scenario: Binding and frame identity

- **WHEN** a runtime view is open while same-chat message content or unrelated workspace state updates
- **THEN** the same iframe element remains mounted
- **AND** selecting another runtime view, closing or changing chats removes the old frame and cannot retain its connections

### Requirement: Existing panels and preferences remain coherent

Workspace selection SHALL coexist with native Artifacts, Embeds and Call controls through their existing mutually exclusive panel lifecycle. View/open writes SHALL use the shared ordered preference boundary without losing selected file identity. Workspace UI SHALL use the existing localization mechanism and generated catalogs.

#### Scenario: Return to Files and native panels

- **WHEN** a selected file is followed by Terminal, then Files, then native Artifacts
- **THEN** the file selection survives the view round-trip and native Artifacts renders without a hidden workspace runtime remaining

### Requirement: Actual controls acceptance is retained

Actual WebUI verification SHALL cover unsaved/temporary ordering, delayed A/B describe,20runtime open/close cycles, explicit stopped Launch, Office content-preview labeling and native baseline compatibility without weakening existing isolation or console assertions. Recording transports SHALL count real client WebSockets; they SHALL not be described as real sandbox interaction. The credential-absence oracle SHALL include a credentialed-document positive control.

#### Scenario: Repeated teardown and regression

- **WHEN** make verify-ui runs the controls suite through the pinned proxy and real runtime assets
- **THEN** required cases produce screenshots, zero unexpected console errors and zero connections from closed workspaces
- **AND** existing A-T01/A-T10 and baseline tests continue to pass

### Requirement: Theme-aware workspace panel chrome

The workspace panel header SHALL be a single row with a bottom hairline border holding, on the left, the Files, Browser and Terminal segmented switch and, on the right, Refresh and Close icon buttons. It SHALL show no visible title and no loaded-file count; the panel SHALL keep the accessible name `Workspace Files`, and pagination SHALL remain visible through the Files view's `More files` action. Refresh and close SHALL be icon buttons with tooltips retaining accessible names `Refresh workspace files` and `Close workspace`; refresh SHALL remain disabled while busy and its icon SHALL spin. Decorative icons SHALL NOT alter accessible names. The switch SHALL keep a visibly filled active segment, visible disabled state and existing capability-based absence and `aria-pressed` semantics, SHALL size its segments to their content and SHALL NOT stretch to the panel width. Each segment SHALL contain a decorative icon and its visible label when the header has room for all labels; when it does not, the active segment SHALL keep its label and the other segments SHALL show only their icon, with unchanged accessible names and a tooltip showing the label. The header SHALL NOT overflow horizontally at the minimum panel width in English or zh-CN. Styles SHALL use existing theme-aware application utilities and icons, without a new dependency or manual locale values.

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

- **WHEN** Files, Browser and Terminal are available in a panel widened to 600 px, then the panel is at its default (minimum) 350 px with Files active, then Terminal is selected
- **THEN** at 600 px every segment shows icon and label and the switch does not fill the header; at 350 px only Files shows its label, Browser and Terminal show icons with their accessible names and tooltips, and the header does not overflow; after selecting Terminal only Terminal shows its label

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
- **THEN** the header (view switch and icon controls) and state feedback remain legible and fit the panel
- **AND** both screenshots are retained with zero unexpected console or page errors and unchanged existing selectors

### Requirement: Workspace panel notices outlive background polls

A workspace panel notice SHALL remain visible across background reconciliation polls. It SHALL be cleared only when another notice replaces it; when the user starts a refresh, retry, launch or load-more, selects a file or changes the view; when the user dismisses it with the banner's dismiss button; or, for a failure notice or the selection-changed notice only, when a later run applies a listing or reports the workspace unavailable. Dismissing SHALL issue no request and SHALL affect only that chat.

#### Scenario: Removal notice survives background polls

- **WHEN** a complete listing drops the selected file and the panel shows `Selected file was removed`, and two background polls then return unchanged listings
- **THEN** the notice is still shown

#### Scenario: User action clears the notice

- **WHEN** the panel shows a notice and the user selects a file, changes the view, or starts a refresh
- **THEN** the notice is cleared

#### Scenario: Success clears a failure notice

- **WHEN** a refresh fails and the panel shows `Refresh failed; existing files remain available`, and a later background poll applies a listing
- **THEN** the failure notice is cleared

#### Scenario: Dismissal is local to the chat

- **WHEN** the user activates the dismiss button on chat A's notice banner
- **THEN** chat A's notice is cleared without any request, chat B's notice is unchanged, and a notice that a later run writes for chat A is shown

### Requirement: Workspace entry sits in the navbar

The workspace action SHALL be a single icon button in the chat navbar directly before the `Controls` button, using the `Controls` button's size, colours and hover treatment and a decorative folder icon. Its accessible name and tooltip SHALL be `Workspace Files`; no visible text label SHALL accompany it. It SHALL be present exactly when the workspace action is available, independent of the controls permission, and SHALL stay in place whether the workspace panel is shown or not; while the mobile drawer is open (native Controls or the workspace itself) it covers the entry, and closing the drawer exposes it. `aria-pressed` SHALL reflect whether the workspace panel is shown. Activating it while the panel is not shown SHALL run the existing open action; while shown it SHALL run the existing close action, including the Office leave guard. A workspace change while closed SHALL show a small dot on the icon and a visually hidden `Workspace changed` status. While the first send is pending it SHALL be disabled with tooltip and visually hidden status `Waiting for chat to save`. No floating entry card and no text entry button in the native Controls panel header SHALL remain.

#### Scenario: Aligned entry toggles the panel

- **WHEN** on a large screen a saved chat shows the navbar with the workspace panel closed, then the user activates the entry twice
- **THEN** the entry is vertically centred on the `Controls` button, the first activation opens the panel with `aria-pressed="true"`, and the second closes it with `aria-pressed="false"`

#### Scenario: Change indicator and pending send

- **WHEN** a closed workspace receives a newer revision, and separately a first send is pending
- **THEN** the entry shows a dot with a visually hidden `Workspace changed` status that clears after opening, and during the pending send the entry is disabled with `Waiting for chat to save`

#### Scenario: Close goes through the Office leave guard

- **WHEN** an Office editor is open in the shown workspace and the user activates the entry
- **THEN** the editor departs through the existing leave guard before the panel closes

#### Scenario: Unavailable action has no entry

- **WHEN** temporary mode is enabled or the chat id is unsaveable
- **THEN** no `Workspace Files` button exists and no floating card or header text button is rendered
