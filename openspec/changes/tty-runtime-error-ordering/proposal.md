# TTY runtime-error ordering

## Why

The native TTY runtime-EBADF regression can leave its owner on client EOF before the handler classifies the injected error. A controlled schedule reproduces `OSError not raised`; ordering worker completion before owner shutdown preserves the exact error.

## What Changes

- Synchronize the runtime-error test with completed handler classification, rather than using EOF as completion.
- Observe the real timeout operation's error and running-owner state; preserve exact exception identity, singular delivery and worker/socket retirement.
- Keep the separate teardown-EBADF case and shared lifetime implementation unchanged.

## Capabilities

### Modified Capabilities

- `ocu-http-test-origins`: deterministic runtime-versus-teardown transport-error evidence.

## Impact

OCU `tests/deploy/test_http_origin_consumers.py` and `tests/README.md`; no production changes or dependencies. Related issue: DankerMu/open-webui#502.

Issue type: test
Fixture level: expanded
Upstream suggested level: absent (concurrency trigger)
Blast radius: false assurance or flaky failure in shared HTTP-origin error attribution.
Selected risk packs: Concurrency / shared state / ordering; Error handling / rollback / partial outputs; Documentation / migration notes.
Evidence floor: controlled failing-before/passing-after schedule, real runtime/teardown contrast, affected origin consumers and deploy suite, strict fixture/docs checks, three-seat review.
