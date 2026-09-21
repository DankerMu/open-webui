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
