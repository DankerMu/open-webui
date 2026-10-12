---
id: 2026-10-12-office-contention-startup-cleanup
title: Own Office contention holders through startup failure
kind: testing
status: implemented
date: 2026-10-12
supersedes: none
references: issue-257, 2026-10-11-office-http-origin-lifetime, ocu-contention-startup-cleanup
---

# Own Office contention holders through startup failure

## Problem

The ordinary process holder can fail before its watchdog starts; the thread
holder can acquire its lock before readiness fails. An unstarted watchdog join
can replace the initiating exception. Executor shutdown alone does not establish
explicit owner release, future observation, or restoration of temporary patches.
[Issue 257](https://github.com/DankerMu/open-webui/issues/257) concerns these test
ownership boundaries, not an established production resource leak.

## Decision

The two owners in OCU `tests/orchestrator/test_office_control_plane_concurrency.py`
use local startup guards and nested cleanup boundaries. Process cleanup releases
and reaps an acquired child, closes its output pipes, restores temporary lock
patches, and joins the watchdog only when its public `ident` establishes that it
started. Thread cleanup protects submission and readiness, releases the holder
before executor shutdown, and retrieves an acquired future's result. An outer
boundary restores the original Docker lock even if future cleanup fails.

Focused regressions invoke the actual owners with the real `office_world` fixture.
Process creation failure acquires no child; first-marker failure follows a real
child's lock-acquisition marker; thread readiness failure follows a real holder's
acquisition signal and retains its real executor and future. A real Thread
subclass records joins, and thread observations distinguish owner-thread release
and result retrieval from emergency rescue.

With otherwise healthy cleanup, the injected exception must be the same object
at the top level, not merely present in a cause/context chain. Patch restoration
is observed before outer fixture teardown; acquired child termination and pipe
closure are observed before rescue. Independent emergency cleanup is bounded and
cannot satisfy owner-cleanup assertions. The successful contention exercises and
their liveness, response, session-state and origin-hit assertions are unchanged.
The [active OpenSpec design](../../../../openspec/changes/ocu-contention-startup-cleanup/design.md)
owns the controlled fault and successful-path acceptance criteria.

## Alternatives considered

- **General holder-lifetime abstraction** — adds a shared interface for two
  distinct resource lifetimes without reducing the local ownership decisions.
- **Unconditional watchdog join or executor shutdown alone** — confuses resource
  construction with startup and omits explicit release/result observation.
- **Accept the injected error anywhere in the exception chain** — permits cleanup
  to replace the owning test's initiating diagnostic.
- **Fake acquired holders or count rescue as cleanup** — can pass without proving
  that the actual owners discharge their real acquired resources.

## Consequences

The guarantee covers controlled process creation, first-marker and thread-readiness
faults with otherwise healthy cleanup, plus the existing successful contention
paths. It does not define precedence or aggregation for arbitrary simultaneous
cleanup failures, certify request cancellation, or establish cross-platform leak
freedom. Local real-process/thread pytest evidence is not Docker/ONLYOFFICE
integration or deployment certification; production locks and callbacks are unchanged.

The [HTTP-origin lifetime decision](2026-10-11-office-http-origin-lifetime.md)
continues to own test HTTP servers, sockets and handlers. This separate holder
boundary supersedes neither that decision nor production-lock decisions.
