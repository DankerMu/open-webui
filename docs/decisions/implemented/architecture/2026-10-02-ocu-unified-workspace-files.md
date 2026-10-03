---
id: 2026-10-02-ocu-unified-workspace-files
title: One writable workspace files directory per chat
kind: architecture
status: implemented
date: 2026-10-02
supersedes: none
references: Plan 2 B0, ocu-office-editing D2 and D3, issue 113
---

# One writable workspace files directory per chat

## Problem

Separate upload and output directories split the user's files from the Agent's editable files. Office editing needs one authoritative location; copying between two locations makes ownership and repeat attachment synchronization ambiguous.

## Decision

Use `{BASE_DATA_DIR}/{chat_id}/outputs` as the single workspace files directory, mounted read-write at `/mnt/user-data/files`. Keep `/home/assistant` on its per-chat named volume as private working storage, outside listings and file serving. The sandbox image contains neither legacy user-data directory nor compatibility symlink; root owns `/mnt/user-data` and the sandbox user cannot create a legacy path there.

Uploads publish into the shared directory using the existing per-chat lock and no-replace hard-link claim. Attachment receipts prevent repeated synchronization from overwriting edits or resurrecting renamed/deleted files. The outputs broker assigns file identity through its existing reconciliation path. MCP retains its `file://uploads/{chat_id}/...` URI shape while sourcing visible workspace files and excluding hidden paths.

The server mount map, recovery attribution, prompt/tool/skill guidance and sandbox image configuration change together. The host directory and HTTP interface names stay fixed. This accepts a permanent divergence from upstream OCU in the consumers of sandbox paths.

## Alternatives considered

- **Mount one directory at both legacy paths** — a copy between paths can truncate its own source; aliases also preserve contradictory guidance.
- **Keep two writable directories** — retains the visible split and requires changing every single-root assumption in the broker and sidebar.
- **Rename the host directory and HTTP interfaces too** — adds migration and client/proxy churn without changing the user-visible result.
- **Skip imports when a filename exists** — cannot distinguish attachment identity; it resurrects a renamed/deleted import and conflates different attachments sharing a name.
- **Add compatibility symlinks** — silently accepts stale model guidance instead of making an invalid write fail.

## Consequences

The Agent can edit or delete uploaded originals in the workspace. WebUI's attachment store retains its separate original; neither that copy nor already-injected model context is rewritten by workspace edits.

`BASE_DATA_DIR` supplies both the server's file IO root and the Docker bind source. The redundant `USER_DATA_BASE_PATH` input and its configuration consumers are removed atomically. The configured path must be visible identically inside the server and at the Docker daemon; separate host/container path translation is not supported.

Shared files use mode 0666 before no-replace publication; newly created workspace directories use 0777. This permits edits across differing server/sandbox UIDs and follows the existing writable-directory model. Staging remains private during writes, existing directory modes are preserved, and receipt metadata is outside the bind. Isolation relies on per-chat mounts and service authorization, not on a shared host UID.

Release the server, tool guidance and rebuilt sandbox image together. Acceptance assumes an empty operator-prepared environment; this decision adds no data migration and does not rewrite running old sandboxes. Rollback requires a matching server/image pair and sandbox recreation, not compatibility mounts. Rebase conflicts in path consumers are an accepted maintenance cost.

Real linux/amd64 container evidence remains required for writable files, private-home isolation and failed legacy-path writes; fake-engine mount assertions cannot prove the image half. By user direction, compatible image checks are batched under [#197](https://github.com/DankerMu/open-webui/issues/197) after the non-image source checks and review. Source closure is not deployment acceptance or proof that pending image checks passed. Operator documentation, proxy/stub synchronization and archive staging-file filtering retain their separately scheduled owners.
