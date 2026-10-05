---
id: 2026-10-04-ocu-office-stub
title: Deterministic Office stub and its evidence boundary
kind: testing
status: implemented
date: 2026-10-04
supersedes: none
references: Plan 2, ocu-office-editing tasks 22.1 and 22.3
---

# Deterministic Office stub and its evidence boundary

## Problem

Gateway and sidebar checks need repeatable Office outcomes without a DocumentServer, sandbox or model. The shared threaded stub also serves existing workspace fixtures whose behavior must remain intact.

## Decision

Keep Office state and its host page in adjacent stub modules, using the existing chat-keyed scenario selection, file identities, outputs listing and private request observations. Serialize state transitions with the stub lock. Accepted saves and closes complete their simulated callback outcome synchronously; sequence cursors, version records and workspace revisions expose the result through HTTP.

`make smoke-stub` exercises the seven scenarios, default behavior, request rejection, chat isolation and deterministic replay. File IDs retain the existing chat-scoped convention: identical names in different chats may have identical IDs; the chat and resource together identify the fixture.

Office listing URLs encode logical path segments without changing file identity or stored content. Both save-as outcomes use the same producer. The HTTP smoke downloads each returned URL and checks its bytes against the saved version's hash and size as well as the listing metadata; conflict save-as also preserves the original entry and bytes.

The HTTP smoke fetches the host page but does not execute its JavaScript. Message-protocol execution belongs to the Office browser cases in tasks 24.1 and 24.4 of the [Office plan](../../../plans/2026-09-20-office-manual-editing.md). Stub evidence does not certify the real broker, editor callbacks or deployment.

## Alternatives considered

- **Real DocumentServer in every stub check** — adds image and callback timing dependencies to deterministic gateway/UI checks; real-editor acceptance has a separate owner.
- **Inline Office state in the shared handler** — exceeds the handler's size limit and obscures preservation of unrelated preview modes.
- **Globally unique fixture file IDs** — changes an existing convention without improving isolation proof; tests must verify chat-local state and reject genuinely foreign resources.

## Consequences

The stub intentionally models observable outcomes rather than callback timing. Its broker-shaped responses and host protocol require review against the Office specs; a passing smoke is not sufficient evidence for the unexecuted browser protocol.
