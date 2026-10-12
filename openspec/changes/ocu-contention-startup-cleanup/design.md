# Design

## Context

Change surface: the two holder tests in OCU `tests/orchestrator/test_office_control_plane_concurrency.py` and focused fault regressions.
The process holder is acquired before its watchdog starts. The thread holder's readiness assertion precedes its protected cleanup.
The issue concerns test-run diagnostics and local cleanup, not an established production resource leak.

## Goals / Non-Goals

Governing invariant: each controlled startup failure remains the owning test's initiating diagnostic after all applicable local cleanup has run.
Must preserve: real combined-lock contention, pending callback checks, same-loop health HTTP 200/body, callback HTTP 200/body, watchdog non-expiry, editing session state and zero origin hits.
Must change: cleanup ownership starts before fallible startup/readiness; only started watchdogs are joined; acquired holders are released and observed; temporary patches are restored before fixture teardown.
Sibling surfaces: process creation, first process readiness marker, thread-holder readiness, and the two existing successful paths.
Non-goals: production locks/callbacks, request cancellation, arbitrary simultaneous cleanup-failure aggregation, platform-wide leak certification, or contention-oracle redesign.

## Decisions

Prefer local ownership guards and nested cleanup boundaries over a new general context-manager abstraction for two cases.
Track actual startup/acquisition, rather than assuming a constructed thread or submitted future completed setup.
Regressions exercise real acquired child/future resources where applicable. Fault injection targets startup seams, not the system under test's cleanup.
For otherwise healthy cleanup, assert the injected exception is the top-level exception object. Finding it only in `__context__` does not satisfy the contract.
Observe patch restoration before outer fixture teardown; rescue cleanup is bounded and must not count as owner cleanup.
Use canonical `tests/` discovery with module-name `-k` selection; collection alone is not execution evidence.

## Required Evidence

Process creation fault -> same initiating exception, no unstarted join, original lock restored, no acquired child.
First-marker fault after a real child acquires the lock -> same initiating exception, child reaped, pipe handles closed, patches restored, no unstarted join.
Thread readiness fault after a real holder acquires the lock -> same initiating exception, explicit owner release and future observation, restored patch, no reliance on rescue cleanup.
Normal thread/process paths -> existing liveness, response and state-conservation assertions pass unchanged.
Parent-owned pytest CLI probes retain expected failing-test exit and startup diagnostic, with a separate verifier judging cleanup observations.
Focused regressions go RED before each ownership repair and GREEN afterward; test/production scope identities and environment are retained.

## Risks / Trade-offs

A masked error can survive in exception context -> compare top-level identity, not recursive containment.
A failed thread test can wait on executor shutdown -> independent bounded rescue releases it, recording rescue as a failed ownership oracle.
Instrumented observations can become mock echoes -> real child/future acquisition and actual test execution remain required.
Single-host controlled evidence is limited -> no cancellation, deployment or general resource-leak claim.

## Migration Plan

Test-only atomic replacement; no data migration. Revert the source commit to roll back. Central evidence records the accepted source revision.
