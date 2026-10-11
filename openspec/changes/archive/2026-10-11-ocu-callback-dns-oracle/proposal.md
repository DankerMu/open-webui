# Prove callback completion during a DNS stall

## Why

The callback DNS regression failed with an empty resolver-call list after returning the expected bounded `502 download_failed`. That run did not establish whether DNS stalled. [Issue #340](https://github.com/DankerMu/open-webui/issues/340) owns the test repair; the user explicitly approved it as a merge prerequisite for #199. A fresh instrumented callback used aiohttp's `AsyncResolver`, bypassing the socket hook; selecting the real library `ThreadedResolver` alone reached the held worker and preserved the expected response. This establishes the current backend mismatch, not the original full run's exact cause.

## Risk classification

- Issue type: test.
- Fixture level: expanded — concurrent worker ownership, deadline evidence and false-pass risk.
- Upstream suggested level: absent; expanded covers the asynchronous oracle and cleanup.
- Selected risk packs: public API, file IO, concurrency, resource limits, error handling, compatibility and documentation.
- Evidence floor: resolver-entry/return ordering, unchanged callback/state assertions, bounded worker cleanup, discriminating bad-implementation control and independent review.

## What Changes

- Exercise the real callback/download path with aiohttp's real `ThreadedResolver` selected in test scope while its resolver worker is held behind an explicit release event. Do not replace resolution with canned results or change production resolver selection.
- Use the production-configured download deadline rather than shortening it to a 50 ms test-local scheduling window; do not change production configuration or deadline placement.
- Preserve the existing 150 ms deadline-overrun allowance and require the response before resolver release/return, rather than treating any fast download failure as DNS-stall proof.
- Qualify the oracle against a disposable implementation that waits for resolver shutdown; preserve the original failed run and all new qualification outcomes.

## Capabilities

### New Capabilities

- `ocu-callback-download-evidence`: executable ordering and cleanup requirements for callback DNS-stall regression evidence. No production API or timeout requirement changes.

### Modified Capabilities

None. Office behavior remains governed by the in-flight `ocu-office-editing` contract.

## Impact

The owning test in `tests/orchestrator/test_office_callback_processing.py` and its evidence/documentation only. No Office production edits, dependency changes, timeout-policy increases, deployment or CI waiver. The separate path-test isolation prerequisite #341 is not part of this change.
