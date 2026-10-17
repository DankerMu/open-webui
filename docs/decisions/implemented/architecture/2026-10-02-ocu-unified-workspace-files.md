---
id: 2026-10-02-ocu-unified-workspace-files
title: One writable workspace files directory per chat
kind: architecture
status: implemented
date: 2026-10-02
supersedes: none
references: Plan 2 B0, ocu-office-editing D2 and D3, issue 113, issue 199, issue 200, issue 201, issue 202, 2026-10-03-ocu-office-editor-selection
---

# One writable workspace files directory per chat

## Problem

Separate upload and output directories split the user's files from the Agent's editable files. Office editing needs one authoritative location; copying between two locations makes ownership and repeat attachment synchronization ambiguous.

## Decision

Use `{BASE_DATA_DIR}/{chat_id}/outputs` as the single workspace files directory, mounted read-write at `/mnt/user-data/files`. Keep `/home/assistant` on its per-chat named volume as private working storage, outside listings and file serving. The sandbox image contains neither legacy user-data directory nor compatibility symlink; root owns `/mnt/user-data` and the sandbox user cannot create a legacy path there.

Uploads publish into the shared directory using the existing per-chat lock and no-replace hard-link claim. Attachment receipts prevent repeated synchronization from overwriting edits or resurrecting renamed/deleted files. The outputs broker assigns file identity through its existing reconciliation path. MCP retains its `file://uploads/{chat_id}/...` URI shape while sourcing visible workspace files and excluding hidden paths.

Uploads and Office copies share the numbered-name policy: query `PC_NAME_MAX` on the pinned destination directory, reserve filesystem-encoded bytes for the complete last suffix and current ` (N)`, and retain the longest whole-character stem prefix. Use `_` only when no original stem character fits. A legal free upload name is attempted unchanged. Insufficient capacity fails explicitly (upload HTTP400); an unavailable limit remains an IO failure, never a guessed255-byte limit. Atomic claims still choose the winner, and Office recovery recognizes owned copies by identity rather than spelling.

Output ZIP membership excludes every dot-prefixed output-relative component, including hidden-directory descendants and historical upload staging residue. Payload acquisition reuses the workspace no-follow reader with the requested chat identity. Each member transfers from one owned verified descriptor into a writable ZIP entry in fixed 1 MiB chunks through EOF, never reopening the selected pathname. Selected symlinks, including in-tree aliases and root/ancestor replacements, fail closed before response publication. Source and ZIP failures release the descriptor and abort without publishing a successful partial archive. Source acquisition/read absence retains its HTTP404 mapping; ZIP failures are not translated as source absence. Completed visible uploads retain their exact bytes and actual stored names, including empty files; hidden entries remain untouched. Archive headers, upload publication and the MCP bytes/MIME reader contract are unchanged.

ZIP entries explicitly use current local time and DEFLATE rather than bare `ZipInfo` defaults. ZIP64 headers are deliberate even for small members: source sizes are unknown until EOF and may grow across the format boundary after the local header is written. Relative names and decoded bytes are preserved, not byte-identical ZIP containers, filesystem timestamps or permission attributes. Uncompressed member staging is bounded; the completed compressed ZIP remains in memory before response publication, so total archive memory still grows with compressed content and enumeration. Reads are not content snapshots under concurrent same-inode writes.

Single-file inline/download responses acquire one regular-file descriptor through the same workspace reader and retain it through bounded streaming. Header metadata derives from that descriptor, not a later path stat. Existing in-root aliases may resolve to a relative candidate, but the original chat identity controls authoritative no-follow acquisition. Framework helpers own MIME/disposition/validator encoding; their path-reopening body sender is never used. An owned response child retains acquisition and setup-worker results through native caller cancellation; task-group exit joins it before ownership ends, and framework exception-group collapse preserves pre-header HTTP errors. Non-abandoned reads finish before close, and cancellation is observed before publishing a completed chunk. Unexecuted response objects own no descriptor.

Uploads and the outputs broker share pure descriptor-open flags, errno classification and verified directory/regular-file acquisition. Each caller retains its error policy, including the distinction between open failure, post-open type rejection and metadata failure; neutral primitive failures do not enter public exception chains. Cleanup preserves the caller's strict or best-effort behavior without closing borrowed roots. Staging/write policy, broker control-directory prechecks and scan-only resource mapping remain with their existing owners.

Broker control-directory preparation and both upload receipt creation paths synchronize the exact chat-root parent before successful persistence, retaining state-file and control-directory synchronization. Path-based creators pin the no-follow parent before descriptor-relative mkdir; upload preparation borrows its existing chat descriptor. Create-capable preparation also synchronizes existing control entries for the interrupted-creator reason recorded in [the lifecycle decision](2026-09-22-ocu-lifecycle-lock-and-launch-semantics.md). Parent failure propagates before acknowledgement, preserves committed state and releases owned descriptors without closing borrowed roots. No receipt/index format or atomic-replace policy changes; syscall-order and fault evidence is not a physical power-loss test.

The server mount map, recovery attribution, prompt/tool/skill guidance and sandbox image configuration change together. The host directory and HTTP interface names stay fixed. This accepts a permanent divergence from upstream OCU in the consumers of sandbox paths.

