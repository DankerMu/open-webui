# Spec Delta

## Purpose
The dedicated workspace sidebar in the chat UI: component, chat-keyed store, mount/unmount through existing `ChatControls` hooks, state machine, history restore, and iframe sandboxing for the trusted SPA versus generated content. Source: Plan 1 § 3; design D4, D5, D9, D17, D19.

## ADDED Requirements

### Requirement: New modules, minimal upstream hooks
The sidebar SHALL be implemented in new files `src/lib/components/chat/WorkspaceArtifact.svelte`, `src/lib/apis/ocu/index.ts`, the link recogniser `src/lib/utils/ocu-links.ts` and a new chat-keyed store module `src/lib/stores/ocu.ts`; upstream edits SHALL be limited to `main.py` (router registration), `env.py` (flags), the `ChatControls.svelte` hook sites (panel branch, `closeHandler`, `specialPanel`), the `Chat.svelte` hooks (event handler and one delegated click handler on the messages container that routes recognised preview links to the sidebar), and coexistence lines in `Artifacts.svelte`; message rendering components (`Messages/Markdown/*`) SHALL NOT be modified.

#### Scenario: Upstream diff audit
- **WHEN** `bash scripts/change-scope.sh` lists modified upstream files for the sidebar work
- **THEN** the only modified upstream files are `main.py`, `env.py`, `ChatControls.svelte`, `Chat.svelte` and `Artifacts.svelte`, each with hook-sized hunks

### Requirement: Chat-keyed store, not artifactContents
Workspace state SHALL live in a store keyed by chat_id (pattern `chatRequestQueues`), never in `artifactContents`; streaming message updates SHALL NOT rebuild the workspace iframe.

#### Scenario: Streaming does not rebuild (A-T07)
- **WHEN** a response streams 500 tokens while the Terminal view is open
- **THEN** the iframe element identity is unchanged, the terminal connection stays open and scroll position and selection are preserved

### Requirement: Lifecycle follows chat switching
Switching chats SHALL unmount the sidebar through the existing `{#if !loading}` teardown in `Chat.svelte`; a late response for a previous chat SHALL be discarded by generation; only a change of workspace binding in place SHALL use `{#key}`.

#### Scenario: A/B switch with late response (A-T07)
- **WHEN** the user switches from chat A to chat B while A's describe request is in flight, then back to A
- **THEN** B never shows A's files, terminal or browser; A's late response is dropped; A reconciles on return according to its dirty flag

#### Scenario: No leaked connections (A-T07)
- **WHEN** the sidebar is opened and closed 20 times across two chats
- **THEN** no WebSocket or polling timer from a closed sidebar remains

### Requirement: State machine
The sidebar SHALL expose states `unavailable → loading → ready | empty | error`, plus runtime states `stopped` and `disconnected`; each state SHALL render a distinct, non-blank UI with an action where one exists (launch, retry, reconnect).

#### Scenario: Empty and error states (A-T10)
- **WHEN** the outputs directory is empty, exceeds the listing limit, contains a corrupt Office file, or OCU is unreachable (describe answers `unavailable` / `ocu_unreachable`)
- **THEN** the sidebar shows respectively an empty state, a paginated list with a "more" control, a per-file error with download fallback, and an error state with retry — never a blank panel

#### Scenario: Current file disappears (A-T10)
- **WHEN** the file selected in the sidebar (also stored as `prefs.selected_file_id`) is deleted or renamed away by the agent and the next reconcile tombstones it
- **THEN** the sidebar falls back to the file list with no selection and a notice, never crashes or goes blank, and the dangling `selected_file_id` is cleared from prefs

#### Scenario: Stopped state (A-T15)
- **WHEN** the description reports `stopped`
- **THEN** the sidebar shows the stopped state with a Launch action and files remain browsable

### Requirement: Workspace button and auto-open
A "工作区" button SHALL appear whenever `ENABLE_OCU_WORKSPACE` is on (capability available, Plan 1 § 3) in every chat that can be saved, including one not yet persisted, and SHALL be absent in a temporary chat (`$temporaryChatEnabled` or `isTemporaryChatId(chatId)`), which upstream never persists (A-T12); when the current chat is not yet persisted, activating the button SHALL first persist the chat through the upstream save path and only then call the workspace routes with the saved id (A-T12); the sidebar SHALL auto-open once on the first output for a chat; after the user closes it, polling SHALL NOT reopen it; entering Terminal or Browser SHALL be possible with zero outputs.

#### Scenario: New chat is persisted first (A-T12)
- **WHEN** the user activates the workspace button in a chat that has no saved id yet
- **THEN** the client persists the chat, and the first workspace request carries the saved id; no request is made with a temporary id

#### Scenario: Temporary chat has no button (A-T12)
- **WHEN** temporary chat mode is on, or the current chat id is a temporary id
- **THEN** the button is not rendered, no workspace request is made and no persist is attempted

#### Scenario: Auto-open once
- **WHEN** the first output appears in chat C and the user closes the sidebar, and then a second output appears
- **THEN** the sidebar opened once and stays closed the second time, while the button shows a change indicator

### Requirement: History restore
Opening a history chat SHALL restore binding, status, `base_url` and the selected view/file from `GET /workspaces/{chat_id}` and then the file list from the proxied outputs listing `GET /ocu/api/outputs/{chat_id}`, without replaying events or running outlet, and SHALL NOT start a stopped sandbox (A-T06).

#### Scenario: After WebUI and OCU restart (A-T06)
- **WHEN** both services restart and the owner opens an old chat
- **THEN** binding, status and selected view come from the description, the file list from the outputs listing, and no container is created

### Requirement: iframe sandboxing is fixed in code
The trusted OCU SPA iframe SHALL use `sandbox="allow-scripts allow-same-origin allow-forms"` and a dedicated CSP; generated-content iframes SHALL use `sandbox="allow-scripts allow-forms"` without `allow-same-origin`; neither SHALL read `$settings.iframeSandbox*` or `injectCsp`.

#### Scenario: User setting cannot widen (A-T01)
- **WHEN** the user sets `iframeSandboxAllowSameOrigin=true` in Settings
- **THEN** the generated-content iframe still has no `allow-same-origin` and `document.origin` inside it is opaque

### Requirement: Browser and Terminal views work through the gateway
The Browser and Terminal views SHALL work end to end through the proxied CDP and ttyd WebSockets (navigation, input, screen updates; terminal input, resize, reconnect) without exposing sandbox dynamic ports to the browser (A-T05).

#### Scenario: Interactive terminal and browser (A-T05)
- **WHEN** the owner types in the Terminal view, resizes it, drops the connection and reconnects, and navigates a page in the Browser view
- **THEN** all inputs take effect, the terminal session resumes, the browser screen updates, and the only host the browser talks to is the proxy origin

### Requirement: Native Artifacts unaffected
Native HTML/SVG Artifacts, RAG answers and ordinary chat SHALL behave as at baseline (A-T13).

#### Scenario: Baseline regression (A-T13)
- **WHEN** the existing `e2e/smoke.e2e.ts` and a native-Artifact fixture run on the fork
- **THEN** they pass with zero new console errors and no global skip-RAG patch is present
