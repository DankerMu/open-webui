## Why

#617. In the sibling `open-computer-use` checkout at `main` `e3535af` (broker, app and Office unchanged since `54be6fb`), one non-UTF-8 file, directory or symlink name anywhere under a chat's `outputs/` fails the whole chat:

- `_scan_tree` calls `_require_representable_name` for every non-hidden entry before it looks at the entry type (`computer-use-server/outputs_broker.py:546-551`); `UnsupportedNameError` aborts the scan, and `_outputs_http_error` maps it to 500 `outputs listing failed` (`computer-use-server/app.py:108-124`). The sidebar lists nothing.
- At `54be6fb`, restore ran the same `reconcile` through `deploy/recovery_helper.py:15-27` → `_broker_listing` (`deploy/recovery_resources.py:1481-1509`); the helper exited 1 and the whole deployment restore aborted. Since #616 (OCU #169) such a name backs up and verifies, so the first failure was at restore time. #627 (OCU #175) replaced that reconcile with a read-only index probe, so restore no longer scans `outputs/` and no longer fails on such a name; the first listing after activation still does, which this change fixes.
- After the broker, three more places break on a lone-surrogate path: `_write_index` encodes UTF-8 with `ensure_ascii=False` (`outputs_broker.py:827`), `_output_file_url` calls `quote` (`app.py:174-175`), and `/files/{chat}/archive` builds `zipfile.ZipInfo(arcname)` (`app.py:751-834`). The WebUI client would also fail: `workspaceFileUrl` runs `encodeURIComponent` on every path (`src/lib/apis/ocu/index.ts:55-77`).

Owner decision (2026-10-23, #617 comment): list such entries but make them non-actionable, following the #594 `too_large` precedent (decision `docs/decisions/implemented/architecture/2026-10-22-ocu-oversized-output-entry.md`).

## What Changes

OCU (`open-computer-use`):

- An output path is **unsupported** when a segment is not UTF-8-encodable (a surrogate-escaped byte) or contains a backslash: exactly the names the scan refuses today, other than hidden names, which stay skipped. The scan no longer raises for them: symlinks and non-regular entries with such names are skipped like any other; directories are descended; regular files are indexed as active entries with `hash: null`, a new `file_id`, revision events, never read, counted toward the active-file limit, left out of fingerprints and rename pairing (the `too_large` treatment).
- The index keeps the path as the Python string (lone surrogates), written with `ensure_ascii=True` so the JSON is ASCII and round-trips losslessly. The validator accepts unsupported paths that pass the structural rules, requires `hash: null` for them, and accepts `hash: null` otherwise only over the size limit; every other structural rule stays. `SCHEMA_VERSION` is unchanged; existing indexes load unchanged.
- The listing emits `unsupported_name: true|false` on every entry, a display form of `path` and `name` (bytes decoded with `backslashreplace`, JSON-safe and deterministic), `url: null` for unsupported entries, and `too_large` only for supported paths (`app.py:190` becomes `hash is None and not unsupported`). The ETag stays a function of the payload.
- Office session creation refuses an unsupported entry with 422 `unsupported_name` in its admission check (`office/sessions.py:199-202`) without reading content; `static/office-editor.js` `REFUSALS` (`:9-13`) gains it. The archive download skips unsupported entries while building its file list, which also stops including backslash-named files that today's archive packs (`uploads.py:495-505` accepts them); a chat with only unsupported files gets the existing 404. The OCU SPA does not auto-select them and renders them without actions or links (`static/ocu-request.js` `autoSelectable`; `static/preview.js` download fallback `:1385-1396` and toolbar download `:2676`).
- `computer-use-server/README.md` (`:42-69`): the behaviour; how to find such files (the listing's `unsupported_name: true`, or a Python one-liner over `<chat_dir>/<chat>/.ocu/index.json` that tests each path with `_unsupported`); the existing oversized-file paragraph corrected (`hash: null` no longer means oversized only, the `grep '"hash":null'` recipe also matches unsupported entries, the rehash-after-raising-the-limit note excludes them); and the one-way note: an image older than this change rejects an index holding an unsupported path as corrupt, and tombstones are never pruned, so deleting or renaming the file does not make the index readable by an older image again; placed beside the rollback paragraph (`:53-58`), it also covers a restore onto an older release, whose probe refuses the index.
- `deploy/BACKUP-RESTORE.md` (`:108-110`, added by #627): unsupported names leave the list of first-listing failures; they are listed as non-actionable entries.

WebUI fork (this repo):

- `WorkspaceFile.unsupported_name` optional boolean; `url` may be `null` only when it is true; `workspaceFileUrl` and the listing validator skip URL reconstruction for those entries.
- The sidebar lists them with an "Unsupported name" marker, excludes them from Office and generated-preview actions, and renders the download fallback branch without a download link and with a message naming the reason.
- `scripts/ocu-stub.py` scenario, stub test, Playwright case, i18n strings via `npm run i18n:parse`, and a decision record.

Must preserve:

- every existing broker identity, revision, rename, limit and confinement rule for supported paths; `too_large` behaviour;
- restore and backup code unchanged (only `deploy/BACKUP-RESTORE.md` changes); restore's read-only probe (#627) validates a captured index that records an unsupported entry with this change's validator (see Impact);
- hidden names skipped before any check;
- no content read for unsupported entries.

Out of scope: the single-file `/files/{chat}/{path}` route (a surrogate path is not addressable by URL; a backslash path keeps today's route behaviour there), MCP resource discovery (`uploads.py:_scan_visible_files`), and renaming or quarantining files in the sandbox.

## Capabilities

### Modified Capabilities

- `ocu-outputs-broker`: modified "Persistent identity and event revisions" and "Cached hash rename evidence"; new "Unsupported output names are listed without being served".
- `ocu-outputs-endpoint`: modified "Broker-backed compatible metadata" and "Explicit broker failure mapping".
- `ocu-workspace-files`: modified "Separate generated and Office preview trust", "Selected file has a compact metadata and download bar" and "Selected preview is framed without changing preview behavior"; new "Unsupported-name workspace files are listed without actions".

## Impact

One unrepresentable name no longer hides a chat's workspace; the user sees the entry and knows why it cannot be opened. Restore stopped scanning `outputs/` in #627, so #617's restore criterion is met there; after activation the chat's first listing now lists such a name instead of failing. An index that records an unsupported entry is one-way: restoring it onto a release without this change is refused by that release's probe (D3).

## Triage

```text
Issue type: behaviour change (owner-decided)
Fixture level: expanded
Upstream suggested level: issue gives none; expanded: broker index format, HTTP shape, Office refusal, archive, SPA and WebUI, two repositories
Blast radius: every chat listing and restore's index validation; a wrong index change corrupts identity for all files in a chat
Selected risk packs: Invariant / state (index validity, identity, one-way index); File IO (real non-UTF-8 names, never read); Public API (listing shape, url null, new reason); Security (no new served path, confinement unchanged); Documentation (README, decision record)
Evidence floor: broker tests with real non-UTF-8 file, directory and symlink names on Linux (skipped with a stated reason where the filesystem refuses them; APFS does); red on e3535af, green after; endpoint 200 with the other files, ETag stable across two listings, index round-trip; a restore whose captured index records an unsupported entry succeeds through `_broker_revision`; archive skips; Office refusal 422; fork: index.test.ts, component tests, stub test, make verify-ui-ocu with the new case, make test-frontend, make typecheck, make lint-scoped; CI-shaped container run of tests/orchestrator and tests/deploy for OCU
design.md: present
```
