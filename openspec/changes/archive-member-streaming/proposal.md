# Proposal

## Why

The archive route accumulates each uncompressed member before writing it into the already-memory-backed ZIP. A controlled baseline on macOS/Python3.12 measured roughly128MiB of traced route-build allocations for one64MiB compressible member and192MiB for two consecutive64MiB members; this is not an OOM or throughput claim.

## What Changes

- Copy bounded chunks from the existing verified no-follow descriptor into each ZIP member, without changing whole-archive or HTTP buffering.
- Preserve relative names, exact uncompressed bytes, hidden filtering, authorization, existing failures and the MCP bytes/MIME reader contract.
- Preserve current-time entry timestamps and DEFLATE; deliberately allow ZIP64 for unknown-length members rather than introduce a size/growth failure boundary.
- Retain controlled before/after memory evidence, distinguishing source-member buffering from the compressed ZIP and process high-water RSS.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-output-archives`: add bounded source-member buffering and its preservation/failure scenarios.

## Impact

OCU `computer-use-server/app.py` archive path and existing archive tests; reuse `uploads.open_chat_upload`/`close_fd` without changing their API or `read_chat_upload`. Update the existing unified-workspace-files decision and relevant archive documentation after runtime proof. No dependencies, images, pins, capacity limits, spooling, descriptor consolidation or deployment changes.

Fixture level: expanded because the resource fix crosses a security-sensitive descriptor/ZIP boundary. Selected packs: Public API, File IO, Auth, Concurrency, Resource limits, Legacy compatibility, Error handling, Documentation; all eleven pack dispositions are mapped in tasks.md. Source issue: https://github.com/DankerMu/open-webui/issues/350.
