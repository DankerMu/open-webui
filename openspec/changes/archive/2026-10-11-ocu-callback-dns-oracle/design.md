# Resolver-entry oracle

## Context and invariant

`fetch_callback_content` submits the real downloader to the captured request loop and waits on its future using `commands.HTTP_TIMEOUT_SECONDS` (currently10 seconds). The existing test replaces that value with50 ms, blocks DNS for300 ms and accepts a response below200 ms. An empty resolver-call list cannot prove resolver-shutdown behavior. The installed aiohttp can select `AsyncResolver`, which bypasses the socket hook; the test must select the actual threaded backend for this executor-shutdown scenario. Neither the callback nor downloader is modified here.

Governing invariant: a valid DNS-stall observation requires the expected resolver worker to be entered and still blocked when the real callback returns its deadline failure; every owned worker is then released and joined.

## Decisions

- Keep the existing callback integration test and real filesystem/state fixtures; no second production downloader or mocked download result.
- Select aiohttp's real `ThreadedResolver` through the test's external-dependency override and restore selection in teardown. Its real event-loop executor must invoke the held `socket.getaddrinfo`; no stub resolver result or downloader replacement. This scenario does not claim coverage of the native asynchronous resolver backend.
- Stop overriding the production deadline with50 ms. Capture the actual configured deadline before starting the request. The assertion remains end-to-end from request start, bounded by that deadline plus the existing150 ms overrun allowance. This changes the test stimulus, not production policy or deadline placement; it does not restart the clock at DNS entry.
- Run the actual POST in an owned request worker. The resolver hook records the expected host, signals entry and waits for an explicit release event. Record resolver return separately. Require entry before accepting any response as DNS-stall evidence; a response before entry is an invalid setup, not a passing stall observation.
- Require `502 download_failed`, response completion while both resolver release and return remain unset, and the existing editing/failure reason plus unchanged receipts, versions, output bytes and origin-hit assertions.
- Use bounded readiness and response waits with monotonic timestamps. Cleanup is in `finally`: release DNS even when an assertion fails, observe resolver return, collect request failure/result and join the request worker. The resolver itself has a finite emergency escape that makes the oracle fail, never a successful automatic release. Do not rely on an executor context manager's unbounded shutdown during failure cleanup.

## Qualification and phases

1. Preserve the full-suite empty-call observation without claiming a proven scheduler cause. Retain both the disposable preamble-delay control and the instrumented default-versus-threaded resolver discriminator; the latter establishes the current test dependency mismatch.
2. Validate this fixture, then implement the event-based oracle against unchanged production code. Record the actual configured deadline, entry/response/release/return ordering and elapsed time.
3. In a disposable source copy, qualify sensitivity against the historical failure class: execute the real downloader on a per-call loop whose shutdown waits for the held resolver. The repaired oracle must reject it for response-before-release/deadline failure, not import/setup failure. Never modify live production code for this control.
4. Restore the unchanged real implementation and run the same oracle, plus the owning callback/download modules. Retain the bad-control failure and restoration success. Dedicated bounded stability trials retain every result; no retry-to-green or threshold adjustment.

## Sibling surfaces, risks and rollback

The POST callback, download future, request loop, resolver executor, callback failure-state update and test teardown all participate. Existing direct downloader deadline tests remain unchanged and are included in compatibility verification. The150 ms allowance is not a LAN SLA. Severe host scheduling delay can still invalidate setup; the test must identify that condition instead of claiming the DNS contract passed. A test-only revert is sufficient rollback. The unrelated outputs test fixture is handled by #341.
