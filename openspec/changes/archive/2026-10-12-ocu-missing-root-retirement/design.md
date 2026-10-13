# Design

## Context

The owning [publication contract](https://github.com/DankerMu/open-webui/blob/12002247cfdee4282a49e94ed0661756fe2c4b32/openspec/changes/ocu-office-editing/specs/ocu-office-publish/spec.md) requires responsibility to survive interrupted recovery and foreign identities to remain untouched. `save_as.drive` has two missing-outputs branches: initial parent traversal and traversal after nested-parent fallback. Both currently finish before `_retire_private`; the existing retirement helper already binds identity/link counts, durable retirement intent, descriptor-relative unlink and directory fsync.

## Goals / Non-Goals

Governing invariant: a terminal missing-root recovery may discard its journal only after the obligation's proven private names are safely retired and synced, while preserving any already-durable retained outcome. Selected documents, receipts, blobs and broker identity remain unchanged. No outputs recreation, unrelated private scan, broad collection, new ownership schema, retries, or selected-version mutation. Fake Docker state in tests does not certify a deployment engine or power-loss behavior.

## Decisions

1. Keep the fix in the save-as transaction owner. Both missing-root branches use the same completion path and existing `_retire_private` protocol, rather than raw unlink, generic Stage cleanup or an orphan collector. Update the Stage's entry after any fallback rebinding so completion consumes current durable ownership.
2. Choose the existing durable `copy.retained_reason` when present; otherwise use `workspace_missing`. Do not write a new reason over the durable timeout before retirement succeeds. Preserve existing fence checkpoints and final outcome bookkeeping semantics.
3. Distinguish proven partial retirement from lost evidence. A remaining valid private pin permits resuming an already-completed unlink; durable `staging.retired` permits both names already absent. Both names absent without retirement evidence, foreign/substituted names, symlinks, inconsistent or extra links, or failed sync retain the obligation. Equal bytes alone never prove ownership.
4. Reuse the existing helper's content/ownership rules rather than inventing a blanket hash requirement: private allocation is journal-bound before all content is written, so an interrupted never-exposed allocation can still be safely retired by proven ownership. Do not mutate the immutable selected version to make staged bytes match.
5. Tests extend the existing owning module and crash workers. Capture the historical retained-intent case first; then cover already-retired/unlinked states and both missing-root control-flow branches. A deterministic operation barrier, not sleep timing, induces root loss during nested fallback.

## Required evidence and siblings

- Retained-intent SIGKILL → remove empty outputs root → fresh stale-clock recovery: `error/publish_timeout`, empty journal, no owned anchor/witness, no outputs recreation, unchanged documents/receipts/blobs/index. Present-root control remains healthy.
- Missing root without earlier retained reason: ordinary `workspace_missing` after safe retirement, with no invented retained reason.
- Crash cuts: retained intent, durable private retirement, after anchor unlink, after witness unlink; repeat recovery interruption and converge after faults stop. Completed recovery is a byte/state/revision no-op.
- Refusal controls: same-content foreign substitution at either private name, symlink target, unexpected extra hardlink, unproven loss of both names, and staging-directory sync failure. Preserve foreign/unrelated content and journal responsibility; proven one-name or retired-zero-name absence must not become permanent refusal.
- Initial root absence and root disappearance after nested fallback both exercise actual transaction operations. Ordinary capacity retirement, successful save-as, source lineage and existing missing/unsafe-workspace cases remain unchanged in the full owning test module.
- Parent-owned real HTTP setup plus native child SIGKILL/fresh-worker recovery supplies runtime evidence independently of unit assertions. Targeted fault controls qualify outcome and deletion observations without editing production code.

## Risks / Trade-offs

Premature completion loses deletion authority; overly strict absence checks strand completed work → preserve the existing durable retirement state machine and exercise every cut. Hostile name/link substitution must fail closed → inspect actual identities and content before/after refusal. Narrow module tests are the relevant execution gate; no unrelated full source suite is claimed.

## Migration Plan

Reviewed fixture/strict validation → frozen baseline tracer → one implementer changes owner/tests → parent focused and owning-module checks plus real process proof → source changelog and owning central decision clarification → three-seat review, source CI/control exact-head local CI, exact closing sets, merge/archive. Revert code for rollback; no data migration or blanket cleanup.
