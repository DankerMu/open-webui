# Design

## Context

The [owning publication contract](https://github.com/DankerMu/open-webui/blob/dc78eab890ac12e6ef81add938e7644c20e3c7bc/openspec/changes/ocu-office-editing/specs/ocu-office-publish/spec.md) separates durable obligation, workspace replacement, broker registration and Office successor. Initial lookup currently maps non-restore broker errors to terminal failure even when a prepared publication survived replacement. Generic Stage cleanup can then retire its witnesses before `_finish` discards responsibility.

## Goals / Non-Goals

Governing invariant: no non-copy save/final or resolve-overwrite obligation that completed or may have completed replacement is discarded merely because its broker index is unavailable; completion requires consistent registration and durable Office outcome. Preserve epoch-first request admission, selected bytes/history/receipts, path/identity refusal and owned fence release. No restore, copy/save_as redesign, pre-replacement outcome change, new retry service or index-repair service.

## Decisions

1. Keep classification and completion in `office.publish` under the existing chat lock/fence, not callbacks/routes. Inspect the existing durable witness/identity protocol before destructive retirement; `target_path` alone proves preparation, not replacement. Proven pre-replacement failure stays terminal; incomplete/contradictory evidence retains responsibility and refuses unsafe adoption.
2. Reuse the existing broker registration and recovery ownership mechanisms. After index availability, preserve the already-correct workspace inode and reuse a proven completed registration; matching content alone must not adopt another file identity or unrelated index entry. Retain responsibility on another interruption and keep completed replay inert.
3. The approved no-duplicate policy overrides the old save recovery test that deliberately expected a second registration increment and the corresponding decision-record caveat for this non-copy scope. Replace that obsolete expectation with evidence-backed one-registration behavior, preserving its no-rewrite and metadata assertions. Do not weaken other old tests or extend the change into copy/restore.
4. Epoch checking remains before admission/download of a new callback envelope. Existing recovery may drive only the pre-existing obligation; pending recovery blocks orphaning. Healthy recovery then applies the existing requester-specific terminal/orphan projection, not a new blanket session transition.
5. Extend existing native crash workers at OS persistence boundaries. Parent keeps immutable source snapshots, probe expectations and mutation controls; implementer edits only approved candidate source/tests/docs and runs no mid-flight checks.

## Siblings and required evidence

- Producers/validators: callback save/final journals, resolution overwrite journals, publication binding validation, OfficeStore durable successors and outputs broker identity/revision registration.
- Consumers: startup/poll recovery, direct publish, duplicate/current-epoch callbacks, old-epoch callback refusal, session recovery-before-orphaning, existing save-as and restore dispatch.
- Native crash after actual replace, before/after registration, and after retirement: unavailable index -> interrupted retained obligation, unchanged bytes/inode/history/receipts; restored index -> one consistent registration and durable Office completion; next replay -> exact state/revision no-op.
- Pre-replacement contrast includes unstarted, recorded-path-only and safely staged/not-replaced cases; index outage -> existing terminal failure without workspace mutation. Equal-content foreign targets, substituted witness names, unsafe paths and missing/retired ambiguous evidence must not authorize false completion or foreign deletion.
- All three requester classes and current-/old-epoch callbacks: count content-origin hits, versions/receipts, journal/session projections and broker increments. Old-epoch rejected payload never downloads or persists, including malformed/different envelope controls.
- Same oracle rejects premature terminalization and duplicate-registration/no-op violations in disposable candidates, then passes restored source. Focused cases plus full publish/recovery, callback and resolution consumers; restore/save-as compatibility evidence chosen from actual changed call paths.

## Risks / Trade-offs

Conservative retention can strand ambiguous work -> preserve uncertainty explicitly, but prove known pre/post-replacement boundaries converge. Extra registration can duplicate revisions -> bind proof to file identity and transaction progress, not hash alone. Native crashes prove process recovery, not power-loss or deployment-engine behavior; fake Docker and controlled faults remain explicit limits. Older persisted obligations without newly optional proof cannot be silently declared complete.

## Migration Plan

Fixture review/strict validation -> parent baseline tracer -> one implementer vertical RED/GREEN slices -> broad consumers and qualified runtime evidence -> owning docs -> three-seat review, exact-head source CI/authorized control CI, exact closing sets, merge/archive. No data migration or broad cleanup; rollback reverts code without deleting retained obligations.
