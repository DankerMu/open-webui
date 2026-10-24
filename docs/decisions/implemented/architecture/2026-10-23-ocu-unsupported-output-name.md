---
id: 2026-10-23-ocu-unsupported-output-name
title: Output files with unsupported names are listed as entries without actions
kind: architecture
status: implemented
date: 2026-10-23
supersedes: none
references: DankerMu/open-webui#617, DankerMu/open-computer-use#176, ocu-unsupported-output-name, 2026-10-22-ocu-oversized-output-entry
---

# Output files with unsupported names are listed as entries without actions

## Problem

The OCU outputs broker refuses a path whose segment is not valid UTF-8 or
contains a backslash. Its scan checked the name of every entry that is not
hidden before it looked at the entry type, so one such file, directory or
symlink anywhere under a chat's `outputs/` aborted the scan. The whole
`GET /api/outputs/<chat>` listing failed with 500, and the WebUI sidebar showed
"Workspace files could not be loaded" with nothing listed. Such names come from
writes inside the sandbox, for example `unzip` of a GBK archive, which the
broker cannot intercept. Before #627, restore ran the same scan and aborted the
whole deployment restore. The index writer, the file URL builder, the archive
and the WebUI client could not handle such a path either.

## Decision

The owner chose "list it, but without actions" on 2026-10-23, following the
oversized-file precedent (`2026-10-22-ocu-oversized-output-entry`).

**One predicate.** A path is unsupported when a segment cannot be encoded as
UTF-8 (a surrogate-escaped byte) or contains a backslash. Hidden names are
still skipped before any check. The scan, the index validator, the listing,
Office admission and the archive all use this one predicate. Backslash names
are included because the fork client and the OCU preview page already refuse a
backslash segment in a URL.

**OCU scan and index.** The scan no longer raises for such names. Links and
special files are skipped as before, directories are descended, and a regular
file becomes an active entry with `hash: null`, a new `file_id` and normal
revision events. Its bytes are never read. Like an oversized entry it counts
toward the active-file limit and is left out of fingerprints and rename
pairing. The index keeps the real name and is written as ASCII JSON, so a byte
that is not UTF-8 is stored as a `\udcXX` escape and reads back unchanged. The
validator requires `hash: null` for an unsupported path and still accepts
`hash: null` on a supported path only over the size limit. `SCHEMA_VERSION` is
unchanged.

**OCU listing and actions.** Every listing entry carries `unsupported_name`.
For an unsupported entry, `path` and `name` are display forms (each byte that
is not UTF-8 reads `\xNN`; a backslash name is shown as is), `url` is null,
`too_large` is false and `hash` is null. `file_id` is the identity. Office
session creation refuses the entry with 422 `unsupported_name` before reading
content. The archive leaves it out, and the OCU preview page shows it without a
link.

**WebUI.** `WorkspaceFile.unsupported_name` is an optional boolean; absent means
false and a present non-boolean makes the listing `invalid_response`. `url` must
be null when the entry is marked unsupported and a string otherwise; any other
combination makes the listing `invalid_response`. `workspaceFileUrl` returns an
empty string for a marked entry without checking its display path, so a display
path with `\` no longer rejects the listing. The sidebar row shows the display
name and an "Unsupported name" marker. Selecting the row shows the file bar
without a download action and a status text explaining that the name cannot be
opened here and must be renamed in the terminal. No generated-content or Office
iframe loads, no Office preview starts, Edit and Version history are hidden, and
nothing is fetched for the file.

The `ocu-workspace-oversized-file` requirement that files not marked
`too_large` "behave as before" yields to the `ocu-workspace-files` exceptions
for entries marked `unsupported_name`: such an entry has `too_large: false`
and still has no preview, download or Office action.

The canonical requirements are in the `ocu-outputs-broker`,
`ocu-outputs-endpoint` and `ocu-workspace-files` specifications.

## Alternatives considered

- **Skip unsupported entries and report them separately** — leaving the file out
  of the listing hides a file that exists in the sandbox, which reads as data
  loss. A separate count or list has no `file_id`, needs new client code, and
  makes Office answer 404 `unknown_file` instead of naming the reason.
- **Keep failing loudly, with an operator path to find and rename the name** —
  one name still hides every other file in the chat until someone with shell
  access renames it, the same harm #594 fixed for oversized files.
- **Reject such names at write time** — the chat's `outputs/` is a kernel bind
  mount, so the broker never sees container writes. Rejecting them needs an
  in-sandbox wrapper, a filesystem layer, or a sweep that renames or
  quarantines files, which is more machinery than a broker change and still
  leaves the listing failure until it exists.
- **Give unsupported entries a URL** — a surrogate path has no URL that the
  single-file route can address, and a backslash segment is refused by the fork
  client and the OCU preview page.

## Consequences

**One-way index per chat.** An image older than this change rejects an index
holding an unsupported path as corrupt (`path is invalid`). Tombstones are
never pruned, so deleting or renaming the file does not make the index readable
by an older image again. A recovery set holding such an index is therefore not
a valid previous-release rollback candidate: restored onto an older release,
the affected chat fails that release's index check, during restore when the
chat is live with a cursor and otherwise on its first listing. The OCU README
states this beside its rollback paragraph and gives a command that lists
unsupported paths per chat.

**Rollback order.** A WebUI with this change accepts a listing without the
marker, so deploy the WebUI first, then OCU. No rollback order keeps an affected
chat listable. A WebUI fork without this change rejects a listing that holds an
unsupported entry as `invalid_response`: its file URL check refuses the `\` in
the display path and the null URL. An older OCU rejects the chat's index with
500 (one-way, above). Chats without an unsupported entry list normally in either
order.

**Archive.** The archive no longer packs backslash-named files, which earlier
releases included; a Windows extractor could have treated the backslash as a
path separator. A chat holding only unsupported files gets the existing 404.

**Identity.** An unsupported file is never hashed, so moving it gives it a new
`file_id`. Display forms can collide between unsupported entries; rows are keyed
by `file_id`, so both rows show.

**Index bytes.** Writing ASCII JSON changes the bytes of an existing index with
non-ASCII UTF-8 names on its next write (Chinese names take about twice the
bytes). Recovery compares parsed snapshots, so this changes no comparison.

**Not covered.** The single-file `/files/{chat}/{path}` route, MCP resource
discovery and renaming or quarantining files in the sandbox are unchanged. The
user renames the file in the terminal to open, download or archive it.
