## Context

`app.download_archive` enumerates `outputs.rglob`, selects regular files, and writes output-relative ZIP names. The broker skips hidden entries during traversal; its private path validator additionally rejects other names, so calling it from the archive would broaden this issue's behavior change. Current upload staging is outside outputs in private `.ocu`; the issue's original shared-directory writer description is historical, not a reason to move staging back.

## Decision

Keep the archive reader and ZIP response machinery. Add the minimal output-relative hidden-component filter at its existing membership selection; do not introduce a generic discovery abstraction, alter supported visible names, or modify writer code. Check every relative component, not only the leaf: a visible leaf below `.private` must remain hidden. Filtering only `.upload-*` would couple the reader to a historical staging convention and is not the issue's recommended policy.

Governing invariant: hidden output paths never become archive members; visible completed files retain their full bytes and relative ZIP names.

Must preserve: authorization/chat validation, content type/disposition, cache/isolation header behavior, missing/empty-directory errors, visible nested files, upload no-replace claims, collision names, receipt and private-stage cleanup.

Sibling surfaces: archive route; current private upload staging and atomic claim; broker hidden-entry listing. Only archive membership changes. The broker's full path validator is not an archive acceptance policy.

## Evidence

Tests first: an open `.upload-*` file, closed stale residue, hidden directory with visible children, and ordinary visible nested files. Inspect ZIP member names and exact payloads. A hidden-only directory follows existing no-archivable-files404 behavior. A successful actual upload and a collision remain downloadable in the archive under their actual returned names with distinct complete bytes.

Run existing `tests/test_files_headers.py`, owning archive/upload tests and HTTP authorization coverage. A disposable uvicorn TCP smoke uploads two payloads, seeds hidden residue, downloads ZIP and verifies exact visible membership/bytes, then checks hidden-only404. Parent executes all checks; agents run none. Update owning documentation after proof, then expanded correctness, test-evidence/spec-compliance and integration review.

## Non-goals and limitations

No stale-temp reaper, retry, writer refactor, index reconciliation, archive memory/size cap, snapshot isolation, symlink or race-hardening redesign, cache-header change or source pin update. Existing archive traversal and in-memory ZIP resource behavior remain unchanged; this is not a sandbox-containment certification. No UI/image/Linux/LAN acceptance is required for this server-side visibility change.

Rollback reverts the reader filter; no persisted data or names are migrated. Existing hidden files are retained on disk, never deleted.
