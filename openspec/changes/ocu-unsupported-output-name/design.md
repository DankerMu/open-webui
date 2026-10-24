## Context

The broker (`computer-use-server/outputs_broker.py`) scans `outputs/` with `os.scandir` on directory fds (`_scan_tree` `:527-600`), keeps a JSON index of active entries with exactly seven keys (`_validate_entry` `:407-438`), and the listing derives `too_large` from `hash is None` (`app.py:190`). Since #627 restore does not reconcile: `_broker_revision` (`deploy/recovery_resources.py`) validates the captured index with the selected release's `current_revision`, which runs `_read_index`/`_validate_index` and so this change's validator.

## Decisions

### D1. What is unsupported

`_unsupported(path)` is true when any segment fails `segment.encode("utf-8")` or contains `\`. These are the names `_require_representable_name` refuses today besides hidden names (dot-prefixed, skipped at `:547-548` before any check) and NUL (impossible in a POSIX name). Including backslash is required, not scope growth: the fork client (`src/lib/apis/ocu/index.ts:62`) and the SPA (`static/preview.js:2383`) already refuse backslash segments, so a backslash entry with a URL would fail the client. One predicate is used by the scan, the validator, the listing, Office admission and the archive.

### D2. Scan

`_scan_tree` stops raising for unsupported names. The name check moves after `entry.stat(follow_symlinks=False)`: symlinks and non-regular entries are skipped as today whatever their name; directories are descended through the same fd-based no-follow traversal (their children's paths contain the unsupported segment and are unsupported); regular files become observations as usual. `os.open` with a surrogate-escaped name and `dir_fd` works on POSIX. `_outputs_http_error` is not changed: after this change `reconcile` never raises `UnsupportedNameError`; the remaining raiser, `register_host_write` (`:157-159`), is reached only from Office save-as and publish, which map broker errors themselves. `test_outputs_endpoint.py:460` stays.

### D3. Index entry and validator

An unsupported file is an active entry with `hash: null`, a uuid4 `file_id`, normal revision events, never read (the `too_large` path at `:712-716`), excluded from fingerprints and rename pairing, so moving it gets a new `file_id`. `_valid_relative_path` is split into the structural check (non-empty, relative, no NUL, no empty/`.`/`..`/dot-prefixed segment) and `_unsupported`. The validator is symmetric: an unsupported path requires `hash: null` (rejecting a digest, mirroring `elif size > max: raise` at `:427-428`, so the index guards "never read"); a supported path accepts `hash: null` only over the size limit, as today.

`_write_index` uses `ensure_ascii=True`: the file stays ASCII and lone surrogates round-trip as `\udcXX`. The index readers (`_read_index` `:345-349`, `recovery_resources._index_snapshot`) are JSON readers; `test_outputs_broker.py:1488` already reads a `\udcff` escape. Existing indexes with non-ASCII UTF-8 names load unchanged and are rewritten escaped on their next write (Chinese names take about twice the bytes, far below the 64 MiB index bound).

Existing tests whose expectations change, listed so the change is deliberate: `test_outputs_broker.py:1486-1509` (a surrogate path with a valid digest now fails as `hash is invalid` instead of `path is invalid`), `:2294` (backslash name now listed, not rejected), `:2317` (surrogate names via a monkeypatched `scandir`; replaced by real-bytes tests).

One-way: an image older than this change rejects an index containing an unsupported path (`path is invalid`), and since tombstones are never pruned (`outputs_broker.py:776`) the index stays unreadable for it even after the file is deleted or renamed, including when a recovery set holding it is restored onto that release. `computer-use-server/README.md` states it beside the rollback paragraph (`:53-58`), as #594 did.

### D4. Listing shape

Every entry carries `unsupported_name` (bool). For an unsupported entry: `path` and `name` are the display form `os.fsencode(x).decode("utf-8", "backslashreplace")` (a backslash name is already valid UTF-8 and is shown as is); `url` is `null` (`_output_file_url` is not called); `too_large` is false (`app.py:190` becomes `hash is None and not unsupported`); `hash` is null; `type`/`mime` come from the display name's suffix. `file_id` is the identity; display forms may collide only between unsupported entries and nothing keys on them (rows are keyed by `file_id`, `WorkspaceArtifact.svelte:582`). The ETag hashes the payload with display forms, so it is deterministic.

### D5. Actions

- Office: only `_create_session`'s admission (`office/sessions.py:199-202`) checks `_unsupported` on the resolved path and refuses with 422 `unsupported_name`, before reading content, beside 413 `file_too_large` (`:104-105`), 415 `unsupported_type` and 422 `unsafe_path`. The other `resolve_file_id` callers (`sessions.py:206`, `:216`, `history.py:52`, `:60`, `publish.py:1071`, `resolution.py:126`, `notice.py:63`, `restore.py:108-117`) resolve existing Office documents; an unsupported entry never becomes one (refused at admission, and it cannot inherit a supported `file_id` because it is never rename-paired). `static/office-editor.js` `REFUSALS` (`:9-13`) gains `['unsupported_name', 422]`.
- Archive (`app.py:751-834`): unsupported entries are dropped while the file list is built, so a chat with only unsupported files keeps the existing 404 `No files found`. This also stops packing backslash-named files, which today's archive includes (`uploads.py:495-505` accepts them); a Windows extractor could treat the backslash as a separator. Stated in `computer-use-server/README.md`.
- OCU SPA: `autoSelectable` (`static/ocu-request.js`) excludes them; `static/preview.js` renders the no-action branch with the reason and no anchor in both download places (`renderDownloadFallback` `:1385-1396` and the toolbar `${selectedFile.url}?download=1` at `:2676`).

### D6. WebUI

`WorkspaceFile.unsupported_name?: boolean` (absent = false; non-boolean = `invalid_response`). `url` must be a string unless `unsupported_name` is true, when it must be `null`; the listing validator skips URL reconstruction for those entries (`index.ts:134-140`), and `workspaceFileUrl` (`:55-77`) returns `''` for them, so the unguarded reactive call in `WorkspaceArtifact.svelte:104-105` never throws (`workspace-reconciliation.ts:575` is already guarded). The row shows the display name and an "Unsupported name" marker; Office and generated-preview actions exclude them (`WorkspaceArtifact.svelte:106`, `:132-134`); selecting one renders the fallback without a download link (`WorkspaceSelectedFile.svelte:67` and `WorkspaceDownloadFallback.svelte` take the no-URL branch; the `{#if selected && downloadUrl}` gate at `:647` gets a branch so the fallback still renders) and a message such as "This file name cannot be opened here. Rename it in the terminal to open or download it." (exact copy settled in implementation; i18n via `npm run i18n:parse`).

### D7. Two pull requests

OCU first (broker, app, Office admission, archive, SPA, README, tests), then the fork (client, UI, stub, e2e, decision record). The fork's stub-based tests do not depend on the deployed OCU. The decision record lands with the fork PR, like #594's.

## Risks / Trade-offs

- Restore: since #627 restore validates the captured index read-only (`_broker_revision`) and never scans `outputs/`. An index recording an unsupported entry validates with this change and is refused by an older release's probe (the one-way note in D3).
- Display forms can collide between unsupported entries; both rows show, with distinct `file_id`s.
- An unsupported file is never hashed, so moving it loses identity.
- `ensure_ascii=True` changes index bytes for non-ASCII names on the next write; recovery compares parsed snapshots (`_broker_revision`), and the Office save-as byte comparisons are within one run.

## Evidence plan

OCU, red on `e3535af` and green after; real names created with bytes paths (`os.fsencode`), each test skipped with a stated reason where the temporary filesystem refuses them (macOS APFS returns EILSEQ), so the Linux container run is the evidence (the restore test's index part needs no real name and runs everywhere):

- broker: a non-UTF-8 file, a file under a non-UTF-8 directory, a non-UTF-8 symlink and a backslash file among normal files → reconcile succeeds; the two non-UTF-8 files and the backslash file are active hashless entries never opened (open counter); the symlink contributes nothing; normal files keep their entries; `_write_index` → `_read_index` round-trip and a second reconcile keep `file_id`s and revisions; the validator rejects a digest on an unsupported path and `hash: null` on a small supported file; an existing index with non-ASCII names loads; the three tests named in D3 updated;
- endpoint: 200 with every other file; the entry has `unsupported_name: true`, `url: null`, display path, `too_large: false`; ETag equal across two unchanged listings;
- Office: session creation for an unsupported `.docx` → 422 `unsupported_name`, no content read;
- archive: download succeeds and omits the entry; a chat with only unsupported files → 404;
- restore: a restore CLI test (`tests/deploy/test_recovery.py`, fake docker running the real helper, reusing `_backup_and_restore`) that writes the live chat's source `.ocu/index.json` directly before backup, as #627's rejected-index test does (a real reconcile cannot build it on `e3535af`): an active entry keyed by a `\udcXX`-escaped path and one by a backslash path, `name` its last segment, `hash: null`, a uuid4 `file_id`, `revision` ≤ counter, no fingerprint. Restore succeeds and the source and destination index bytes are unchanged; on `e3535af` it fails with `broker active path is invalid`. Where the filesystem allows, the same test also creates the real non-UTF-8 file under the live chat's `outputs/` and asserts its bytes in the restored `data/chat/<chat>/outputs`, with the planted surrogate key being that file's escape (#617's restore criterion);
- SPA tests following `test_preview_prefix.py` (no `href="null"` anywhere);
- CI-shaped container run of `tests/orchestrator` and `tests/deploy`.

Fork: `index.test.ts` (accept, url null rule, invalid flag, `workspaceFileUrl` returns `''`), component tests for the row, actions and fallback, stub test, Playwright case following the oversized-file case in `e2e/ocu-workspace.e2e.ts`, `make test-frontend`, `make typecheck`, `make lint-scoped`, `make verify-ui-ocu`, `make decisions-verify`.
