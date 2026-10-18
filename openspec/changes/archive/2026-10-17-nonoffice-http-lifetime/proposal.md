# Proposal

## Why

Issue377 identifies five non-Office test-server families whose owners stop only the accept loop. Accepted sockets and handler failures can escape the owning test boundary. The canonical lifetime from completed issue235 supplies bounded ownership; this change applies it to the named consumers rather than introducing another server framework.

## Triage

- Issue type: bugfix (test harness).
- Fixture level: expanded; upstream level absent.
- Reason: shared lifecycle, threaded request workers, sockets, cancellation and failure attribution.
- Blast radius: late test failures, leaked fixture resources or weakened redirect/credential evidence.
- Selected risk packs: script entry, file/resource ownership, configuration, shared state, failure cleanup, security assertions, resource bounds, compatibility and documentation.
- Evidence floor: real-owner semantic RED/GREEN, completed/held/exceptional teardown across every family, deliberate handler-error attribution, socket/thread retirement, affected regression and docs gates.

## What Changes

- Migrate the tool redirect origin, font archive origin, deployment fixture/control listeners, initializer fake WebUI and native HTTP/TTY owners to the existing lifetime implementation.
- Extend that implementation only where required for existing fixed bind addresses and actual transport operations; preserve default Office behavior and deadline/error semantics.
- Make fixture-controlled waits cancelable and keep all owners eligible for cleanup when another owner fails.
- Preserve real response/framing/redirect/credential assertions, existing unittest/pytest/direct-script entrypoints and deployment behavior.

## Capabilities

### Modified Capabilities

- `ocu-http-test-origins`: bounded ownership extends to the named non-Office consumers; the existing shared handler-error contract remains authoritative.

## Impact

OCU canonical `tests/orchestrator/_http_origin.py`, its regression module, the five named consumer files and behavior regressions; existing testing guidance/changelog. WebUI fixture, canonical purpose and existing HTTP-lifetime decision update. No production policy, new generic helper, dependency, image, deployment or unrelated fixture cleanup.
