## Context

OCU paths are relative to `computer-use-server/` on OCU `origin/main` `e016eb6`, unless stated otherwise.

- **Index entries.** An entry has exactly `file_id, path, name, size, mtime_ns, revision, hash` (`outputs_broker.py:174-182`). `_validate_entry` requires `0 <= size <= max_file_size` (`:415`) and a 64-hex `hash` (`:422`).
- **Fingerprints.** `_fingerprint` is `f"{size}:{hash}"` (`:463`). `_fingerprints` (`:796-803`) and `_validate_index` (`:392`) cross-check them.
- **`_reconcile_index` (`:691-793`).** It hashes every size change and addition (`:707-710`), and pairs removed and added paths by fingerprint to detect renames (`:733-761`).
- **`_scan_tree` (`:520-595`).** It raises at `:558-559` for one file over the limit. `_observe_registered_path` (`:631-632`) and `_hash_observation` (`:673-674`) raise as well.
- **Listing.** `_listing_entry` is at `:806-815`. `app.py` `_listing_files` (`:178-195`) and the ETag payload (`:209-216`) cover every entry field.
- **Office open.** It resolves the `file_id`, then calls `read_workspace_file(..., max_bytes=broker.max_file_size)` (`office/sessions.py:200-227`). That call raises `FileTooLargeError` from `fstat` before any read (`office/workspace.py:156-157`), and the result is 413 `file_too_large` (`sessions.py:104-105`).
- **WebUI.**
  - `validWorkspaceFile` (`src/lib/apis/ocu/index.ts:88-98`) tolerates extra fields and does not read `hash`.
  - `appendPage` requires a non-empty `file_id` and requires `total` to equal the number of files returned (`workspace-reconciliation.ts:277-300`).
  - `backend/open_webui/utils/ocu_client.py:82-83` `refresh()` returns the body to its caller, and no fork backend code reads `hash`. The implementer re-checks this with `grep -rn "'hash'\|\"hash\"" backend/open_webui/{routers,utils}/ocu*`.

## Goals / Non-Goals

**Goals**

- One oversized file never hides the rest of the listing.
- The oversized file has a stable identity, and Office open refuses it with `file_too_large`.

**Non-Goals**

- Raising the limit.
- Hashing or previewing large files.
- Changing any other resource bound.
- Changing download behaviour.
- Supporting a rollback to a pre-change image while an index holds `hash: null` (see Rollback).

## Decisions

### D1. Index oversized files as active entries with `hash: null` (design B)

The issue asks to list oversized files "as entries marked too large (no hash …)". Office open needs a resolvable `file_id` to return `file_too_large`. Without one it returns 404 `unknown_file` (`sessions.py:96-97`).

_Alternative:_ a separate `oversized: [{path, size}]` field outside the index. It needs new client code, because the WebUI ignores unknown top-level fields. It has no `file_id`. And a file that grows past the limit gets tombstoned, so Office answers `unknown_file`. Rejected.

### D2. Widen the validator additively; keep `SCHEMA_VERSION`

`_validate_index` raises `CorruptIndexError` on any other schema version (`:370`). A version bump would therefore make every existing index unreadable after the upgrade. Instead, `_validate_entry` accepts exactly two shapes:

- `hash` is a 64-hex string and `0 <= size <= max_file_size`, as today;
- `hash is None` and `size > max_file_size`.

Every other combination stays `CorruptIndexError`, including a null hash on a small file and a hashed entry over the limit.

The marker lives in one place: `hash: null` in the index. The response flag `too_large` is derived from it in `app.py`, and no second boolean is persisted.

### D3. Fingerprints and renames exclude oversized entries

An entry with `hash is None` is left out of `_fingerprints`, out of the fingerprint cross-check in `_validate_index`, and out of rename pairing. Two oversized files of equal size would otherwise pair as a rename on `size:None`. A moved oversized file therefore gets a new `file_id`, and the old one is tombstoned. This is the same rule as for any unmatched move.

### D4. Reconciliation never reads an oversized file

`_scan_tree` records the observation instead of raising, and the file still counts toward `max_active_files`. In `_reconcile_index`, an addition or size change whose observed size is over the limit gets `hash: None` without calling `_hash_observation`. Crossing the limit is a size change, so the entry keeps its `file_id` and gets a new revision:

