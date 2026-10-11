# Bound MCP workspace-file discovery

## Why

MCP discovery scans and constructs resources on the request event loop without capacity limits. The owner-recorded 100,000-file workload delayed another chat's read by 1,151.97 ms; cross-thread registry mutation also lacks a reader-visible snapshot boundary. Policy authority: [issue #199](https://github.com/DankerMu/open-webui/issues/199).

## Risk classification

- Issue type: bugfix.
- Fixture level: expanded; agrees with the upstream suggestion.
- Blast radius: MCP listings/reads, committed-upload reporting and sandbox creation.
- Selected risk packs: public API; file IO; concurrency; resource limits; legacy compatibility; error handling; documentation.
- Evidence floor: exact/overflow and constrained-FD regressions, actual FastMCP snapshot readers, upload/lifecycle consumer failures, sustained latency samples, scoped source checks and independent cross-review.

## What Changes

- Enforce approved per-chat, process, traversal and descriptor budgets before excess work; bound concurrent preparations without a growing admission queue.
- Prepare discovery outside the request loop and publish complete reader-visible snapshots; retain prior snapshots on failure.
- Report discovery failures separately from already committed file publication.

## Capabilities

### New Capabilities

- `ocu-mcp-discovery`: bounded complete workspace-file discovery, atomic publication and explicit consumer outcomes. The in-flight `ocu-unified-files` contract remains the URI/path/receipt authority; this capability adds discovery guarantees without changing those semantics.

### Modified Capabilities

None. Canonical `ocu-workspace-files` owns the WebUI sidebar, not MCP discovery.

## Impact

OCU `uploads.py`, `mcp_resources.py`, existing upload/lifecycle consumers and their tests. No dependency/configuration expansion, outputs-broker changes, per-chat MCP authorization redesign, Office publication changes or deployment. Source implementation and central fixture ship as paired PRs.
