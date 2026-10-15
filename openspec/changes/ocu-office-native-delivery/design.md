# Design

## Context

See `proposal.md` for authority and scope. The existing host owns modification generations, accepted-save coverage, automatic persistence, explicit-publication arbitration and editor release. The SDK's `onDocumentStateChange(false)` means changes were sent to the editing service, not that the broker persisted or published them. A real observer trace shows the uncorrected host saving and closing before any native `saveChanges` frame; a parent-only barrier on the genuine delivery event permits the same input to survive without the lookup stall.

## Goals / Non-Goals

**Governing invariant:** a host save may cover only delivered modifications eligible at its dispatch, and an accepted host close may not destroy the editor while a reported local modification is still undelivered.

Must preserve: all nine parent-message fields and their origin/source/generation validation; public-prefix and workspace-header behavior; broker-authoritative session/publication state; successful no-change saves; explicit/automatic-save arbitration; legitimate remaining-participant status 1; current command budgets; forced-removal resource cleanup.

Non-goals: broker schema or API changes, artificial delays, new retries/timeouts, a second lifecycle framework, new SDK/plugin dependencies, lock-held lookup, automatic discard of edits, deployment, and completing #172. This gate concerns SDK-reported modifications; it does not claim an event per keystroke or durability after forced page/process removal.

## Decisions

1. Extend the existing host's ownership rather than adding a broker guess about browser state. Observe the SDK delivery state separately from committed/published watermarks. Never treat delivery acknowledgement itself as a successful save.
2. Defer pending save and close operations through that owner. Revalidate eligibility after each asynchronous boundary: superseded publication, close, retirement or final/error state can withdraw a queued operation. Preserve the existing arbitration instead of adding a parallel command queue.
3. Capture coverage at eligible request dispatch. Later edits stay uncovered even if an older response or a foreign watermark arrives. A no-change result remains valid for genuinely delivered, unchanged input.
4. Check delivery both before close admission and before editor release. A new reported edit during the close request cannot be discarded; continue observing native delivery/error events until release. An SDK or terminal failure while undelivered work exists is visible failure, not successful close or false-clean coverage. Keep the editor until safe release or explicit lifetime teardown.
5. Own every delivery wait through the existing lifetime. Disposal settles waits and releases existing resources; late acknowledgements cannot send requests, publish messages, recreate an editor or restart timers. Avoid polling, sleeps and new timeout knobs.

Sibling surfaces: explicit save, automatic persistence, correlated publishing retry, close admission/release, SDK callbacks (including synchronous construction), status reconciliation, final/error handling and disposal. The parent UI and broker consume unchanged messages and requests.

Seams under test: existing controlled editor callbacks plus real host request/teardown effects; real pinned DocumentServer WebSocket/SDK/request/callback timing; published workspace XLSX bytes and a fresh native editor.

## Risks / Trade-offs

- False-clean coverage or a late edit during accepted close → test delivery, dispatch generation and release as separate boundaries, including intervening edits and failure.
- Queued operations surviving close/disposal or multiplying auto-save → preserve one existing arbitration/lifetime owner and verify zero post-retirement effects.
- Controlled editor tests masking SDK semantics → retain the pinned API quote and actual transport trace, then require unbarriered production acceptance. A diagnostic route barrier is not acceptance evidence for the repair.
- Shared host impact beyond XLSX → run existing host and sibling preview/request suites; do not infer native DOCX/PPTX content acceptance from XLSX proof.

## Phases and containment

Review and validate the expanded fixture; write meaningful host counterexamples and capture RED; implement in place and migrate affected fixtures; run owning regression inventory and independent real acceptance; update contracts/decision/changelog and obtain cross-review before merging.

Keep #427's source PR independent of #425's backend candidate. Qualify their exact combined Git tree without changing the paused #172 source/pin; record both parent SHAs and the tested composition SHA. After #427 merges, rebase/integrate #425 and finish its own gates. Revert the #427 source/companion change together if integration fails; no data migration is introduced. Keep #425 unmerged rather than restoring the unsafe stall or presenting a partial verifier as accepted.
