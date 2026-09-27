# ocu-workspace-files Specification

## Purpose
Provide the actual chat-mounted Files workspace sidebar with honest lifecycle states, safe previews and independent browser evidence before full workspace controls land.

## Requirements

### Requirement: Flag-gated saved-chat Files panel

WorkspaceArtifact SHALL accept chatId and mount through minimal existing ChatControls hooks for a saved owner chat. An authenticated config flag SHALL control visibility and requests; missing/false or unsaveable IDs SHALL produce no workspace mount/request. Workspace state SHALL use the existing chat-keyed store, not artifactContents. Closing or switching chats SHALL retire owned work and prevent late data from changing another chat. Native Artifact behavior SHALL remain unchanged.

#### Scenario: Disabled and temporary isolation

- **WHEN** the feature is disabled or the chat is temporary/local/channel/default/empty
- **THEN** no Files entry or mounted workspace appears and no workspace request is issued

### Requirement: Honest Files state and actions

The panel SHALL render distinct unavailable/loading/ready/empty/error/stopped/disconnected UI. Describe SHALL determine actions and base_url; listing SHALL come through the authorized proxied outputs route. Failed requests SHALL not become empty success. Only explicit permitted Launch SHALL start a sandbox; stopped files SHALL remain browsable. Retry/Reconnect SHALL not silently launch.

#### Scenario: A-T10 states

- **WHEN** listing is empty, paginated, inaccessible or service unavailable, and runtime is stopped/disconnected
- **THEN** each state has a visible explanation and its permitted action, pagination has More, and existing loaded files are not silently lost on a failed refresh

### Requirement: Identity-coherent selection and preferences

Selection SHALL use file_id and revision, survive rename and reject late generations. Partial/error/incoherent listings SHALL not establish deletion. When complete authorized enumeration proves the selected identity absent, the panel SHALL return to the list, show a notice and clear selected_file_id in prefs without dropping known view/open preferences.

#### Scenario: Selected file deleted

- **WHEN** the selected file is absent from a complete successful reconciliation
- **THEN** selection clears with a visible notice and prefs selected_file_id is explicitly cleared
- **AND** an incomplete later-page listing never triggers that clearing

### Requirement: Separate generated and Office preview trust

Generated HTML/SVG/XML SHALL load its canonical current-chat cookie URL in an iframe fixed to allow-scripts allow-forms. Office SHALL use the merged restricted preview protocol in a separate trusted iframe fixed to allow-scripts allow-same-origin allow-forms. Parent responses SHALL be validated by source/origin/schema/chat/file/generation and stale responses ignored. User iframe settings SHALL not widen either policy. Corrupt/unsupported Office SHALL yield a visible per-file state and usable parent-owned download fallback, not blank success.

#### Scenario: Real Office consumer

- **WHEN** valid and corrupt Office files are selected through the actual WebUI sidebar
- **THEN** the real OCU renderer reports current-generation ready/error, valid content is visible and failure exposes a working parent download
- **AND** wrong-source, wrong-chat and stale results cannot change current selection

#### Scenario: A-T01 three open paths

- **WHEN** generated HTML and scripted SVG open via the sidebar iframe, a rendered message link in a new tab, and a directly entered file URL while the user enables same-origin sandbox settings
- **THEN** script and inline CSS/data-image work but storage/parent-token access remains blocked and the execution origin is opaque
- **AND** relative stylesheet retrieval receives401 as the documented limitation, without widening the sandbox or granting credentials

#### Scenario: Office frame does not complete

- **WHEN** the Office frame never becomes ready within10 seconds or never reports a terminal selection result within30 seconds of dispatch
- **THEN** the panel retires that frame generation and shows a timeout error, parent download and explicit Retry
- **AND** late success cannot dismiss the timeout, and close/change/unmount clears both owned deadlines

### Requirement: Executable component and browser proof

Vitest SHALL exercise actual component state/lifecycle using the approved DOM runtime without weakening coverage thresholds. Playwright SHALL exercise the actual WebUI route through the existing proxy and deterministic real-chat fixtures, including the real merged Office SPA. Screenshots and zero unexpected console errors SHALL accompany A-T01/A-T10. Required harness prerequisites SHALL fail visibly rather than skip; owned services SHALL be stopped after verification.

#### Scenario: Repeatable verification

- **WHEN** make verify-ui runs with its documented local or CI prerequisites
- **THEN** A-T01/A-T10 run, evidence is saved and no closed panel retains owned work or process

#### Scenario: Existing dummy backend is not reused

- **WHEN** default dev-bg is already running with an unrelated or dummy OCU URL
- **THEN** workspace verification starts its own isolated configured backend/Vite pair and proves owner-chat describe plus real Office asset readiness through its proxy
- **AND** it stops only its owned services without changing or relying on the existing pair
