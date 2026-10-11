# Design

## Context

The route in `app.py` resolves paths and checks type before returning `FileResponse`. Installed Starlette0.38.6 derives headers from a later path stat and opens that path again during response execution. It has no byte-range implementation. `uploads.py` already owns no-follow root/ancestor/regular-leaf acquisition and closes the descriptors used by `read_chat_upload`.

## Goals / Non-Goals

Governing invariant: one descriptor acquired under the requested chat workspace owns both metadata and every response byte, and is released on every response termination path.

Preserve status/error behavior for ordinary missing files and directories; auth; both response modes; MIME/charset, RFC5987 disposition, CSP/nosniff, no-store, Content-Length, ETag and Last-Modified. Preserve normal zero-byte/nested files and links resolved to safe in-root targets; a root alias must not redefine the requested chat as its sibling.

Non-goals: Range support, content snapshot isolation under same-inode writes, hard-link/bind-mount provenance, archive streaming/memory work, broker consolidation, upload/receipt changes, cache policy changes, framework/dependency updates or LAN certification.

## Decisions

Keep lexical/realpath validation for current route naming and in-root alias semantics, but treat its result only as a candidate relative path. Acquire that candidate using the original requested chat identity and existing descriptor-relative no-follow traversal. A pre-acquisition swap may fail403/404; a post-acquisition pathname swap cannot redirect bytes or metadata. This retains legitimate in-root aliases without following mutable links during the authoritative open.

Expose the smallest owned-descriptor entry point from the existing reader, and make its bytes-returning path use that same acquisition. Do not extract broker primitives or change MCP return types; issue202 owns the wider consolidation. The single-file response must stream bounded chunks, not materialize the whole file as archive handling does.

Put response ownership in a narrow file-response seam, preferably reusing framework header construction rather than hand-copying MIME/disposition/validator recipes. Never call a framework body sender that reopens the pathname. Derive stat headers from fstat of the acquired descriptor before sending response-start. Acquire within the response's guarded execution lifetime so an unexecuted response object owns no descriptor. A finally owner closes on success, setup/read/send error, disconnect and cancellation, without racing an abandoned read worker or double-closing a reused descriptor.

Sibling surfaces: bytes-returning upload/MCP reads and the archive caller retain their contracts; ordinary file route isolation/disposition tests and upload receipts remain controls. Any new production response module has paired lifecycle tests; do not duplicate route MIME policy there.

The orchestrator Dockerfile copies Python modules explicitly. Include the response seam in that copy set and verify an isolated materialization of the declared Python inputs imports the actual app. This is packaging-closure evidence, not an image build or deployment certification.

## Required evidence

Before the fix, both inline and download API races use only temporary canaries and deterministically replace an ancestor between validation and open. Keep an ordinary positive control. Separately replace the chat root and outputs root at their actual acquisition boundaries in both modes, retaining real acquisition and asserting each swap fired. Preserve baseline outcomes honestly: semantic RED where vulnerable, safe controls otherwise. After the fix, prove those cases deny or return pinned old bytes; separately swap leaf/ancestor after acquisition at response-start and assert original bytes plus original descriptor-derived length/mtime/ETag.

Cover zero-byte and multi-chunk files, safe in-root aliases, outside links, static sibling-root aliases, missing files, directories, filename encoding and all isolated MIME types. Guarded ASGI lifecycle cases exercise send/read failure, disconnect/cancellation before first body and during a read, and descriptor closure. Qualify new lifecycle oracles against an intentionally unclosed or path-reopening disposable response, with semantic rejection and restored pass rather than setup errors.

Independent loopback HTTP proves actual app bytes/headers and cleanup with synthetic credentials and owned temporary trees/processes. Existing source checks plus owning header/security/auth/upload/MCP tests are the regression floor. Record identities, every exit/skip, and explicit platform limits.

## Risks / Migration

Open descriptors pin identity, not contents under concurrent writes. Errors after headers abort the stream rather than publish a second error response. Framework header helpers are version-sensitive: retain the pinned stack, characterize its Range/HEAD behavior and do not silently expand either. No schema migration; atomic source cutover. Reverting restores the known race and is not a security-safe deployment recommendation.
