# Spec Delta

## Purpose

The WebUI side of Office editing in the workspace sidebar: feature flag, 编辑 entry, a third code-fixed iframe class for the OCU editor host page, save-status bar, maximize overlay, version history with restore, conflict dialog and the unsaved-state guard. Source: Plan 2 § 关键设计 3 and 5; design D8, D13, D15, D16.

## ADDED Requirements

### Requirement: Feature flag and edit entry

The backend SHALL read `ENABLE_OCU_OFFICE_EDIT`, default false, and expose it as `enable_ocu_office_edit` in the authenticated config features object beside `enable_ocu_workspace`. A value other than `true` or `false` (case-insensitive) SHALL fail startup with a message naming the variable. With the flag missing or false, or with the workspace flag off, the client SHALL render no edit entry, SHALL mount no editor frame and SHALL issue no request to an `/ocu/api/office/` route. With both flags on, `WorkspaceArtifact` SHALL show an 编辑 action only on workspace file entries whose broker type is `docx`, `xlsx` or `pptx`, in a saved chat owned by the user; every other type SHALL keep its existing read-only preview or download entry. Activating 编辑 SHALL NOT launch a stopped sandbox.

#### Scenario: Flag off means no entry and no request

- **WHEN** `enable_ocu_office_edit` is absent or false and the owner selects a DOCX file in the sidebar
- **THEN** no 编辑 action is rendered, the read-only preview works as before and no request to `/ocu/api/office/` is issued

#### Scenario: Entry only on editable Office types

- **WHEN** the flag is on and the Files list holds a DOCX, an XLSX, a PPTX, an HTML file, a PDF and a legacy `.doc`
- **THEN** only the DOCX, XLSX and PPTX entries offer 编辑

#### Scenario: Unexpected flag value fails loud

- **WHEN** the backend starts with `ENABLE_OCU_OFFICE_EDIT=maybe`
- **THEN** startup fails with an error naming `ENABLE_OCU_OFFICE_EDIT`

### Requirement: Dedicated editor frame class

The editor SHALL run in a third iframe class in `WorkspaceArtifact`, separate from the generated-document frame and the trusted preview frame. Its `src` SHALL be the current chat's same-origin preview URL with `embed=office`. Its `sandbox` attribute and its permission-policy (`allow`) attribute SHALL be constants defined in code whose token lists are those recorded by the B1 verification record; they SHALL NOT be derived from `$settings.iframeSandbox*` or any other user setting. The generated-document frame SHALL remain fixed at `allow-scripts allow-forms` and the trusted preview and runtime frames at `allow-scripts allow-same-origin allow-forms`. The editor frame's identity SHALL be the edited `file_id` plus its edit session: it SHALL NOT be keyed on `revision`, path or mtime, so a `revision` change caused by a publish, an unrelated listing change, a streamed message update or the first report of a `session_id` SHALL leave the same iframe element mounted. A new edit of the file after its session ended SHALL use a new frame.

#### Scenario: Publish does not rebuild the editor (B-T04)

- **WHEN** a save is published and the next reconciliation raises the edited file's `revision`
- **THEN** the editor iframe element is the same element as before, with its session unchanged

#### Scenario: User settings cannot change the editor sandbox

- **WHEN** the user toggles every `iframeSandbox*` setting and opens the editor
- **THEN** the editor frame's `sandbox` and `allow` attributes equal the code constants
- **AND** the generated-document frame still has no `allow-same-origin` and the trusted preview frame keeps its fixed policy

#### Scenario: Streaming does not rebuild the editor

- **WHEN** a response streams in the chat while the editor is open
- **THEN** the editor iframe element identity is unchanged

### Requirement: Parent validation of the editor protocol

