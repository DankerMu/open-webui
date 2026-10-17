# Design

## Context

Change surface: shared `_finish_owned_cleanup` in `scripts/smoke_proxy_support.py`; real `Smoke` and `BrowserHarness` callers. The lifecycle already converts an interrupt during `run()` to130, but an interrupt during `cleanup_data()` escapes before sentinel and scratch stages.

Governing invariant: an owned-data interruption cannot bypass the later sentinel and scratch attempts or become a successful result.

Sibling surfaces: process cleanup precedes data cleanup; smoke sentinel is an authenticated identity read, UI sentinel checks preexisting pidfile bytes; scratch deletion belongs to the shared owner, not either caller. Existing HTTP cleanup aggregation and UI alarm cancellation remain separate.

## Goals / Non-Goals

Must preserve: original `KeyboardInterrupt` identity after healthy or ordinary-failing finalizers, ordinary0/1/130 status precedence, redacted diagnostics, process termination ordering, exact deletion authority and both entrypoints.

Non-goals: process-cleanup interruption, repeated signals during later finalizers, signal masking/restoration redesign, retrying interrupted data deletion, HTTP aggregation, browser rendering, OCU pin/source or deployment changes. Scratch deletion failure means attempted, not removed.

## Decisions

Use nested `finally` boundaries around existing data/sentinel/scratch stages. Keep their existing `Fail`/`Exception`/`OSError` handling inside those stages; never catch `BaseException` merely to turn interruption into a return code. Keep `return code` after finalizers so an active interrupt cannot be suppressed by a return in `finally`.

Reuse the existing cleanup regression module and actual harness classes. Fault injection targets data cleanup; real scratch files and real sentinel implementations establish observable effects. Restore signal handlers in test/probe ownership, without changing production signal policy.

## Evidence and Sequencing

One implementer owns source/tests/docs. Test-only tracer through both actual classes precedes parent-captured semantic RED and frozen oracle; minimal source change then unchanged-oracle GREEN. Add ordinary sentinel failure and scratch OSError controls without changing existing tests.

Parent runtime launches an owned child using the actual lifecycle; child exposes readiness only inside its actual data cleanup. Parent sends SIGINT/SIGTERM/SIGHUP, then observes nonzero exit, sentinel evidence, removed owned scratch and unchanged unrelated bytes. UI cleanup uses a private root with only its own `.run/data/workspace-ui-*` fixture; smoke HTTP uses a private loopback endpoint. No real accounts or existing service data are touched.

Required gates: affected cleanup pytest module and adjacent smoke-support tests, scoped lint, appropriate coverage scope and doc/decision gates; actual signal probe proves the changed CLI lifetime, not a UI screenshot or gateway deployment claim.

## Risks and Rollback

A return in `finally` would swallow interruption → same-object exception regression and real nonzero child exits. A sentinel failure could skip scratch → nested-finalizer control. Another signal can interrupt a later finalizer → explicitly outside this single-interruption contract; no absolute cleanup guarantee.

No migration or runtime configuration change. Revert the focused shared-helper change to roll back; never delete unrelated harness data. Update the existing cookie-gateway/paired-smoke decision after runtime proof rather than add another cleanup policy document.
