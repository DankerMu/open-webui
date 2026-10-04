# ocu-workspace-files Specification

## Purpose

Provide the actual chat-mounted Files workspace sidebar with honest lifecycle states, safe previews and independent browser evidence before full workspace controls land.

## Requirements

### Requirement: Flag-gated saved-chat Files panel

WorkspaceArtifact SHALL accept chatId and mount through minimal existing ChatControls hooks for a saved owner chat. An authenticated config flag SHALL control visibility and requests; missing/false or unsaveable IDs SHALL produce no workspace mount/request. A saveable unsaved chat MAY expose the workspace action, but SHALL first complete upstream persistence before mounting the Files consumer or making workspace requests. Workspace state SHALL use the existing chat-keyed store, not artifactContents. The Chat-owned producer SHALL be the sole describe/listing reconciliation owner; the panel SHALL consume that state and delegate data commands instead of owning a second fetch path. Closing retires consumer frames and preview timers while the active-chat producer may continue closed-panel discovery; switching chats retires both owners' obsolete work. Late data SHALL never change another chat. Native Artifact behavior SHALL remain unchanged.

#### Scenario: Disabled and temporary isolation

- **WHEN** the feature is disabled or the chat is temporary/local/channel/default
- **THEN** no workspace entry or mounted workspace appears and no workspace request is issued

#### Scenario: Unsaved action is not an unsaved consumer

- **WHEN** a saveable chat has no saved id and the workspace action is activated
- **THEN** persistence completes before Files mounts and no workspace request carries the empty id

### Requirement: Honest Files state and actions

The panel SHALL render distinct unavailable/loading/ready/empty/error/stopped/disconnected UI. Describe SHALL determine actions and base_url; listing SHALL come through the authorized proxied outputs route. Failed requests SHALL not become empty success. Only explicit permitted Launch SHALL start a sandbox; stopped files SHALL remain browsable. Retry/Reconnect SHALL not silently launch.

#### Scenario: A-T10 states

- **WHEN** listing is empty, paginated, inaccessible or service unavailable, and runtime is stopped/disconnected
- **THEN** each state has a visible explanation and its permitted action, pagination has More, and existing loaded files are not silently lost on a failed refresh

### Requirement: Identity-coherent selection and preferences

Selection SHALL use file_id and revision, survive rename and reject late generations. Partial/error/incoherent listings SHALL not establish deletion. When complete authorized enumeration proves the selected identity absent, the panel SHALL return to the list, show a notice and clear selected_file_id in prefs without dropping known view/open preferences. Accepted selected-content changes SHALL refresh previews by path plus revision, not mtime or object identity. Unchanged selected content and unrelated file updates SHALL preserve active iframe identity. Restored Office selection and returns from unavailable runtime views SHALL establish one live handshake with the existing bounded ready/result protocol.

#### Scenario: Selected file deleted

- **WHEN** the selected file is absent from a complete successful reconciliation
- **THEN** selection clears with a visible notice and prefs selected_file_id is explicitly cleared
- **AND** an incomplete later-page listing never triggers that clearing

#### Scenario: Changed and unchanged content

- **WHEN** reconciliation changes the selected file's path/revision, or changes only another file
- **THEN** the former reloads the selected preview while the latter preserves its iframe element and connection
- **AND** an Office selection restored from prefs reaches actual rendered content rather than an unarmed preview shell

### Requirement: Separate generated and Office preview trust

Generated HTML/SVG/XML SHALL load its canonical current-chat cookie URL in an iframe fixed to allow-scripts allow-forms. Office SHALL use the merged restricted preview protocol in a separate trusted iframe fixed to allow-scripts allow-same-origin allow-forms. Parent responses SHALL be validated by source/origin/schema/chat/file/generation and stale responses ignored. User iframe settings SHALL not widen either policy. Corrupt/unsupported Office SHALL yield a visible per-file state and usable parent-owned download fallback, not blank success.

#### Scenario: Real Office consumer

- **WHEN** valid and corrupt Office files are selected through the actual WebUI sidebar
- **THEN** the real OCU renderer reports current-generation ready/error, valid content is visible and failure exposes a working parent download
- **AND** wrong-source, wrong-chat and stale results cannot change current selection

#### Scenario: A-T01 three open paths

- **WHEN** generated HTML and scripted SVG open via the sidebar (including an ordinary recognized message click), an explicit modified new-tab message-link gesture, and a directly entered file URL while the user enables same-origin sandbox settings
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

### Requirement: Loaded workspace files have deterministic display rows

The display model SHALL group loaded files by the full directory portion of their slash-separated relative paths. Each distinct nonempty directory SHALL produce one folder row containing its path and loaded-file count, followed by its files in name order; folders SHALL be in path order and root files SHALL follow all folders in name order without a root folder row. A three-level directory SHALL remain one full-path header, not an intermediate folder hierarchy. Leading or doubled slashes SHALL NOT create empty directory segments; path case SHALL remain distinct. File rows SHALL carry the original file, its last path segment as display name (or its `name` when path is empty), and whether it is nested. File identity SHALL remain `file_id`, folder identity its directory path. Input records and input ordering SHALL NOT be mutated.

Ordering SHALL be recomputed with code-unit lexicographic comparison: folders by full directory path and files by their display name (last path segment, or `name` when path is empty). Comparison SHALL NOT depend on host locale.

#### Scenario: Nested, same-name and root files

- **WHEN** loaded files include root files and files in two directories, including a three-level path and equal basenames in separate directories
- **THEN** each directory has one ordered full-path row and correct loaded count, each file retains its own identity and display name, and root files come last without a header

#### Scenario: Empty and redundant path separators

- **WHEN** input is empty, root-only, contains a leading or doubled slash, or contains directories differing only in case
- **THEN** output respectively is empty, has only file rows, contains no empty directory segment, or keeps the two case-distinct directory groups

#### Scenario: Another loaded page preserves prior file identities

- **WHEN** a second page is appended to the previously loaded files
- **THEN** every earlier file retains its identity/name and group, folder counts reflect the combined loaded files, and new files participate in the same deterministic ordering
- **AND** a count describes only loaded files, not complete server enumeration or deletion evidence

### Requirement: Workspace display kinds use broker type and MIME

The pure classifier SHALL return one of `web`, `image`, `document`, `sheet`, `slides`, `code` or `other`, from case-insensitive broker `type` and the media type portion of `mime`. HTML/SVG/XML SHALL be web; image formats image; DOCX/PDF/text/Markdown document; XLSX/CSV sheet; PPTX slides; JSON/scripts/source files code. Unknown or empty classification inputs SHALL yield other. Display classification SHALL NOT change preview or editing eligibility and SHALL NOT infer a different identity from filenames.

#### Scenario: Kinds and media-type normalization

- **WHEN** representative files for all seven kinds include uppercase type/MIME values, `text/html; charset=utf-8`, and unknown/empty values
- **THEN** each known file yields its specified kind regardless of case or MIME parameters, and unknown/empty inputs yield other
