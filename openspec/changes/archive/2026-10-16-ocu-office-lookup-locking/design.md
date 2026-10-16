# Design

## Context

See `proposal.md` for scope and source evidence. `sessions._reopen_session`, `_close_session` and `sweep._sweep_chat` perform callback-bearing key lookup under the canonical chat lock; history restore consumes the shared reopen decision. Callback admission takes that same lock. `commands.run_command` already supplies a service-loop, ten-second synchronous budget. Save already separates locked preparation/reconciliation from remote I/O and has a lifespan-owned worker executor independent of DNS and callback admission.

The live command-deadline specification and implemented command decision require lock-across-lookup. This corrective fixture explicitly changes that rule; it does not reinterpret an existing lock assertion as a passing regression.

## Goals / Non-Goals

The governing invariant is: **a command must not wait while owning a resource needed by its induced callback, and no result may mutate authority other than the identity/state revalidated after that wait**.

Canonical locks still serialize state admission, sequence allocation, file/version selection, journal obligations and publication. Callback authentication and genuine remaining-participant transitions remain intact. No schema field, callback suppression, longer timeout, general network retry layer or editor workaround is introduced.

## Decisions

### Prepare, observe remotely, revalidate

Capture the relevant session/document identity and lookup eligibility under the canonical lock. Release the lock for `info`, then reacquire and reread authoritative state before any lookup-dependent mutation or response. A copied record is evidence for the request sent, not authority to commit later.

Revalidation covers session identity, document key, file identity, restore epoch, lifecycle state and pending/committed allocation responsibility. Restore additionally rechecks the selected historical version, active-session refusal and file/path admission; sweep rechecks current eligibility, activity and the same overdue save rather than timing out a newer one. Terminal callbacks and accepted publication obligations that complete during lookup remain authoritative. Duplicate closes reuse a live pending allocation rather than allocating twice.

A result for a replaced identity is discarded. Re-evaluation may observe the current target afresh when identity changed, but an unchanged command's unknown/unreachable outcome is not retried into success. Preserve current distinctions: join/restore unavailable lookup refuses; close's unreachable lookup retains its admitted-close behavior; sweep's unreachable lookup does not orphan or clear an unconfirmed save.

Do not replace status-1 handling with a blanket ignore rule. In the real `info` dependency, the induced callback must finish while the session is still in its pre-close state; the close allocation follows successful observation. A later callback reporting a genuinely remaining participant still returns `closing` to `editing` and voids the allocation as required by the Office callback contract.

### Preserve callback execution capacity

An unlocked command can still deadlock if its synchronous waiter occupies the only worker admitting its callback. Reuse the existing lifespan-owned transaction executor for callback-bearing waits instead of adding another pool. If its save-specific names are generalized, migrate every caller, lifecycle field, package inventory and test in the same change; leave no aliases or parallel owner implementation. DNS and callback ownership, context isolation, queued-versus-running cancellation and shutdown drain semantics remain unchanged.

### Keep source and verification ownership separate

OCU owns the production repair. WebUI owns this fixture and the explicitly superseded command contract/decision. Parent-owned runtime probes select an exact candidate source snapshot and retain callback ingress, state/sequence, command timing and cleanup evidence. A source unit pass does not certify real XLSX closure or the three-format target.

## Risks / Trade-offs

- Releasing the lock admits legitimate concurrent mutations → exercise final callbacks, duplicate close, epoch change, replacement session/key, a newer save and restore selection changes at controlled barriers; assert authoritative state and unrelated bytes.
- Shared reopen logic serves restore as well as join → retain restore admission precedence, accepted recovery and original file/version responsibility; never follow a recovered successor implicitly.
- Executor renaming can break packaged startup or teardown → migrate every reference and run package/lifespan/cancellation regressions; no callback-pool fallback.
- A late asynchronous status callback may be genuinely newer than a close → preserve that transition; test pre-close induced callback separately from post-close remaining-participant callbacks.
- The observed fresh-XLSX hang may contain another cause → require actual broker and host terminal state after the repair, not merely removal of the ten-second lock wait.

## Delivery and containment

1. Review and strictly validate this expanded fixture; keep #172's uncommitted verifier changes outside the corrective diff.
2. Write behavioral counterexamples at existing HTTP/lock/worker seams, observe RED, then implement in place and run owning plus affected regressions.
3. Qualify with an actual callback-before-command responder and the fixed B1 image: no callback waits for the command deadline, the reserved close sequence is retained through terminal handling, and real DOCX/fresh-XLSX close finishes coherently.
4. Cross-review production and companion contract diffs, merge the corrective PRs, then update #172 to the exact merged OCU SHA and rerun its full target and shared smoke/UI.

No deployment occurs. Revert the corrective commits together if acceptance fails after integration; keep #172's pin at its previously verified value until the replacement is qualified. No data migration or database rollback is needed.
