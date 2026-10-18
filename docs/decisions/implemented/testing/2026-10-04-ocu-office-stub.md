---
id: 2026-10-04-ocu-office-stub
title: Deterministic Office stub and its evidence boundary
kind: testing
status: implemented
date: 2026-10-04
supersedes: none
references: Plan 2, ocu-office-editing tasks 22.1 and 22.3, issues 208, 209, 210, 358 and 361
---

# Deterministic Office stub and its evidence boundary

## Problem

Gateway and sidebar checks need repeatable Office outcomes without a DocumentServer, sandbox or model. The shared threaded stub also serves existing workspace fixtures whose behavior must remain intact.

## Decision

Keep Office state and its host page in adjacent stub modules, using the existing chat-keyed scenario selection, file identities, outputs listing and private request observations. Serialize state transitions with the stub lock. Accepted saves and closes complete their simulated callback outcome synchronously; sequence cursors, version records and workspace revisions expose the result through HTTP.

`make smoke-stub` exercises the seven scenarios, default behavior, request rejection, chat isolation and deterministic replay. File IDs retain the existing chat-scoped convention: identical names in different chats may have identical IDs; the chat and resource together identify the fixture.

The isolation/replay smoke owns its exact temporary fixture configuration across both stub lifetimes. An outer finalizer removes that file on normal completion or startup/assertion failure, after acquired children are stopped by the existing lifecycle helpers; unrelated files remain untouched. `make test-smoke-stub-cleanup` exercises real-process assertion failure, checking original error identity, child retirement, exact-file removal and unrelated-file preservation before emergency cleanup.

With valid `OCU_STUB_DOCX` input, `office_unpublished` and `office_stale` retain the configured workspace bytes exactly and derive distinct, deterministic DOCX autosaves with visible text `Verified Office autosave (unpublished)` or `Verified Office autosave (stale)`. The derivation preserves existing document XML and unrelated package content; listing and version hashes/sizes describe the actual bytes. The browser and HTTP harnesses share the valid-DOCX generator in `ocu_stub_office.py`. Without configured input, the synthetic workspace bytes and exact `-autosave`/`-stale` suffixes remain unchanged; invalid configured input is not replaced with a generic successful document.

The `renderable-seeds` HTTP regression binds downloaded bytes to public history, identity, publication and lifecycle state, checks package preservation, and compares fresh runs for deterministic generation. Configured-rendering acceptance also requires recognizable read-only content before the existing browser prompts and distinct restored-autosave content without changing request ordering. The [verification record](../../../evidence/issue-269/verification.json) owns those results; deterministic stub/gateway rendering does not certify real DocumentServer recovery.

The shared occupied-name source reserves synthetic error paths as well as listed fixtures and accepted uploads. Uploads named `backend403` or `backend409` receive numbered names, leaving the bare error responses intact; GET dispatch order cannot provide this guarantee without hiding accepted bytes. The HTTP smoke checks both error responses and retrieval/listing of the uploaded bytes.

Upload validation rejects decoded U+0000–U+001F and U+007F before storing bytes or listing metadata, using the stub's existing 400 invalid-filename response. Rejecting at this boundary keeps controls out of both disposition modes without changing accepted names. The smoke checks raw inline/attachment header framing, exact payload bytes and unchanged state after rejection; traversal controls pin the existing path policy. This is a harness contract, not production status-code parity or a general filename serializer.

The shared disposition builder serializes the accepted POSIX leaf as a quoted string, escaping backslashes before double quotes. Inline and attachment responses preserve accepted literal quotes and backslashes without changing stored names, retrieved bytes or the ordinary quoted wire format. Backslashes remain filename characters, not path separators.

`make test-ocu-stub-public` exercises real uploads and GETs in both modes for quote, backslash, combined, nested and ordinary names. It checks stored names, exact response bytes, raw header framing and a single disposition field; an independent standards-aware parser checks the exact leaf and mode with zero header defects. This evidence covers the stub's accepted ASCII filename cases, not expanded Unicode policy, production serialization or universal browser compatibility.

Paginated upload smoke distinguishes readable bytes from complete listing visibility: `large` exposes the appended upload only at cursor 100; `partial_after` retains its later-page 503 while the uploaded bytes remain readable. Its temporary scenario map and placeholder asset default are scoped to the main stub process, preserving explicit asset input and the later Office processes' asset discovery. Enabling a map must not treat an unset asset root as the current directory.

Office listing URLs encode logical path segments without changing file identity or stored content. Both save-as outcomes use the same producer. The HTTP smoke downloads each returned URL and checks its bytes against the saved version's hash and size as well as the listing metadata; conflict save-as also preserves the original entry and bytes.

The HTTP smoke fetches the host page but does not execute its JavaScript. Message-protocol execution belongs to the Office browser cases in tasks 24.1 and 24.4 of the [Office plan](../../../plans/2026-09-20-office-manual-editing.md). Stub evidence does not certify the real broker, editor callbacks or deployment.

## Alternatives considered

- **Real DocumentServer in every stub check** — adds image and callback timing dependencies to deterministic gateway/UI checks; real-editor acceptance has a separate owner.
- **Inline Office state in the shared handler** — exceeds the handler's size limit and obscures preservation of unrelated preview modes.
- **Globally unique fixture file IDs** — changes an existing convention without improving isolation proof; tests must verify chat-local state and reject genuinely foreign resources.
- **Rebuild configured DOCX content or reserialize its XML** — risks dropping document content or namespace-dependent metadata; inserting one paragraph into the existing XML keeps unrelated bytes and package parts intact.

## Consequences

The stub intentionally models observable outcomes rather than callback timing. Its broker-shaped responses and host protocol require review against the Office specs; a passing smoke is not sufficient evidence for the unexecuted browser protocol.
