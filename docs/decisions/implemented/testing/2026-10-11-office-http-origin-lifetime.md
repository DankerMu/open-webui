---
id: 2026-10-11-office-http-origin-lifetime
title: Own Office test HTTP handlers through bounded teardown
kind: testing
status: implemented
date: 2026-10-11
supersedes: none
references: issue-235, 2026-09-23-ocu-outputs-http-validators, 2026-10-11-ocu-callback-dns-oracle
---

# Own Office test HTTP handlers through bounded teardown

## Problem

Joining an HTTP server's accept loop does not join its daemon request handlers or close accepted connections. A test can exit while its responder remains active, leaving assertions on socketserver stderr rather than in the owning test. HTTP1.1 keep-alive and held responses make this a resource-ownership boundary, not a logging problem.

## Decision

The four Office origin families in OCU share `tests/orchestrator/_http_origin.py` for socket, worker, wait and error ownership. Each retains its distinct response and request-recording logic. Accepted sockets and workers are registered before execution can escape teardown; controlled holds and pacing are releasable. Teardown stops admissions, releases waits, closes accepted I/O, joins owned threads against one finite deadline and closes the listener. Deadline exhaustion fails the owning test, never reports clean teardown.

The accept loop uses nonblocking admission, but each accepted socket is explicitly returned to blocking mode before HTTP stream setup. Darwin can inherit descriptor `O_NONBLOCK` while Python reports a `None` timeout; relying on that timeout breaks fragmented header/body reads. Socket-mode setup failures remain owned, close the descriptor and reach the test even when socketserver would discard an accept-path `OSError`.

Expected peer/teardown disconnects are tagged at actual stream operations. A responder-raised connection error or assertion remains an unexpected test failure. Handler and body failures remain observable together; the lifetime owner replaces wrapper error lists inspected before handlers necessarily finish. Manual context exits forward the body's exception information.

## Alternatives considered

- **Join only the accept loop** — leaves request workers and accepted sockets outside the fixture lifetime.
- **Use non-daemon workers and an unbounded server close** — can hang the suite behind a held responder or keep-alive connection.
- **Suppress socketserver output or all connection errors** — conceals real responder failures without establishing completion.
- **Duplicate cleanup in each origin** — creates competing ownership implementations and inconsistent failure handling.

## Consequences

Test-controlled waits need explicit release/cancellation. Python cannot forcibly stop an arbitrary uncooperative thread; failure-injection controls therefore own an external emergency release and join. The normal teardown deadline is not a production latency guarantee.

Real HTTP evidence covers success, timeout, admitted cancellation, body/handler failure, keep-alive and partial input. The original historical exception banner remains unattributed. Non-Office tool/deploy origins are a separate cutover tracked by issue-377; production commands, application isolation, callback DNS deadlines and deployment behavior are unchanged.