- growing past the limit sets `hash` to `None`;
- shrinking below the limit hashes the file.

`_hash_observation:673-674` keeps its byte-count raise as a guard against a file that grows during the read. That race stays a failed reconciliation (413), the same as today.

### D5. Publish stays strict

`register_host_write` → `_observe_registered_path:631-632` still raises `LimitExceededError`. Office never publishes more than the limit; the callback download is already capped (`office/download.py:175,190`). The error mapping in `app.py:108-124` is unchanged.

### D6. Listing contract

`_listing_entry` passes `hash` through, which may be `null`. `_listing_files` adds `too_large: entry["hash"] is None`. The ETag already covers `files`, so a flag change changes the validator. Oversized entries sort and page like every other entry, so `total` and cursors are unchanged.

### D7. WebUI gating

- **Type.** `WorkspaceFile.too_large?: boolean`. In `validWorkspaceFile`, the field is either absent or a boolean; any other value is `invalid_response`. An absent field means "not too large". This keeps every existing literal, mock and stub valid, and it lets a rollback of OCU alone keep working with the new fork.
- **Row.** `buildWorkspaceFileRows` keeps the row, and the row shows the size plus a "Too large" marker.
- **Selection.** For a too-large file, selecting it:
  - makes both `office` (`WorkspaceArtifact.svelte:105`) and `generated` (`:131`) false, so the template falls through to the existing unsupported branch;
  - keeps the unsupported branch's icon and Download button, with the status text "This file is larger than the 100 MiB preview limit.";
  - shows no preview iframe of either kind and starts no Office preview (`startOffice`, `:283-303`); Edit and Version history are hidden (`officeEdit`, `:115`);
  - keeps the bar's Download link (`WorkspaceSelectedFile.svelte:64-73`).

  The iframe sandbox attributes are not touched.

- **i18n.** New strings go through `npm run i18n:parse`.
- **Stub.** `scripts/ocu-stub.py` `_fixture_file` (`:139-152`) emits `too_large: False` for every entry. A new `oversized` scenario in `_fixture_outputs` adds `big.html` and `big.docx`, each with `size` 104857601, `hash: null` and `too_large: true`. Existing scenarios do not change. The download route may serve a small body.

### D8. OCU preview SPA

Only the auto-select paths in `pickAutoSelect` and `applyListingSelection` (`static/ocu-request.js:251-276`) skip entries with `too_large`. A too-large file the user selected stays selected across refreshes. `renderPreviewContent` (`static/preview.js:1394`) renders `renderDownloadFallback` for a too-large entry and never fetches it.

## Rollback

**Once any chat has indexed an oversized file, the index change is one-way**, although `SCHEMA_VERSION` is unchanged:

- A tombstone is copied from the removed entry (`outputs_broker.py:767`), so it keeps `hash: null` and `size > max_file_size`.
- Tombstones are never pruned; they are only written, at `:769`.
- `_validate_index` validates every tombstone through `_validate_entry` (`:402`). An older image rejects the size at `:415` and the hash at `:422`, and returns `CorruptIndexError` (500) for that chat on every listing. Deleting the file does not help.

**Rollback paths:**

1. **Stay on the new image.** This is the recommended path.
2. **Restore a pre-change `index.json`** for each affected chat from a backup. Revisions and file_ids after the backup are lost. The fork's `last_seen_revision` only increases (`backend/open_webui/models/ocu_chat_state.py:37-43`), so it leads the broker counter until the counter catches up. Until then, `_describe_unreachable` reports a revision that is too high (`routers/ocu_workspaces.py:145`), and a backup taken in that window is refused at restore by `_require_cursor_lag` with "cursor leads recovered broker counter" (`deploy/recovery_resources.py:1464-1482`).

**Order.** The fork tolerates a missing `too_large` field (D7), so OCU can roll back without the fork. To be safe, roll back the fork first, then OCU.

**Previous-release activation** (`openspec/specs/ocu-backup-rollback/spec.md:78`). A recovery set whose chat data holds `hash: null` fails `_require_cursor_lag` → `_broker_listing` under an older image (`deploy/recovery_resources.py:1464-1482`) with a corrupt-index error. This is an incompatible rollback candidate under that requirement. The decision record states it, and the OCU README tells operators to check for null hashes, with `grep -l '"hash":null' <chat_dir>/*/.ocu/index.json`. The index is compact JSON with no space after the colon (`_write_index`, `outputs_broker.py:818`).

