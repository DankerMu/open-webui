---
id: 2026-10-11-ocu-callback-dns-oracle
title: Callback deadline evidence requires a held threaded resolver
kind: testing
status: implemented
date: 2026-10-11
supersedes: none
references: issue-340
---

# Callback deadline evidence requires a held threaded resolver

## Problem

A bounded callback failure does not prove that DNS entered or remained blocked. aiohttp can select a native asynchronous resolver that bypasses `socket.getaddrinfo`; a socket hook alone therefore cannot establish executor-shutdown behavior. A shortened test deadline can also expire before resolution starts.

## Decision

The callback integration oracle selects aiohttp's real `ThreadedResolver` in test scope, holds its expected socket-resolution call behind an explicit release event, and restores dependency selection afterward. The real callback and downloader remain in the path. Production resolver selection and timeout policy are unchanged.

Acceptance requires observed resolver entry and HTTP502 `download_failed` before release or resolver return. Elapsed time is measured from request start against the configured production deadline plus150ms, without restarting the clock at resolver entry. Existing session-state, receipt, version, output-byte and origin-hit assertions remain mandatory.

The test owns the request worker and blocked resolver invocation. Bounded cleanup releases the resolver and collects both completions before fixture dependencies are restored, including assertion-failure paths. An emergency resolver escape invalidates evidence. Qualification must reject a disposable per-call-loop implementation whose shutdown waits for the held executor worker.

## Alternatives considered

- **Accept any fast502 response** — permits unrelated setup, DNS-backend or scheduling failures to impersonate a held resolver.
- **Rely on the environment's default resolver** — makes the executor-specific scenario dependent on optional native DNS support.
- **Stub the downloader or resolution result** — removes the executor-shutdown boundary being tested.
- **Restart the timer after resolver entry or enlarge the overrun allowance** — hides work from the end-to-end deadline assertion.

## Consequences

The test consumes the configured download timeout and can fail under severe host scheduling delay. The150ms allowance is a regression-test bound, not a LAN service-level guarantee. This scenario covers threaded resolver ownership, not native asynchronous DNS, DocumentServer UI, Docker packaging or deployment. Test-only reversion restores the prior oracle without changing runtime behavior.