The parent SHALL accept an editor message only when its source is the current editor frame's window, its origin equals the page origin, the frame's `src` is the expected editor URL, the key set is exactly that of `ocu:office-ready` (`type, chat_id`) or `ocu:office-state` (`type, chat_id, file_id, generation, session_id, state, dirty, workspace_changed, reason`), `chat_id` equals the current chat, and — for a state message — `file_id` and `generation` equal the current open and `state` is one of `opening`, `editing`, `saving`, `closing`, `closed`, `conflict`, `error`, `orphaned`, `refused`. A message that fails any check SHALL change no state and cause no request. The parent SHALL send `ocu:office-open` only in reply to a valid `ocu:office-ready` from the current frame, with a `generation` strictly greater than every generation it has used, and SHALL send `ocu:office-command` (`save` or `close`) with the current generation; both SHALL be posted to the page origin, never `*`. A frame that does not become ready within the ready deadline of the existing Office preview frame SHALL be retired and replaced by a visible failure with an explicit retry.

#### Scenario: Open handshake

- **WHEN** the editor frame posts a valid `ocu:office-ready`
- **THEN** the parent posts one `ocu:office-open` carrying the chat, the edited `file_id` and a generation greater than any used before

#### Scenario: Wrong source, chat, file or generation is ignored

- **WHEN** a sibling frame, a generated-document frame, a message for another chat or file, a message from a retired generation, or a message with an extra or missing key reports `editing` with `dirty: false`
- **THEN** the status bar, the store and the unsaved-state guard are unchanged and no request is issued

#### Scenario: Frame never becomes ready

- **WHEN** the editor frame posts no valid `ocu:office-ready` within the ready deadline
- **THEN** the frame is retired, a failure with a retry action is shown, and a late `ocu:office-ready` from the retired frame is ignored

### Requirement: Status bar, save and maximize

While an editor frame exists the sidebar SHALL show a status bar with state text, a save button, a history entry and a maximize button. The state text SHALL be derived only from the latest valid `ocu:office-state` and SHALL distinguish: opening; unsaved (`editing` with `dirty: true`); saving (`saving` or `closing`); saved (`editing` with `dirty: false`); conflict; failed (`error`, or a non-null `reason` reported while the session stays `editing`, in which case editing and the save button remain available); expired (`orphaned`, with an action to open the file again); and refused (`refused`, with a message specific to the reason, including `connection_limit` for the connection cap). The parent SHALL NOT show saved because the save button was pressed or a request was accepted; saved SHALL appear only when the host page reports that no unpublished change exists. The save button SHALL send `ocu:office-command` with `save` and SHALL be enabled only in state `editing`. A reported `closed` SHALL remove the editor frame and return the file to its read-only preview. Maximize SHALL be an overlay inside the WebUI page that enlarges the same editor iframe element together with the status bar; it SHALL NOT call the Fullscreen API, reload the frame or create a second session. All texts SHALL go through the existing localisation mechanism and generated catalogs.

#### Scenario: Saved only after the publish is confirmed (B-T04)

- **WHEN** the user presses save while the state is unsaved
- **THEN** the bar shows saving once `saving` is reported and shows saved only after `editing` with `dirty: false` is reported
- **AND** if `error` or `conflict` is reported instead, saved is never shown

#### Scenario: Each state has distinct text

- **WHEN** the host page reports in turn `opening`, `editing` dirty, `saving`, `editing` clean, `conflict`, `error`, `orphaned` and `refused`
- **THEN** the bar shows a distinct localised text for each, and the save button is enabled only for the two `editing` reports

#### Scenario: Refused at the connection cap (B-T15)

- **WHEN** the host page reports `refused` with reason `connection_limit`
- **THEN** the bar explains that no editing session is available, no editor is shown and the read-only preview and download remain usable

#### Scenario: Refused for an invalid document (B-T13)

- **WHEN** the host page reports `refused` for a corrupt, oversized or unsupported document
- **THEN** the sidebar shows an explicit message for that reason and falls back to the read-only preview or download, never a blank panel

#### Scenario: Failed save keeps the editor usable (B-T11)

- **WHEN** the host page reports `editing` with `dirty: true` and a non-null `reason` after a save
- **THEN** the bar shows that the save failed with that reason, never saved, and the save button stays enabled

#### Scenario: Maximize keeps the frame