**Raising the limit later** is out of scope. Doing so would need a one-time rehash of null-hash entries whose size is under the new limit, because `_validate_entry` would reject them. The decision record notes this.

## Must preserve

- Every non-file-size `LimitExceededError` still produces 413, and the prior index is unchanged (`test_outputs_broker.py:431-447` keeps its active-file half).
- Unchanged files are never re-hashed. An unchanged index is not rewritten. Cursor and ETag semantics are unchanged.
- `register_host_write` refuses an oversized file (`test_outputs_broker.py:2909`, the `file-size` case).
- Office open on an oversized file returns 413 `file_too_large` with no content read (`test_office_session_lifecycle.py:689-709`).
- WebUI: every non-too-large file behaves exactly as before, and the A-T01 sandbox cases pass.

## Required evidence

OCU, CI-shaped container: `python:3.13`, uid 1001, `pytest tests/orchestrator -q`. The hosted unit job is disabled.

- **(a) Listing with an oversized file.** The listing returns 200. It lists the small files plus the oversized entry with `hash: null`, a `file_id` and a revision, and the oversized file's bytes are never opened. Prove the no-read with a sparse file and a patched `_hash_observation` spy. Red on `main`: `LimitExceededError`.
- **(b) Crossing the limit.** Growing an indexed file past the limit keeps its `file_id` and bumps the revision once, with `hash: null`. Shrinking it below the limit keeps the `file_id`, bumps the revision and sets `hash`.
- **(c) No rename pairing.** Two oversized files of equal size are moved in one reconciliation. Both moves are tombstone plus new id, never a pairing, and the fingerprints never contain `None`.
- **(d) Validator.**
  - A null hash on a small entry and a hashed entry over the limit both give `CorruptIndexError`. A pre-change index loads unchanged.
  - A new broker instance reads back, through `_read_index`, an index whose active entry and tombstone both hold `hash: null`.
  - The documented `grep -l '"hash":null'` command matches an index written by `_write_index` that holds a null hash.
- **(e) Other limits.** The active-file count is still exceeded with oversized files included. Index size still fails with 413, and the index bytes are unchanged.
- **(f) Endpoint.** `GET /api/outputs/<chat>` returns 200 with `too_large` true and false, and the ETag changes when a file crosses the limit.
- **(g) Office open.** The file has an Office extension (`big.docx`), because `_document_type` (`office/sessions.py:200-203`) gives an oversized `.bin` 415 first. Open goes through the listing-indexed oversized `file_id`: the entry is created by reconcile, not by truncating after indexing. The result is 413 `file_too_large`.
- **(h) Publish.**
  - The register `file-size` rejection is unchanged.
  - In a chat that already holds an oversized entry, `register_host_write` of a small file succeeds.
  - Its successor passes `_validate_index` (`:191`), its fingerprints have no `None` key, and the oversized entry is unchanged.
- **(h2) Preview SPA.** OCU tests in `tests/orchestrator/test_preview_prefix.py`, which already exercises `pickAutoSelect`/`applyListingSelection`, check that auto-select skips a too-large entry and that selecting one renders the download fallback without fetching it.

WebUI fork:

- **(i) Client.** `index.test.ts`:
  - `too_large: true` and `too_large: false` are accepted;
  - a missing field is accepted as not too large;
  - a non-boolean value gives `invalid_response`.
- **(j) Sidebar.** Component tests cover a too-large `.html` and a too-large `.docx`. For each:
  - the row shows the marker;
  - selecting it shows the too-large status and Download;
  - there is no iframe of either kind, no Edit, no Version history and no `startOffice` request.

  Other rows are unchanged.

- **(k) Playwright.** A stub-backed case, run with `make verify-ui-ocu-repeat SPEC=<spec> REPEAT=3` and then `make verify-ui-ocu`. The case covers the listing with the oversized row, the gated selection, and a screenshot in `.run/ui-evidence/`.
- **(l) Host.** After the OCU image is redeployed to the acceptance host, a 101 MiB `truncate`d file in a chat's workspace gives a 200 listing with that entry flagged. The sidebar shows all files, and the "Edit" path for the entry is unavailable. The host is the production-like VPS used for #173, never the LAN instance.
