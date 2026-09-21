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

Workspace state SHALL be keyed by `chat_id`. A describe response whose generation is older than the chat's current generation SHALL be ignored. Dirty flags SHALL be per chat. When two revisions arrive out of order, the store SHALL keep the higher one. The store SHALL NOT write `artifactContents`.

#### Scenario: Late describe dropped

- **WHEN** chat A starts a describe (generation n), the user switches to B, then A's response arrives
- **THEN** B's stored status/files are unchanged and A's late body is not applied to B

#### Scenario: Out-of-order revision

- **WHEN** revision 7 is applied after revision 9 is already stored for the same chat
- **THEN** the stored revision remains 9
