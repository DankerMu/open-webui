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