- **WHEN** the user maximizes and then restores the editor
- **THEN** the same iframe element is displayed in both layouts, `document.fullscreenElement` stays null and the status bar and save button remain usable in the overlay

### Requirement: Version history and restore

For an editable Office entry the sidebar SHALL offer a history view that lists the document's versions from `GET /ocu/api/office/{chat}/documents/{file}/versions` through the client module `src/lib/apis/ocu/office.ts`. Each row SHALL show the version number, time, source (`workspace`, `save`, `autosave`, `close`, `restore` or `conflict`) and whether the version is published. The history view SHALL be reachable both from the status bar while editing and from the file entry when no editor is open. A restore action SHALL call `POST /ocu/api/office/{chat}/documents/{file}/restore` with `X-Requested-With: ocu-workspace`; it SHALL be disabled with an explanation while a session is open on the document, and a refusal returned by the broker SHALL be shown as an error without changing the list. After a successful restore the list SHALL be reloaded from the broker. The parent SHALL own the versions, restore and resolve calls; the editor frame SHALL NOT be asked to make them.

#### Scenario: List shows source and published flag (B-T14)

- **WHEN** a document has a `workspace` version, a published `save` version and an unpublished `autosave` version
- **THEN** the history lists three rows with those sources, and only the `save` row is marked published

#### Scenario: Restore creates a new published version (B-T14)

- **WHEN** no session is open and the user restores an earlier version
- **THEN** one restore request is issued, the reloaded list shows a new version with source `restore` marked published, and the earlier rows are unchanged

#### Scenario: Restore refused while editing

- **WHEN** an editor session is open on the document
- **THEN** the restore action is disabled with an explanation and no restore request is issued
- **AND** a refusal returned by the broker for a session open elsewhere is displayed as an error

### Requirement: Conflict resolution and change notice

When the host page reports `conflict`, including when a file whose close-time publish conflicted is opened again, the sidebar SHALL present a conflict dialog. The dialog SHALL offer `save as new file` as the default action and `overwrite` as a second action that requires a second explicit confirmation before any request is sent. When the conflict reason is `path_missing`, that is, the original path no longer exists, only `save as new file` SHALL be offered. The chosen action SHALL be sent by the parent to `POST /ocu/api/office/{chat}/sessions/{session}/resolve` as `save_as` or `overwrite`. Dismissing the dialog SHALL resolve nothing and SHALL leave the conflict state visible with a way to reopen the dialog; the UI SHALL offer no action that discards the user's content. A successful `save_as` SHALL NOT recreate the editor frame. While the host page reports `workspace_changed: true` the sidebar SHALL show a non-blocking "workspace file changed" notice; editing and saving SHALL remain available.

#### Scenario: Default is save as new file (B-T06)

- **WHEN** a save ends in `conflict` because the workspace file changed and the user confirms the dialog's default action
- **THEN** one resolve request with `save_as` is issued and no file is overwritten

#### Scenario: Overwrite needs a second confirmation (B-T06)

- **WHEN** the user chooses `overwrite` and then declines the second confirmation
- **THEN** no resolve request is issued
- **AND** after accepting the second confirmation exactly one resolve request with `overwrite` is issued

#### Scenario: Path is gone (B-T13)

- **WHEN** the host page reports `conflict` with reason `path_missing`
- **THEN** the dialog offers only `save as new file`

#### Scenario: Pending conflict on reopen (B-T06)

- **WHEN** a session was closed unattended with a conflict and the owner later opens that file for editing
- **THEN** the conflict dialog is presented before any further edit is published

#### Scenario: Workspace file changed notice (B-T07)

- **WHEN** the host page reports `workspace_changed: true` during editing and later `false`
- **THEN** the notice is visible while it is true, the save button stays enabled, and the notice disappears when it is false

### Requirement: Unsaved-state guard through minimal hooks

