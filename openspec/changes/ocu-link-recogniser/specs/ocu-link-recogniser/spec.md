# Spec Delta

## Purpose

Pure recognition of filter-generated OCU preview links so the later Chat.svelte handler can open the sidebar only for the current chat.

## ADDED Requirements

### Requirement: Recognise only current-chat preview links

`recogniseOcuLink(href, base, chatId)` SHALL return the file path when `href` is under `base` and the path is `/files/{chatId}/…`. It SHALL return `null` for a foreign host or a different chat id.

#### Scenario: Foreign host

- **WHEN** `href` is `https://evil.example/ocu/files/C/x.html` and `base` is the configured `/ocu` origin
- **THEN** the result is `null`

#### Scenario: Other chat id

- **WHEN** `href` matches `base` but the chat segment is not `chatId`
- **THEN** the result is `null`

#### Scenario: Matching filter-generated link

- **WHEN** `href` is `{base}/files/{chatId}/report.html`
- **THEN** the result is `report.html`
