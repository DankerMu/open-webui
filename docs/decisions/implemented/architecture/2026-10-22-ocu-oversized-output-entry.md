---
id: 2026-10-22-ocu-oversized-output-entry
title: Oversized output files are listed as hashless entries offering only download
kind: architecture
status: implemented
date: 2026-10-22
supersedes: none
references: DankerMu/open-webui#594, DankerMu/open-computer-use#164, ocu-oversized-output-entry
---

# Oversized output files are listed as hashless entries offering only download

## Problem

The OCU outputs broker reads and hashes every new or resized output file. It
refuses one regular file over the 100 MiB per-file limit, and the whole
`GET /api/outputs/<chat>` listing then fails with 413. The WebUI sidebar shows
"Workspace files could not be loaded" and lists nothing. One large file an agent
writes (a video, a dataset, an archive) therefore hides every other file in the
chat until someone deletes it from a shell.

## Decision

**OCU.** The broker indexes a regular file over its per-file limit as an active
entry with `hash: null` and never reads its bytes. The entry gets a `file_id`
and revision events like any other, still counts toward the active-file limit,
and is left out of content fingerprints and rename pairing. A moved oversized
file therefore gets a new `file_id`, and the old one is tombstoned. Crossing the
limit in either direction is a size change that keeps the `file_id`. The index
validator accepts `hash: null` only when the size is over the limit, so
`SCHEMA_VERSION` is unchanged and existing indexes load without migration. The
listing derives `too_large` from the null hash; no second marker is persisted.
Office publish of an oversized file and every other resource bound still fail
with 413. Office open of an oversized entry resolves its `file_id` and refuses
with 413 `file_too_large` without reading content.

**WebUI.** `WorkspaceFile.too_large` is an optional boolean. A listing that
omits it is accepted as "not too large"; a present non-boolean value makes the
listing `invalid_response`. The sidebar lists a too-large file with its size and
a "Too large" marker. Selecting it renders the unsupported-file branch, with
status text naming the 100 MiB preview limit and a Download action. Neither the
generated-content iframe nor the Office preview iframe loads, no Office preview
starts, and Edit and Version history are hidden. Download stays available,
because the download route is path-addressed and has never had a size check.
The iframe sandbox attributes do not change.

The canonical requirements are in the `ocu-workspace-oversized-file` and
`ocu-workspace-files` specifications.

## Alternatives considered

- **A separate top-level `oversized: [{path, size}]` list outside the index** —
  the WebUI ignores unknown top-level fields, so it needs new client code. Its
  files have no `file_id`, so Office open answers 404 `unknown_file` instead of
  413 `file_too_large`. A file that grows past the limit leaves the index and is
  tombstoned, which changes its identity.
- **Bump `SCHEMA_VERSION` for the new entry shape** — the validator rejects any
  other schema version, so every existing index becomes unreadable after the
  upgrade.
- **Hash the oversized file anyway** — reading over 100 MiB per reconciliation is
  the work the limit exists to prevent.
- **Raise the per-file limit** — moves the threshold without fixing the
  whole-listing failure.
- **Disable download for a too-large file** — would be new policy; downloads have
  never been size-checked.

## Consequences

**Rollback is one-way per chat** once that chat has indexed an oversized file. A
tombstone is copied from the removed entry, so it keeps `hash: null` and an
over-limit size. Tombstones are never pruned, and the validator checks every
tombstone. A pre-change OCU image rejects that index as corrupt and answers 500
on every listing of the chat, even after the file is deleted.

**Previous-release activation.** A recovery set whose chat data holds a
`hash: null` entry is an incompatible rollback candidate under the "Compatible
previous-release activation" requirement in `ocu-backup-rollback`. Under the
older image, restore validation lists the chat through the broker
(`_require_cursor_lag` in OCU `deploy/recovery_resources.py`) and fails with a
corrupt-index error. The OCU README gives the command that finds affected chats,
with `<chat_dir>` set to `BASE_DATA_DIR`:

```bash
grep -l '"hash":null' <chat_dir>/*/.ocu/index.json
```

**Rollback order.** The WebUI tolerates a listing without `too_large`, so OCU
can roll back alone. The safe order is still WebUI first, then OCU.

**Rollback paths.**

1. Stay on the new OCU image. This is the recommended path.
2. Restore a pre-change `index.json` from a backup for each affected chat. The
   revisions and `file_id`s created after that backup are lost. The operator
   must also handle two further consequences:
   - **The WebUI cursor leads the broker.** `ocu_chat_state.last_seen_revision`
     only increases. After the restore it is ahead of the broker's revision
     counter until the counter catches up. In that window an unreachable
     workspace reports the higher cursor revision. A backup taken in that window
     is refused at restore by `_require_cursor_lag` with
     "cursor leads recovered broker counter".
   - **The oversized file must leave `outputs/`.** A pre-change image still
     fails its scan on any regular file over the limit. If the file stays in the
     chat's `outputs/` tree, the restored index is accepted but the listing
     returns 413 for the whole chat again. Move the file out of `outputs/` before
     the older image lists that chat.

**Raising the limit later.** The validator rejects a null hash on a file within
the limit. Raising the limit therefore needs a one-time migration before the new
limit is served: every null-hash entry whose size falls under the new limit is
rehashed. Tombstones also keep null hashes but have no file left to read, so the
same migration must decide their shape.
