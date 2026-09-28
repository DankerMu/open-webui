# Spec Delta

## MODIFIED Requirements

### Requirement: Flag-gated saved-chat Files panel

WorkspaceArtifact SHALL accept chatId and mount through minimal existing ChatControls hooks for a saved owner chat. An authenticated config flag SHALL control visibility and requests; missing/false or unsaveable IDs SHALL produce no workspace mount/request. A saveable unsaved chat MAY expose the workspace action, but SHALL first complete upstream persistence before mounting the Files consumer or making workspace requests. Workspace state SHALL use the existing chat-keyed store, not artifactContents. Closing or switching chats SHALL retire owned work and prevent late data from changing another chat. Native Artifact behavior SHALL remain unchanged.

#### Scenario: Disabled and temporary isolation

- **WHEN** the feature is disabled or the chat is temporary/local/channel/default
- **THEN** no workspace entry or mounted workspace appears and no workspace request is issued

#### Scenario: Unsaved action is not an unsaved consumer

- **WHEN** a saveable chat has no saved id and the workspace action is activated
- **THEN** persistence completes before Files mounts and no workspace request carries the empty id
