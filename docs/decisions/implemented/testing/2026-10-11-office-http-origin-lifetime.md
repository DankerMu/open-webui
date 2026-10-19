---
id: 2026-10-11-office-http-origin-lifetime
title: Own OCU test HTTP handlers through bounded teardown
kind: testing
status: implemented
date: 2026-10-11
supersedes: none
references: issue-235, issue-377, 2026-09-23-ocu-outputs-http-validators, 2026-10-11-ocu-callback-dns-oracle
---

# Own OCU test HTTP handlers through bounded teardown

## Problem

Joining an HTTP server's accept loop does not join its daemon request handlers or close accepted connections. A test can exit while its responder remains active, leaving assertions on socketserver stderr rather than in the owning test. HTTP1.1 keep-alive and held responses make this a resource-ownership boundary, not a logging problem.

## Decision

OCU's Office command, router, callback and download origins, tool redirect origin, font archive origin, deployment smoke fixture/control listeners, initializer fake WebUI and native HTTP/TTY fixtures share `tests/orchestrator/_http_origin.py` for socket, worker, wait and error ownership. Each retains its distinct response and request-recording logic. Accepted sockets and workers are registered before execution can escape teardown; controlled holds and pacing are releasable. Teardown stops admissions, releases waits, closes accepted I/O, joins owned threads against one finite deadline and closes the listener. Deadline exhaustion fails the owning test, never reports clean teardown.

The default bind remains loopback port 0; an optional bind address preserves deployment control ports 8081/8080/8082 and the URL reports the actual bound address. Each acquired lifetime, temporary directory and reservation socket becomes cleanup-eligible immediately, with socket cleanup registered before bind. Independent unittest cleanups keep every acquired owner eligible even when setup or another cleanup fails. Initializer marker polling observes owner cancellation without deleting the caller's captured marker.

The accept loop owns one selector with a positive bounded readiness wait and nonblocking admission. Each accepted socket is explicitly returned to blocking mode before HTTP stream setup. A nonblocking listener gives `handle_request()` a zero timeout even when the server timeout is positive; the separate selector avoids idle busy-polling. Darwin can inherit descriptor `O_NONBLOCK` while Python reports a `None` timeout; relying on that timeout breaks fragmented header/body reads. Socket-mode setup failures remain owned, close the descriptor and reach the test even when socketserver would discard an accept-path `OSError`.

Expected peer/teardown disconnects are tagged at actual stream operations and socket timeout configuration. A bad descriptor at those operations is expected only while stopping; the same error while running remains attributable. A responder-raised connection error or assertion remains an unexpected test failure. Handler and body failures remain observable together through context exit or unittest failure/cleanup records. A held-save wrapper owns the acquired origin until it returns a box to its caller, including client-start and readiness failures. Manual context exits forward the body's exception information.

## Alternatives considered

- **Join only the accept loop** — leaves request workers and accepted sockets outside the fixture lifetime.
- **Use non-daemon workers and an unbounded server close** — can hang the suite behind a held responder or keep-alive connection.
- **Suppress socketserver output or all connection errors** — conceals real responder failures without establishing completion.
- **Duplicate cleanup in each origin** — creates competing ownership implementations and inconsistent failure handling.

## Consequences

Test-controlled waits need explicit release/cancellation. Python cannot forcibly stop an arbitrary uncooperative thread; failure-injection controls therefore own an external emergency release and join after retirement observations. The finite teardown deadline applies per origin, so multiple owned origins can consume multiple bounds. It is not a production latency guarantee.

Real HTTP regressions cover success, timeout, admitted cancellation, body/handler failure, keep-alive, partial input, captured-marker cancellation and partial-startup/multiowner cleanup. Retirement observations precede emergency rescue. Local verification uses Python 3.12 on Darwin/arm64 and loopback fixtures; it does not establish Linux/amd64 behavior, real Docker or LAN deployment readiness. Production commands, application isolation, callback DNS deadlines and deployment behavior are unchanged.
