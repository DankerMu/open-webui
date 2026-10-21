---
id: 2026-10-21-popup-oracle-owns-collector
title: The native popup oracle owns its collector
kind: testing
status: implemented
date: 2026-10-21
supersedes: none
references: issue-95, openspec/changes/ocu-native-popup-diagnosis
---

# The native popup oracle owns its collector

## Problem

The A-T01 native link-popup oracle (`e2e/ocu-fixtures.ts`, `observeNativeOcuPopup`) proves the popup document through `window.fixtureEvents`, a listener that reached the natively created target only because Playwright injected the test context's init script when it attached to that target. The observer attaches with its own `waitForDebuggerOnStart` session and resumed the target without installing anything. The recorded Linux CI failures (#95) all show a complete, correct document with an empty event list; an absent collector and an empty one were indistinguishable in every capture, and nothing in the oracle recorded the order of the two clients' installs and resumes.

## Decision

Every client that can release the paused popup target installs the collector before its own resume. `FIXTURE_COLLECTOR_SOURCE` (self-guarding: a second install is a no-op) is the single source for the context init scripts and for the observer, which sends `Page.enable` and `Page.addScriptToEvaluateOnNewDocument` on its attached session and awaits the acknowledgement before `Runtime.runIfWaitingForDebugger`. The document projection reports `collector: absent | empty | <n> events` and the document's own `posted` timestamp, and a timeout names both. Each observation writes a sanitized, timestamped JSONL trace under `.run/ui-evidence/popup-trace/` (`e2e/ocu-popup-trace.ts`: gesture, target creation and attachment, install acknowledgement, resume send and ack, execution context, frame navigation, canonical request, redirect and response, Playwright page exposure, every poll); CI retains it in the `workspace-browser-failure` artifact. A repeat entry point (`make verify-ui-ocu-repeat SPEC=… REPEAT=…`) runs one required or diagnostic spec N times against one owned stack and fails before any service starts on an incomplete or invalid configuration; `make verify-ui-ocu` is unchanged.

The gate for the change is a mutation, not a reproduction: with the collector installed only at page level (so Playwright does not propagate it to the native popup), the pre-change observer reports `collector: absent` and the post-change observer reports `<n> events`, while the sidebar and direct-tab documents keep theirs.

## Alternatives considered

- **Drop the observer's own `waitForDebuggerOnStart`** — the pause is what guarantees the observer's `Network.enable` sees the canonical request and redirect; removing it trades one race for another.
- **Let the fixture document create the collector itself** — the document is the thing under test (opaque-origin generated content); its proof stays document-side evidence and the listener stays test-owned.
- **Reproduce on native Linux before changing the oracle** — a standalone probe passed 100/100 while CI kept failing; reproduction cannot be the gate, so the dependency itself is gated and the Linux repetitions become attribution evidence.
- **Keep the trace writer inside `ocu-fixtures.ts`** (design.md Decision 3) — the file is fork-added and gated at 800 lines; the writer lives in `e2e/ocu-popup-trace.ts` with the observer sanitizing fields at the call site.

## Consequences

The oracle no longer depends on another client's attach order under either Chromium release semantics (first resume or per-session). The projection distinguishes an absent collector from an empty one, so a future recurrence is attributed by the trace instead of masked as `[]`. `Page.enable` on the observer session adds `Page.*` events that the existing collectors ignore. The repeat entry point reuses the same chats across repetitions, so an idempotence run precedes any long repetition. The release-semantics experiment (`e2e/ocu-popup-release.e2e.ts`) is diagnostic only and is collected only through the repeat entry point; its outcome attributes the mechanism on a given host and does not change the oracle either way. Security assertions, deadlines, CSP, sandbox and retry behaviour are unchanged.