Office editing state SHALL live in a chat-keyed store module beside the workspace store, never in `artifactContents`. A guard in a new module SHALL register a `beforeunload` prompt only while the current chat's latest editor state has `dirty: true`, and SHALL remove it when that is no longer the case. Every action that removes the editor frame — switching chats, closing the sidebar, closing the editor, selecting another file or view — SHALL first send `ocu:office-command` with `close` and SHALL show a saving-progress indication until the session's outcome is known or the progress timeout fixed by the B1 verification record elapses; on timeout the indication SHALL say that the save is unconfirmed, never that it succeeded. Because the host page stops reporting when its frame is removed, the guard module SHALL keep the `session_id` of the last valid `ocu:office-state` and, once the frame is gone, SHALL read `GET /ocu/api/office/{chat}/sessions/{session}` through `src/lib/apis/ocu/office.ts` until the session is `closed`, `conflict`, `error` or `orphaned` or the timeout elapses; it SHALL release that poll on completion and SHALL keep at most one such poll per session. The outcome SHALL be recorded against the chat that owned the session: a late result SHALL NOT change the status, files, selection or dialogs of another chat. A conflict that ends an unattended close SHALL be left for the next time that file is opened. The changes to `ChatControls.svelte` and `Chat.svelte` SHALL be limited to calls into the new module at existing hook sites; no workspace or Office logic SHALL be added inline to those files.

#### Scenario: Refresh with unpublished changes (B-T12)

- **WHEN** the editor reports `dirty: true` and the user reloads or closes the tab
- **THEN** the browser's native leave prompt is raised
- **AND** with `dirty: false`, or with no editor open, no prompt is raised

#### Scenario: Leaving the editor saves with visible progress (B-T12)

- **WHEN** the owner switches to another chat or closes the sidebar while the editor has unpublished changes
- **THEN** a `close` command is sent to the editor frame, a saving-progress indication is shown and it ends as saved only after the session status for that chat reports `closed`
- **AND** when the progress timeout elapses first the indication reports the save as unconfirmed and no poll for that session remains

#### Scenario: Late result never crosses chats (B-T12)

- **WHEN** chat A's close completes, fails or conflicts after the owner has switched to chat B
- **THEN** chat B's status bar, file list, selection and dialogs are unchanged, and chat A shows the outcome when it is opened again

#### Scenario: Reopening an old chat (B-T12)

- **WHEN** the owner reopens a chat whose file was saved in an earlier editing session
- **THEN** the file shows the saved content, no editor frame is mounted until 编辑 is activated, and no document of another chat is shown

#### Scenario: Upstream diff audit

- **WHEN** `bash scripts/change-scope.sh` lists the modified upstream files for the guard
- **THEN** the hunks in `ChatControls.svelte` and `Chat.svelte` contain only imports of and calls into the new module, and no message handling, request, timer or Office state

### Requirement: Executable component and browser proof

Vitest SHALL exercise the actual component and module behaviour: flag off; frame creation and identity across a publish-driven `revision` change; every rejected message class; each status-bar state including saved only after a confirmed publish; maximize keeping the frame; the history list, restore call and disabled state; each conflict-dialog branch; each guard trigger and the late-result case. Playwright SHALL exercise the actual WebUI route through the existing proxy and the deterministic stub's Office fixtures and editor host page, covering open → editing → save → saved, a conflict driven by the stub, maximize in both layouts and the B-T12 walk, with screenshots under `.run/ui-evidence/` and zero unexpected console or page errors. Missing harness prerequisites SHALL fail visibly rather than skip, and owned services SHALL be stopped after the run. A pass of these tests SHALL NOT be reported as proof that a real DocumentServer save works.

#### Scenario: Repeatable browser verification

- **WHEN** `make verify-ui-ocu` runs with its documented prerequisites
- **THEN** the Office cases run through the proxy and the stub, screenshots are saved, no unexpected console or page error occurs and no owned process remains afterwards

#### Scenario: Missing prerequisite is not a skip

- **WHEN** the proxy binary, the OCU checkout or the stub cannot be started
- **THEN** the command exits non-zero naming the missing prerequisite

#### Scenario: Component coverage of the gate

- **WHEN** `make test-frontend` and `make coverage-gate` run on the change
- **THEN** the new Office modules meet the per-file coverage threshold without lowered thresholds or assertion-free tests
