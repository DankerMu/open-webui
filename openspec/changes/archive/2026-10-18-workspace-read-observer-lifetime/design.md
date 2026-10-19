# Design

## Context

The original hook asserts before reading. The diagnostic wrapper preserves that failure, reads the still-open fd once to record a safe byte-count/digest, then re-raises; that extra read is labeled diagnostic rather than attributed to the original execution. Initial workspace/index identities differ. After publication the failing fd resolves to index.json with the former workspace identity, while the current workspace has another identity. Earlier actual workspace reads occur with Paused=true.

## Goals / Non-Goals

- Governing invariant: a read matches the protected workspace resource only while an owned live descriptor retains that resource's identity; observer hooks cannot outlive that descriptor.
- Must preserve: `Paused is True`, nonempty/all-true reads, response/final-content checks, restore pause/unpause counts and external-pause behavior, fence no-read/refusal outcomes, notice read/no-read counters and all existing safety/publication assertions.
- Non-goals: production code, dependency/environment changes, path-name exclusions for index reads, skipping assertions, timeout increases, filesystem-wide identity claims, unrelated stat/open guards, or new retry/telemetry frameworks.

## Decisions

- Change surface: four named observer families, the callback-recovery counter caller and existing README. Use ordinary read-only file contexts and fstat of the retained descriptor; no application content is read merely to establish observer identity.
- Retain the original resource through the entire hooked operation, including after workspace replacement. An open descriptor prevents its unlinked inode from being reassigned while the observer still compares against it.
- Prefer descriptor ownership over permanent `/proc` path checks: the latter is Linux-only and pathname filters can misclassify renamed or unlinked instances of the protected resource. `/proc` capture stays in temporary diagnostic evidence.
- Resolution, restore and fence observers keep their existing per-test hooks and assertions. Scope hook installation inside the held-file context, unpatch before close, and compute identity from that live descriptor.
- Refactor `_count_workspace_reads` in place into a context manager owning both the held file and its monkeypatch context. Migrate all eight callers atomically: seven in notice and the callback-publication recovery caller. Keep all repeated-request/count-reset windows, callback edit-after-cache checks and nested other-file forbid-open/stat guards. No compatibility alias or implicit finalizer ownership.
- Siblings: restore's running/paused/exited capture; publish-fence's two unverified-pause refusal cases; all notice counter callers, including repeated status, invalid-sample recovery, foreign-file guards, oversized file and ended-conflict repeated status; callback recovery's direct/duplicate/startup parameters. Unrelated `_forbid_inode_stat` and open guards stay unchanged.

## Evidence and Review Focus

- Focused qualified Linux original run: actual workspace fd returns1061bytes/EOF while paused; later index fd has the old workspace identity, returns426 diagnostic bytes while unpaused, and the original assertion still fails. Retained-descriptor control passes the unchanged test and records the held original as deleted before explicit close.
- After repair, repeat descriptor-bound observation without the diagnostic pin: only actual protected workspace reads match; all original assertions pass. Keep any diagnostic reads explicitly labeled.
- Inject a real read of the protected file before pause through the actual observer hook: the original safety assertion must fail. Observe held-fd/hook retirement after both successful operation and injected failure; no emergency cleanup may supply the claimed ownership result.
- Run the complete original qualified Linux orchestrator selection, including all five complete affected modules, once; preserve exact existing node IDs. Use the fresh qualified Darwin real-Docker full-root harness for final batch interaction evidence, without treating Docker Linux as native-Linux acceptance.
- Review scope ordering, descriptor closure on failure, all notice callsites, unchanged negative/read-count assertions and absence of pathname-based suppression. No new permanent wiring or source-text tests; the existing behavioral cases remain the regression suite.

## Risks / Trade-offs

Keeping one read-only descriptor per active observer changes allocation availability intentionally but not application I/O or pause semantics. It binds the observation to the original resource, including renamed/unlinked states; it does not claim every later replacement is that same resource. Rollback is a test/docs commit revert; no data migration.
