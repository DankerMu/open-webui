# Design

## Context

The archive route enumerates paths with `rglob`, filters hidden components, then uses `ZipFile.write`, which reopens paths and follows links. `uploads.read_chat_upload` already opens chat/output roots, ancestors and leaves with no-follow flags and reads from a verified regular-file descriptor.

## Goals / Non-Goals

Governing invariant: ZIP payload bytes must come from securely opened regular files beneath the requested chat outputs root, not a followed symlink target.

Must preserve: ordinary nested relative names and exact bytes; hidden staging exclusion without mutation; existing auth and ZIP headers; ordinary missing/empty errors; uploads/receipts/broker identity untouched.

Non-goals: content snapshot isolation during writes to an already-open inode, hard-link provenance, bind-mount attacks, archive capacity/performance redesign, workspace migration, unrelated reader rewrites or deployment certification.

## Decisions

Reuse the existing confined workspace reader rather than add another traversal implementation. Candidate enumeration may remain separate from payload reads, but ZIP must receive verified bytes or an already-verified descriptor and must not reopen workspace names. Do not import MCP discovery capacity policy into archives merely to reuse its listing function.

Choose no-follow behavior for all symlinks, including in-tree links, instead of resolve-then-open containment checks. Omission or a closed error are acceptable; a partial successful ZIP after an unsafe read is not. Construct the complete ZIP before returning the response.

Sibling surfaces: upload/MCP reader and their root/ancestor/leaf confinement; existing archive hidden-entry and successful collision-upload tests; download authorization. Keep one reader implementation and avoid widening its API unless necessary.

## Required evidence

Use only temporary benign files. API cases cover a marker outside outputs, a sibling-chat marker, ordinary nested content, an in-tree link, a linked ancestor, separate pre-existing chat-root/outputs-root aliases to sibling trees, and deterministic leaf/ancestor/chat-root/outputs-root replacement between selection and read. An unsafe member must never contribute target bytes; ordinary positive files remain exact. Existing missing/empty and header behavior remains covered.

Parent records semantic RED before the production fix, then GREEN and nearest regressions. Independently exercise real loopback HTTP and decode ZIP entries, recording source/test/toolchain identities and exits. A mutation or controlled seam that restores unchecked reopening must be rejected for byte disclosure, not setup failure.

## Risks / Trade-offs

All-link rejection loses intentional alias downloads; users can archive ordinary copies. In-memory ZIP construction remains, without a new capacity promise. Files concurrently edited through the same inode are not coherent snapshots. Existing safe-reader errors must remain redacted; no filesystem mutation or cleanup of user files is introduced.

## Migration Plan

Atomic source replacement and paired central contract update; no persistent migration. Rollback is the source merge revert, which restores the known disclosure and is not a safe deployment recommendation.
