# Broker scan resource ownership

## Change surface and existing mechanism

The current broker uses an iterative descriptor-anchored DFS, then hashes/reconciles, then atomically publishes an index. The constructor already validates strict positive integers against fixed ceilings. Extend those owners in place; no shared scanner framework or second implementation. Source base: OCU `c6322bf`.

## Must add

Constructor keywords `max_scan_entries=50_000`, `max_scan_directories=10_000`, `max_scan_directory_fds=256`, using the existing positive-integer/ceiling validation. No environment settings or endpoint knobs. Limits are per scan, never shared counters on the broker instance.

Count every retrieved directory entry before filtering or stat/hash/open; hidden entries and unvisited hidden-directory names count, but hidden subtrees are not traversed. Permit exactly the entry ceiling; the first excess item only establishes overflow. Count root as one visited directory when it exists; reserve directory allowance before opening a child. Missing-root behavior is unchanged.

Track the borrowed root, owned current/pending directory descriptors and the scandir duplicate. The CPython iterator owns another FD while open and can close it on exhaustion; close its context before acquiring the queued children so accounting need not guess its early-close timing. Check capacity before each acquisition. A positive FD budget of1 is valid but cannot enumerate an existing root, which needs its borrowed FD plus the iterator FD.

Keep iterative DFS and ownership flags. Release owned current/frontier descriptors on every exit, including BaseException; never close the borrowed root inside `_scan_tree`. The root-owning `_scan_metadata` still closes its root. No recursion or ancestor re-walk scheme.

Classify scan root/child acquisition, scandir construction and iterator-advance EMFILE/ENFILE as LimitExceededError naming descriptor/resource exhaustion. Keep missing/replaced paths as existing instability/confinement failures. Shared directory helpers also serve single-path registration/hash work: do not impose scan counters on those callers or silently change their unrelated error contracts.

## Governing invariant and must preserve

A failed discovery returns no successful partial listing, changes no persisted index bytes/counter/file_id/revision and releases its acquired resources. Active-files10000, per-file100MiB, index64MiB and page limits remain unchanged. Hidden/symlink/special-file visibility, root safety, stable hash/rename semantics, Office single-path registration and resolve behavior remain unchanged. HTTP uses the existing path-redacted413 resource mapping, never retryable503 for scan FD exhaustion.

## Sibling surfaces and seams

`reconcile` owns the locked scan-to-index transaction; `_scan_metadata` owns the root; `_scan_tree` owns its children/iterator; directory helpers are reused by hashing/registration. The app's existing broker-to-HTTP mapper is a consumer, not a second policy owner. Tests use real filesystem/FDs and failure injection only at OS boundaries, plus the existing isolated HTTP fixture. No Docker access.

## Verification phases

1. Add a tracer regression through public `reconcile` with a real wide tree exceeding the default descriptor budget and a seeded index; observe semantic RED without missing-constructor/API errors before implementing scan limits.
2. Implement counters/guards and unwind; exact limits pass, first excess work/acquisition is not performed. Cover all entry types, directory root accounting, borrowed-root usability, wide/deep/mixed trees and iterator duplicates. Inject EMFILE/ENFILE at each named acquisition/enumeration seam; use a real constrained-RLIMIT subprocess to establish OS behavior rather than mock counts alone.
3. Prove predecessor bytes/identities/revisions unchanged on failure; remove excess entries and recover with the same authority. Verify resource and lifecycle-lock release, 80-deep traversal, 5000 unchanged files with zero hashes/index rewrite, and the owning broker/endpoint tests.
4. Smoke actual reconcile and HTTP413 against throwaway data; preserve output and remove probes. Complete source cross-review and local CI before paired source/fixture merges.

## Risks, rollback and non-goals

Iterator-internal FDs can evade os.open-only instrumentation: pair boundary tests with native FD observations/RLIMIT evidence. No machine-capacity, wall-clock or cross-chat-global bound is promised. Do not rerun a failed scan as transient, truncate, reset an index, or change the persisted schema. Roll back code by revert; predecessor indexes require no migration. No MCP discovery change (#199), primitive unification (#202), endpoint redesign, deployment or real-Docker certification.
