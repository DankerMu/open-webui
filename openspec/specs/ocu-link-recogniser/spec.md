# ocu-link-recogniser Specification

## Purpose

Pure recognition of filter-generated OCU preview links so the later Chat.svelte handler can open the sidebar only for the current chat.

## Requirements

### Requirement: Recognise only current-chat preview links

`recogniseOcuLink(href, base, chatId)` SHALL return the file path when `href` is under `base` and the path is `/files/{chatId}/…`. It SHALL return `null` for a different chat id. Foreign host is rejected when `base` is absolute. When `base` is path-only, recognition is pathname-only so a browser-resolved absolute href on the WebUI origin matches.

#### Scenario: Foreign host

- **WHEN** `href` is `https://evil.example/ocu/files/C/x.html` and `base` is absolute
- **THEN** the result is `null`

#### Scenario: Path-only base with browser-absolute href

- **WHEN** `href` is `https://chat.example.com/ocu/files/C/report.html` and `base` is path-only `/ocu`
- **THEN** the result is `report.html`

#### Scenario: Other chat id

- **WHEN** `href` matches `base` but the chat segment is not `chatId`
- **THEN** the result is `null`

#### Scenario: Matching filter-generated link

- **WHEN** `href` is `{base}/files/{chatId}/report.html`
- **THEN** the result is `report.html`

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
