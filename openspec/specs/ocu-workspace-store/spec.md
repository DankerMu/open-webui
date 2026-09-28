# ocu-workspace-store Specification

## Purpose

Chat-keyed OCU workspace store and API client for the four flag-gated routes, with the mutating header and late-response discard.

## Requirements

### Requirement: Client always sends X-Requested-With

`getWorkspace`, `launchWorkspace`, `refreshWorkspace` and `putWorkspacePrefs` SHALL send `X-Requested-With: ocu-workspace` on every request to `/api/v1/ocu/workspaces/{chat_id}` (and `/launch`, `/refresh`, `/prefs`).

#### Scenario: Header on every verb

- **WHEN** each of the four client functions is called
- **THEN** the request includes `X-Requested-With: ocu-workspace`

### Requirement: Chat-keyed store discards late responses

Workspace state SHALL be keyed by `chat_id`. A describe or listing response whose generation is older than the chat's current generation SHALL be ignored. Dirty flags SHALL be per chat. When revisions arrive out of order, the store SHALL retain the higher accepted revision and SHALL NOT replace newer accepted files with an older listing. It SHALL NOT write `artifactContents`. A hint received during reconciliation SHALL remain pending until a subsequent authoritative pass consumes it.

#### Scenario: Late describe dropped

- **WHEN** chat A starts a describe (generation n), the user switches to B, then A's response arrives
- **THEN** B's stored status/files are unchanged and A's late body is not applied to B

#### Scenario: Out-of-order revision

- **WHEN** revision7 is applied after revision9 is already accepted for the same chat
- **THEN** stored revision and files remain at9

#### Scenario: Hint during an in-flight pass

- **WHEN** a current-chat hint arrives after a pass has started but before it accepts its listing
- **THEN** that pass cannot erase the newer dirtiness and one subsequent authoritative pass occurs without overlapping requests

### Requirement: One active-chat reconciliation producer

An enabled saved non-embedded chat SHALL have one producer independent of sidebar visibility. It SHALL reconcile authorized describe/status/capabilities and coherent proxied listings on attach, socket reconnect, current-chat dirty hints and polling at3 seconds visible or15 seconds hidden. Only the active chat SHALL perform reads. Automatic passes SHALL NOT call launch or POST /refresh. Runs SHALL not overlap; visibility changes SHALL not duplicate timers. Disable, temporary transition, chat switch and unmount SHALL cancel owned scheduling/requests and retire late effects. Failures SHALL retain known data with honest error/disconnected/unavailable state rather than empty success. Conditional304 SHALL reuse only matching previously accepted data and SHALL not establish deletion or satisfy an uncached selection search.

#### Scenario: No-event output appears

- **WHEN** outputs change without any event while the active chat is visible or hidden
- **THEN** the next corresponding3s/15s poll reconciles the file and current runtime metadata without implicit launch

#### Scenario: Message-less and background hints

- **WHEN** a server `ocu:workspace_changed` envelope arrives with no message_id, including for chat A while B is active
- **THEN** the early handler marks the valid envelope chat dirty without applying event-supplied revision/files or performing I/O
- **AND** A issues no read until activated while B remains unaffected

#### Scenario: Closed panel discovers changes without reopening

- **WHEN** the active chat's first accepted output arrives, the user closes the auto-opened panel, then another output appears
- **THEN** the shared policy opens once, later changes show an indicator without reopening, and no closed consumer retains frame transports or preview timers

#### Scenario: Detach and conditional cache

- **WHEN** an active pass is retired or an unchanged conditional listing returns304
- **THEN** retirement prevents late state mutation and clears producer resources;304 retains accepted files and selection without rebuilding an unchanged preview

### Requirement: Persisted preference restoration preserves newer local intent

On first activation of an unhydrated saved chat, describe's nested `prefs.view`, `prefs.selected_file_id`, `prefs.open` SHALL restore valid preferences before selected-file resolution. Missing/null values SHALL use the existing unset/default semantics. An explicit persisted closed state SHALL prevent automatic reopening. Repeated polling SHALL NOT reapply stale persisted choices over local user changes. All preference writers SHALL use the shared per-chat ordered, hydration-aware boundary; they SHALL NOT replace unseen stored preferences with guessed defaults. Complete successful enumeration may clear a removed identity, but partial, failed or older enumeration SHALL not do so. Restore SHALL not launch or recreate a sandbox.

#### Scenario: Native restart and history restore

- **WHEN** owned backend and deterministic OCU-stub processes restart with their persisted state preserved and the owner reopens a history chat
- **THEN** describe restores view/open/file preferences, authorized listing resolves file_id, selected content renders and no launch request occurs
- **AND** this evidence is identified as native process restart rather than real Docker sandbox restart

#### Scenario: User opens before hydration finishes

- **WHEN** stored prefs select a file/runtime view and the user opens or closes the workspace during a delayed first describe
- **THEN** the explicit open choice wins without losing the unseen persisted selection/view, and the queued PUT contains the merged authoritative preferences
- **AND** failed hydration cannot cause a PUT of guessed defaults

#### Scenario: Cached chat and retired restore

- **WHEN** the user switches A→B→A with a delayed A describe or newer local preferences
- **THEN** B never receives A state and A's current close/selection choices survive without stale preference replay
