# Spec Delta

## Purpose
How new and changed outputs (产物) reach the sidebar reliably: stable `file_id`, a per-chat monotonic `revision` counter owned by the OCU outputs broker, the `ocu:workspace_changed` hint, chat-keyed dirty flag, polling reconcile, prefixed SPA requests, and in-message preview-link recognition. Source: Plan 1 § 1 file_id 机制, § 4; design D8, D11, D15, D16, D17.

## ADDED Requirements

### Requirement: File identity and revision
OCU outputs metadata SHALL carry `file_id`, relative `path`, `name`, `mime`, `url` (prefixed per design D15), `size`, `type`, `mtime_ns`, `revision` and `hash` (hash present only when computed); the broker SHALL keep one monotonic per-chat counter persisted in its index, SHALL increase it by one on every detected content change, SHALL stamp each changed entry's `revision` with the counter value at that change (unchanged entries keep their value), and SHALL report the current counter as the listing's `revision`; `file_id` SHALL survive a rename (delete+create pair with equal size and equal SHA-256), a reused path SHALL NOT inherit a deleted file's id, and deletes SHALL leave tombstones. Detection SHALL be size- and path-based plus rename hashing only; an in-place edit with unchanged size and forged mtime is a documented blind spot (design D8).

#### Scenario: Rename keeps id (A-T10)
- **WHEN** `report.html` is renamed to `final.html` between two reconciles
- **THEN** the entry keeps its `file_id` and `revision` increments once

#### Scenario: Path reuse gets a new id (A-T10)
- **WHEN** `a.txt` is deleted and a new `a.txt` with different content is created
- **THEN** the new entry has a new `file_id` and the old id is a tombstone

#### Scenario: Size change with forged mtime
- **WHEN** a file's content changes size and its mtime is restored with `touch -r`
- **THEN** the reconcile still bumps the counter and the entry's `revision` because size differs; mtime is never consulted for identity

#### Scenario: Per-file revision stamps
- **WHEN** `a.html` changes while `b.html` does not
- **THEN** the listing's counter increments once, `a.html` carries the new value and `b.html` keeps its previous `revision`, so `path + revision` for `b.html` is unchanged

#### Scenario: No full hash scan
- **WHEN** a directory of 5 000 unchanged files is reconciled
- **THEN** no file is hashed and the response is a fast "unchanged" with the current revision

### Requirement: Listing limits
Outputs listing SHALL enforce count and size limits, paginate, and return quickly when unchanged (`If-None-Match`/revision short-circuit).

#### Scenario: Oversized directory (A-T10)
- **WHEN** outputs contains more entries than the page limit
- **THEN** the listing returns the first page, a cursor, and the total, and the sidebar shows a "more" control

### Requirement: Change notification is a hint
After `_run_tool` completes, OCU SHALL emit `ocu:workspace_changed` with payload `{chat_id, reason}` only, to the owner's socket room from the server side; the frontend handler SHALL set a chat-keyed dirty flag and nothing else; `revision` SHALL come only from the authorized describe/outputs GET.

#### Scenario: Notification without model link (A-T11)
- **WHEN** a tool writes a file and the model's reply contains no link
- **THEN** the sidebar shows the new file after the next reconcile triggered by the dirty flag

#### Scenario: Handler placement
- **WHEN** an `ocu:workspace_changed` event arrives with no `message_id`
- **THEN** it is handled before the `history.messages[event.message_id]` gate in `Chat.svelte` and not dropped

#### Scenario: Browser cannot forge
- **WHEN** a browser client emits `ocu:workspace_changed` itself
- **THEN** no other client receives it and no reconcile is triggered server-side

### Requirement: Reconcile without events
Polling (3 s foreground, 15 s background, existing cadence) and page reconnect SHALL perform a full reconcile keyed on `path + revision`; `event_emitter=None` and lost events SHALL be tolerated (A-T11).

#### Scenario: event_emitter is None (A-T11)
- **WHEN** a tool runs through the automation or external API path where `event_emitter` is None
- **THEN** no notification is sent, no error is raised, and the file appears within one polling interval

#### Scenario: Out-of-order responses
- **WHEN** two outputs responses arrive with revisions 7 and 6 in that order
- **THEN** the store keeps revision 7

#### Scenario: Background chat is not refreshed
- **WHEN** chat A receives a notification while chat B is open
- **THEN** A's dirty flag is set and no request for A is made until A is opened

#### Scenario: Tool failure with output (A-T11)
- **WHEN** a command fails but leaves a file in outputs
- **THEN** the file is reconciled; the notification's presence or absence is not used as the tool's success signal

### Requirement: preview.js migration
`preview.js` change detection SHALL key on `path + revision` (the entry's stamp) instead of `f.modified`; every request the SPA makes SHALL go through one fetch wrapper that adds `X-Requested-With: ocu-workspace` (design D16) and prepends the public prefix only to client-constructed root-absolute paths, leaving server-emitted URLs (`apiUrl`, `filesBase`, entry `url`) verbatim and being a no-op for any path that already starts with the prefix (design D15); the inline heartbeat in the HTML shell SHALL use the same prefix and header; no address SHALL be guessed client-side; the DOCX/XLSX/PPTX views SHALL carry a visible "内容预览" label.

#### Scenario: Office preview is labelled as a content preview (A-T02)
- **WHEN** a DOCX, XLSX or PPTX file is shown in the Files view
- **THEN** the view carries a visible "内容预览" label stating that pagination and layout may differ from Office, and no UI text claims page-accurate rendering

#### Scenario: Wrapper adds prefix and header
- **WHEN** the SPA calls start-ttyd, upload, `sessions` or the heartbeat with a client-constructed path
- **THEN** the request URL starts with the configured prefix exactly once and carries `X-Requested-With: ocu-workspace`

#### Scenario: Wrapper never double-prefixes
- **WHEN** the SPA fetches an entry's server-emitted `url` (`/ocu/files/{chat_id}/a.html`) or `apiUrl` through the wrapper with `OCU_PUBLIC_PREFIX=/ocu`
- **THEN** the request URL is unchanged (`/ocu/files/…`, never `/ocu/ocu/…`)

#### Scenario: Modified file refreshes (A-T01, A-T02, A-T03, A-T04)
- **WHEN** the agent modifies an HTML, DOCX, XLSX or PPTX file already open in the sidebar
- **THEN** the view refreshes to the new content with no stale cache, sheets/pages switch correctly, XLSX formulas without cached values are shown as uncomputed, and PPTX render errors offer a download fallback

### Requirement: In-message preview links
The fork SHALL recognise, in source (no minified patch), preview links appended by `computer_link_filter.py` only when they match the configured `/ocu/` base (the same `PUBLIC_BASE_URL` the filter uses) and the current chat_id; recognition runs in a pure function and is applied by one delegated click handler in `Chat.svelte` on the messages container (message rendering components are not modified); recognised links open the sidebar on that file; any other URL in model output is rendered as an ordinary link and never embedded.

#### Scenario: Foreign link is not embedded
- **WHEN** a model reply contains `https://evil.example/ocu/files/C/x.html` or a link for another chat_id
- **THEN** it is rendered as a plain link and the sidebar does not open
