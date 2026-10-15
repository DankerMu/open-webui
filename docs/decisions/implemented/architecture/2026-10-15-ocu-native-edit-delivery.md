---
id: 2026-10-15-ocu-native-edit-delivery
title: Native delivery qualifies Office save coverage and close release
kind: architecture
status: implemented
date: 2026-10-15
supersedes: '2026-10-08-ocu-office-editor-frame (partial: native delivery qualification for save coverage and close release)'
references: 'Plan 2; issue 427; ocu-office-native-delivery; ocu-office-editor-embed; issue 425'
---

# Native delivery qualifies Office save coverage and close release

## Problem

A local edit can be visible before the native editor sends it to DocumentServer. Broker force-save can then correctly report no server-known change while the host incorrectly credits that allocation for the local edit and destroys the editor after close acceptance. The real XLSX counterexample loses the local edit when close is fast; a stalled lookup merely masks that delivery interval.

## Decision

The existing host owns native delivery separately from broker persistence and workspace publication. The SDK's [`onDocumentStateChange(false)`](https://api.onlyoffice.com/docs/docs-api/usage-api/config/events/#ondocumentstatechange) acknowledges sending changes to the editing service, not a committed workspace save. Explicit publication, automatic persistence and correlated publishing retries dispatch only when reported native modifications are delivered. Coverage binds the eligible generation at dispatch to the accepted allocation and committed watermark; later edits remain uncovered.

Close observes delivery before broker admission and again before editor release. Native modification, acknowledgement and error events remain effective while an accepted-close editor is retained. An undelivered edit makes terminal/failure handling a visible failure, not false-clean success. Existing command supersession and lifetime retirement withdraw pending work without a second queue, polling loop or timeout policy. Forced page removal still releases owned resources and is not a durability guarantee.

This partially supersedes the coverage and accepted-close release clauses in the [host decision](../../implemented/architecture/2026-10-08-ocu-office-editor-frame.md). Its trust class, CSP, request/message validation, publication authority, retry attribution and forced-removal ownership remain applicable. Broker APIs, persisted state, legitimate remaining-participant handling and command deadlines are unchanged.

## Alternatives considered

- **Treat broker no-change as proof about native input** — the broker cannot observe changes the client has not sent.
- **Treat SDK delivery acknowledgement as publication** — omits broker persistence, publication and their failure states.
- **Destroy after close acceptance without revalidation** — can discard an edit reported during the request.
- **Keep the lookup stall or add a delay/retry** — timing is not evidence that a specific edit reached the service.
- **Gate only the verifier** — makes a diagnostic succeed without repairing normal user operations.

## Consequences

Save or close can remain pending while native delivery is unresolved. Existing error, supersession and disposal paths own that wait; they cannot silently convert it into success. The guarantee concerns SDK-reported modifications, not an event per keystroke or survival of forced navigation/process loss. Real acceptance requires unbarriered native input, published-file inspection, fresh native readback and terminal-state evidence; controlled editor tests alone cannot establish the SDK boundary. Local B1 proof does not certify LAN deployment or the complete three-format verifier.
