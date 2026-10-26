## ADDED Requirements

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
