# Bounded MCP discovery transaction

## Context and invariant

The existing scanner owns descriptor-relative visibility; `mcp_resources.py` is the only OCU writer of the pinned MCP 1.27.0 registry. That SDK's `ResourceManager.list_resources` copies one dictionary's values and `get_resource` performs one lookup; neither takes the writer lock. Its list conversion/serialization remains synchronous but is bounded by the process resource cap.

Governing invariant: one admitted discovery either publishes a complete bounded replacement visible to actual MCP readers, or reports failure while retaining the predecessor snapshot and every already committed upload.

## Decisions

- Keep the existing scanner and registry owners. Add fixed ceiling constants and a typed, path-redacted discovery failure carrying stable reasons: `busy`, `file_limit`, `registry_limit`, `entry_limit`, `directory_limit`, `descriptor_limit`, `io_error` and `internal_error`. No environment knobs or second broker. Preserve missing-root empty discovery, hidden/symlink/special exclusion, no-follow reads and nested URI/MIME behavior.
- Enforce entries before filtering; count root and all held directory/iterator FDs. Iterative traversal owns explicit cleanup on every exit, including child-fstat and iterator failures. Bound pending names by the entry budget. EMFILE/ENFILE map to descriptor exhaustion; other scan IO errors are explicit rather than successful omission. Never close a borrowed root inside the scanner.
- Admit at most one preparation process-wide with a nonblocking threading primitive, before submitting worker work. Reject excess as `busy`; do not queue blocked discovery jobs in the shared executor or retain per-chat locks/failed records. Admission ownership covers submission failure, queued cancellation and running cancellation. Shield successfully submitted work from caller cancellation so its worker eventually releases admission in `finally`; submission failure releases admission without work. A cancelled caller never releases admission while queued or running preparation still owns it. Prove cancellation before start, after start and at the start race without double release or overlap.
- The worker scans, sorts, checks replacement-aware process capacity, constructs resources and copies the committed registry off-loop. Remove only the predecessor chat contribution, insert the complete replacement, then rebind the SDK registry attribute once. Never mutate a published dictionary. Successful empty discovery removes its chat record. Writer-only accounting is updated while admission is held; FastMCP readers use only the published dictionary. The worker sync entrypoint uses the same transaction, not a second loop-bound lock.
- Preserve existing integer sync result and request-context notification behavior; notification failure is not discovery failure after publication. The SDK's full-list serialization remains bounded at 20,000 workspace resources and is included in loaded latency acceptance.
- Upload responses retain HTTP200 and existing success fields. Add a failure-only `discovery` object `{status: "failed", reason: <stable reason>}`; omit it on success. Do not expose exception strings/host paths or turn a committed upload into a save error. Preview UI shows a distinct text-only stored-but-discovery-failed notice without a re-upload action; every WebUI tool wrapper includes a separate warning in its returned tool text while retaining successful-publication counts and attachment receipts. Carry warnings per call, never on shared tool-instance state.
- Move creation-time discovery before Docker create/start, after ensuring the files root exists. Map failure to the existing `LaunchFailed` HTTP503 boundary with a fixed safe message naming the discovery reason. This prevents newly running orphan state and covers the create-conflict adoption branch. Existing tool/launch consumers already surface lifecycle errors; no WebUI error-map redesign. A later Docker failure does not roll back valid file resources: their authority is the filesystem, not sandbox running state.

## Sibling surfaces and preservation

Upload POST, its response model, standalone/embedded preview upload, attachment synchronization tool and creation-time lifecycle discovery share the one pipeline. Preserve no-replace storage, receipt replay, checksum/size/filename fields, unauthorized guards, `/api/outputs` identity/pagination and Office publication. Resource content reads remain filesystem reads, not versioned file-content snapshots; atomicity covers registered resource membership.

## Evidence and phases

Fixture review precedes implementation. Focused red/green tests cover actual list/read results, bounded intermediate resources, exact/overflow limits, failures and both consumer paths. Then parent-owned runtime acceptance drives actual discovery/real MCP reads with temporary files and sustained external-loopback samples, plus real route/UI/tool outcomes. `tasks.md` fixes thresholds and commands; three independent source-review seats cover correctness, test/spec evidence and concurrency/resource ownership.

## Risks and rollback

Busy admission trades concurrent synchronization throughput for bounded work; consumers must report it honestly and never auto-retry committed publication. Cancelled callers cannot stop a running filesystem scan; its worker retains admission until completion. Private SDK access depends on the existing version pin and real-reader regression tests. No source-level timing claim substitutes for the reference workload gate. Rollback is a coordinated source revert; no persisted migration, data deletion, image build or deployment is required. Native Linux timing and arbitrary LAN hardware are not certified by this local reference run.
