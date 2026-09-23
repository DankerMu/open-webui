# Design

## Context

Issue16 task9.2, parent D8/D11/D15, canonical ocu-outputs-broker and ocu-public-prefix. Current app.list_outputs independently rglobs files; describe_sandbox emits revision0. Broker is already merged and owns identity/counter under RLock+flock.

## Goals / Non-Goals

Expose existing authority without a second scanner or counter. Preserve current SPA envelope until #17. No preview/UI migration, new scan policy (#68), schema change, Docker acceptance or auth change.

## Decisions

- Keep top-level chat_id/files/total/timestamp; add revision/next_cursor. Map broker entries to existing classify_file metadata; modified=mtime_ns/1e9 stays one release as issue16 explicitly requires. Keep broker path ordering, default100/max1000; no duplicate entries alias. Query cursor optional, limit validated1..1000 (422 invalid).
- URL = configured prefix + /files/ + canonical chat + / + percent-encoded relative POSIX path (quote safe='/'). Preserve directory separators, encode spaces, Unicode, percent, question/hash. No grant/query secret. Routes remain unprefixed internally behind proxy stripping.
- Reconcile on every authorized GET before validator comparison: external writers do not share the lock, so persisted counter alone cannot prove unchanged. Offload blocking lock/hash work with asyncio.to_thread. No Docker client on listing.
- Return weak ETag over deterministic page representation: chat_id/files/total/revision/next_cursor and effective limit, excluding only request timestamp. Include prefix URLs and mtime display values so changing page size, cursor, prefix or metadata cannot reuse an unrelated page validator. SHA256 of canonical JSON metadata is not output-content hashing. Weak rather than strong because timestamp differs across equivalent observations. Do not emit broker unchanged flag (first/repeat observation is not representation identity).
- Apply GET If-None-Match weak comparison after successful reconcile/page validation; support standard quoted tags, W/ tags, comma lists and wildcard. Match returns304 with empty body and ETag plus Cache-Control: no-cache, no-store, must-revalidate. Mismatch returns200. Malformed header is a nonmatch; stale/malformed cursor cannot be concealed by a matching header. Query pages have distinct validators; no first-page-only shortcut.
- Error mapping: stale cursor409; other cursor400; query bounds422; retryable unstable read503 with Retry-After:1; resource limit413; corrupt index, unsafe path, unsupported name, durability or other broker/I/O failure500. Public details generic (no host paths); log operational detail server-side. Errors never become empty200 or304.
- Complete the explicitly deferred parent D11 describe integration: replace revision0 inside describe_sandbox with current_revision under the existing reentrant shared lock, using a local broker import to avoid module initialization cycle. No scan, index creation, sandbox mutation or counter increment from describe; noindex→0. Route maps broker failure instead of returning a fabricated0. Existing lifecycle behavior and response fields otherwise unchanged.

## Risks / Trade-offs

Revision excludes same-size content edits per user decision15. Metadata validators do not fix this blind spot. Describe reports last reconciled authority, not a new filesystem scan. Pagination changes SPA large-directory visibility until #17 consumes next_cursor; this is mandated task9.2, not an unbounded compatibility listing. Scan-resource residual#68 remains unchanged. Broker may commit discovery before rejecting a stale cursor; rejection must never return a mixed page.

## Evidence

HTTP tests use real temporary outputs/index and existing auth environment. Dependencies may be mocked for deterministic Docker describe state and error injection; broker reconciliation itself is real for metadata/pagination/conditional cases. Assert no Docker calls on listing. Test changed file with old validator returns200; page/limit validators cannot suppress different data; unauthorized request with matching validator still401. Prove real encoded URL fetch roundtrip. Preserve auth/prefix suites. Targeted pre-change or disposable-fault RED must reach the intended assertion, not missing imports. No runtime commands by reviewers.
