# Spec Delta

## ADDED Requirements

### Requirement: One delegated current-chat preview action

Chat.svelte SHALL delegate preview activation from the messages container through the existing pure recognizer using an absolute validated same-origin base. Unmodified primary clicks for the current saved chat SHALL open Files and select only a file_id resolved from authorized coherent metadata, including a file beyond the loaded page. Recognition SHALL synchronously prevent native navigation before asynchronous resolution. Foreign origins, other chats, unsupported paths, archive/download actions and modified/new-tab gestures SHALL retain native behavior. No Markdown/message-rendering component SHALL change. Resolution SHALL not fabricate a file identity, accept double-decoded paths or apply to a retired chat; complete absence SHALL show a missing-file/list state without embedding unknown content or launching an automatic popup. Explicit successful selection SHALL persist through the same preference boundary as panel selection.

#### Scenario: Recognized file beyond the loaded page

- **WHEN** a matching current-chat preview link names an encoded path not yet in the loaded window
- **THEN** the sidebar opens, coherent pagination resolves its real file_id and the correct preview appears without a new tab

#### Scenario: Non-preview navigation is preserved

- **WHEN** the user activates a foreign-origin link, another chat's link, a download/archive action or a modified click
- **THEN** the delegated handler does not prevent native navigation or select a workspace file

#### Scenario: Missing or retired target

- **WHEN** complete enumeration proves a matched path absent or the user changes chats during lookup
- **THEN** no invented/stale file is selected; current missing state is visible and the new chat remains untouched
