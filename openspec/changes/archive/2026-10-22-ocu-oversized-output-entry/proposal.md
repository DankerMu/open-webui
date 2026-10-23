## Why

A single regular file over the per-file limit (100 MiB, OCU `computer-use-server/outputs_broker.py:33`) makes the whole outputs listing fail (#594). `_scan_tree` raises `LimitExceededError` for that file (`:558-559`), and `app.py:119-120` maps it to 413 `outputs listing failed`. The WebUI turns the 413 into `request_failed` (`src/lib/apis/ocu/index.ts:124`), and the sidebar shows "Workspace files could not be loaded" with no files (`WorkspaceArtifact.svelte:539-552`). This was observed in #173 B-T13 with `truncate -s 101M`. An agent can easily write such a file (a video, a dataset, an archive). After that the user cannot see, download or edit anything in the chat until someone deletes the file from a shell.

The current specs record this as intended: `ocu-outputs-broker` "Configured limit exceeded" lists the file-size bound among the bounds that fail reconciliation, and `ocu-outputs-endpoint` maps exceeded bounds to 413. This change narrows that rule. An oversized file is listed as an entry marked too large. Every other bound keeps failing explicitly.

## What Changes

**OCU** (`DankerMu/open-computer-use`, one PR):

- The broker indexes a regular file over `max_file_size` as an active entry with `hash: null`, and never reads its bytes.
  - It gets a `file_id` and revision events like any other entry.
  - It is excluded from content fingerprints and rename pairing.
  - It still counts toward the active-file limit.
- `_validate_entry` accepts `hash: null` only when `size > max_file_size`. A hashed entry keeps today's bound and pattern. Existing indexes stay valid with no migration, and `SCHEMA_VERSION` is unchanged.
- The listing entry carries `hash: null` and a derived `too_large: true`. Normal entries carry `too_large: false`.
- The standalone preview SPA never auto-selects a too-large entry (`static/ocu-request.js:251-276` `pickAutoSelect` / `applyListingSelection`). Selecting one shows the existing download fallback instead of fetching the file (`static/preview.js:1394` `renderPreviewContent` → `renderDownloadFallback`). Before this change the listing failed, so no fetch over the limit could happen; without this gate the fetch would be unbounded.
- Unchanged:
  - `register_host_write` (the Office publish path) still refuses an oversized file.
  - `_hash_observation` keeps its byte-count guard for a file that grows during the read.
  - Every other limit (active files, index size, scan budgets) still fails with 413.
- Office open on an oversized entry already resolves its `file_id` and refuses with 413 `file_too_large` before it reads any content (`office/sessions.py:225-227`, `office/workspace.py:156-157`). Tests pin this behaviour; the code does not change.

**WebUI fork** (one PR, after the OCU PR merges):

- `WorkspaceFile` gains an optional `too_large?: boolean`. When it is absent the file is treated as not too large, so no existing fixture or literal changes. If it is present it must be a boolean, otherwise the response is `invalid_response`.
- The sidebar lists the entry with a "Too large" marker. Selecting it shows the size and a Download link. Download is path-addressed and has no size check today (OCU `app.py:836-912`); disabling it would be new policy.
- For a too-large file both `office` and `generated` are false, so the selection renders the existing unsupported-file branch with a too-large status text and its Download button. No preview iframe (generated or Office) loads, and no Office preview or editor starts. Edit and Version history are hidden.
- The OCU stub gains a new `oversized` scenario with one oversized `.html` and one oversized `.docx` next to normal files. A Playwright case covers the rows and the gated selection for both.

## Capabilities

### New Capabilities

- `ocu-workspace-oversized-file`: the sidebar lists a too-large file and gates its actions.

### Modified Capabilities

- `ocu-outputs-broker`: "Persistent identity and event revisions", "Cached hash rename evidence", "Unchanged discovery and bounded pages" and "Discovery work has explicit resource ceilings".
- `ocu-outputs-endpoint`: "Broker-backed compatible metadata" and "Explicit broker failure mapping".
- `ocu-workspace-files`: "Separate generated and Office preview trust" and "Selected preview is framed without changing preview behavior". A too-large file takes the unsupported branch.

## Impact

- **OCU:**
  - `computer-use-server/outputs_broker.py` and `computer-use-server/app.py`;
  - `tests/orchestrator/test_outputs_broker.py` and `tests/orchestrator/test_outputs_endpoint.py`, plus one Office session test;
  - `computer-use-server/static/ocu-request.js` and `static/preview.js` (the preview SPA gate);
  - `computer-use-server/README.md` (the broker section).
- **Fork:**
  - `src/lib/apis/ocu/index.ts` and `src/lib/components/chat/WorkspaceArtifact.svelte` (a Critical Path, iframe sandbox: the gating removes an iframe load and never changes sandbox attributes), `WorkspaceSelectedFile.svelte` and `workspace-file-rows.ts`;
  - i18n strings;
  - `scripts/ocu-stub.py` and an e2e case.
- **Rollback is one-way per chat** once that chat has indexed an oversized file. See design.md § Rollback.

## Triage

```text
Issue type: behaviour change (fail-whole-listing -> per-entry marker)
Fixture level: expanded
Upstream suggested level: absent (issue says S-M, P2)
Blast radius: OCU broker index schema (validator widening), listing contract, every listing consumer (WebUI client, sidebar, OCU preview SPA reads entries); Office open path unchanged
Selected risk packs: Schema / persistence; Data integrity / identity; Public API / contract; Error handling; UI state; Compatibility / rollback; Documentation
Evidence floor: broker unit tests for add/grow/shrink/rename/limit-count/validator; endpoint test 200 with too_large and other files; Office open 413 file_too_large on an oversized indexed entry; fork vitest + Playwright stub case; host check on the deployed image with a 101 MiB file
```
