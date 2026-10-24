## ADDED Requirements

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