MCP discovery is complete or explicitly failed: at most 10,000 visible resources per chat and 20,000 registered workspace resources per process, with no other-chat eviction. Each scan permits 50,000 enumerated entries, 10,000 directories including root and 256 simultaneous directory descriptors including iterator duplicates. Count before filtering; do not descend hidden directories. Exact limits are allowed; resource/IO failures preserve the previous registered snapshot rather than returning partial success.

One nonblocking process-wide admission bounds preparation across async and worker callers. Excess calls receive `busy`, without a discovery queue. Traversal, metadata, sorting, resource construction and registry copying run off-loop; one dictionary reference replacement publishes the complete snapshot to the pinned FastMCP readers. Successfully submitted work retains admission through cancellation, including while queued; its worker owns final release. Empty and failed chats do not accumulate registry bookkeeping.

Committed uploads retain HTTP200, stored filename, size, checksum and receipt semantics. A failed discovery adds `discovery: {status: "failed", reason: <stable code>}`; successful discovery omits the field. The preview displays a separate stored-file warning, and tool results include a per-call warning without republishing bytes. Initial lifecycle discovery runs before Docker create/start and reports failure through the existing launch-error boundary, preventing a discovery failure from leaving a newly running sandbox that later requests mistake for a completed initialization.

## Alternatives considered

- **Mount one directory at both legacy paths** — a copy between paths can truncate its own source; aliases also preserve contradictory guidance.
- **Keep two writable directories** — retains the visible split and requires changing every single-root assumption in the broker and sidebar.
- **Rename the host directory and HTTP interfaces too** — adds migration and client/proxy churn without changing the user-visible result.
- **Skip imports when a filename exists** — cannot distinguish attachment identity; it resurrects a renamed/deleted import and conflates different attachments sharing a name.
- **Add compatibility symlinks** — silently accepts stale model guidance instead of making an invalid write fail.
- **Truncate or silently evict MCP resources** — hides files or another chat's resources without reporting failure.
- **Offload unbounded discovery behind a writer-only lock** — neither bounds queued preparation nor protects SDK readers that never take that lock.
- **Fail discovery after starting a sandbox** — a later running-state lookup can bypass discovery and erase the failure from the initiating flow.
- **Resolve a path, then let ZIP reopen it** — a sandbox writer can replace a validated leaf or ancestor before the read. Reusing the owned verified descriptor for bounded transfer avoids pathname reopening and a second containment implementation.
- **Stage complete uncompressed members before ZIP writes** — retains member-sized payload buffers in addition to the compressed archive. Direct descriptor-to-member transfer bounds that staging without whole-archive streaming, spooling or capacity policy.

## Consequences

The Agent can edit or delete uploaded originals in the workspace. WebUI's attachment store retains its separate original; neither that copy nor already-injected model context is rewritten by workspace edits.

`BASE_DATA_DIR` supplies both the server's file IO root and the Docker bind source. The redundant `USER_DATA_BASE_PATH` input and its configuration consumers are removed atomically. The configured path must be visible identically inside the server and at the Docker daemon; separate host/container path translation is not supported.

Shared files use mode 0666 before no-replace publication; newly created workspace directories use 0777. This permits edits across differing server/sandbox UIDs and follows the existing writable-directory model. Staging remains private during writes, existing directory modes are preserved, and receipt metadata is outside the bind. Isolation relies on per-chat mounts and service authorization, not on a shared host UID.

Sandbox code may rename workspace entries while server IO is in progress. Upload publication and MCP reads/discovery therefore use no-follow, descriptor-relative traversal; upload staging stays in the server-private `.ocu` control directory outside the bind. A pathname checked before reopening is not a containment boundary.

Release the server, tool guidance and rebuilt sandbox image together. Acceptance assumes an empty operator-prepared environment; this decision adds no data migration and does not rewrite running old sandboxes. Rollback requires a matching server/image pair and sandbox recreation, not compatibility mounts. Rebase conflicts in path consumers are an accepted maintenance cost.

Real linux/amd64 container evidence remains required for writable files, private-home isolation and failed legacy-path writes; fake-engine mount assertions cannot prove the image half. By user direction, compatible image checks are batched under [#197](https://github.com/DankerMu/open-webui/issues/197) after the non-image source checks and review. Source closure is not deployment acceptance or proof that pending image checks passed. Operator documentation and proxy/stub synchronization retain their separately scheduled owners.

MCP responsiveness acceptance uses a reference workload, not a deployment SLA: another chat's reads under 100,000-file rejection and repeated multi-chat sync/list require p95 at most250 ms and maximum500 ms, qualified by idle maximum10 ms. A noisy idle control is inconclusive. Full-list serialization remains on the SDK request loop but is bounded by registered capacity. Busy admission trades synchronization throughput for bounded work; file content itself remains mutable and is not a versioned snapshot.

The user's execution boundary is completion of all Epic #107 source tasks: image builds and image-dependent acceptance remain deferred, except the explicitly authorized isolated B1 characterization recorded by the [Office selection decision](2026-10-03-ocu-office-editor-selection.md). Its verdict resolves the B1 dependency only; it neither certifies this sandbox cutover nor releases the remaining image-acceptance batch.
