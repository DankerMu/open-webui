# ocu-callback-download-evidence Specification

## Purpose

Make the callback DNS-stall regression prove response ordering against a live blocked resolver, without substituting a fast unrelated download failure or leaving test workers behind.

## Requirements

### Requirement: DNS-stall evidence requires observed resolver entry

The regression oracle SHALL exercise the real callback and downloader with aiohttp's real `ThreadedResolver` selected in test scope and the expected resolver call held by an explicit release event. It SHALL restore resolver selection in teardown and SHALL NOT stub resolution results or alter production resolver selection. It SHALL observe resolver entry before accepting the scenario, and SHALL observe `502 download_failed` while the resolver release and resolver-return signals are both unset. A response that precedes resolver entry SHALL NOT qualify as DNS-stall evidence. Production deadline values and placement SHALL remain unchanged.

#### Scenario: Callback returns while resolution remains blocked

- **WHEN** the real callback reaches `socket.getaddrinfo` for `slow-resolution.example` and that worker is held
- **THEN** the callback returns its configured deadline failure before resolver release or return
- **AND** elapsed request time stays within the captured configured deadline plus the existing150 ms overrun allowance, with no clock restart at DNS entry

#### Scenario: Download fails before DNS begins

- **WHEN** a callback failure occurs without the expected resolver-entry signal
- **THEN** the oracle refuses to report a successful DNS-stall observation and identifies the missing prerequisite

#### Scenario: Environment defaults to asynchronous resolution

- **WHEN** the installed aiohttp defaults to a resolver that bypasses the event-loop executor
- **THEN** this executor-shutdown scenario explicitly selects the real threaded backend and observes its blocked invocation
- **AND** it makes no coverage claim for the native asynchronous backend and restores the prior dependency selection afterward

### Requirement: DNS failure evidence preserves callback state assertions

The oracle SHALL retain the expected editing state and `download_failed` reason, unchanged receipts, unchanged document versions, unchanged workspace output bytes, and zero content-origin requests. Resolver scheduling observations SHALL NOT replace these assertions or stub the callback/download result.

#### Scenario: Timed-out content is not persisted

- **WHEN** the blocked resolver causes the callback download to fail
- **THEN** the session reports the expected failure state and every retained-state/content-origin assertion is evaluated

### Requirement: Evidence workers have bounded ownership and cleanup

The oracle SHALL release and join its owned request/resolver workers on success and assertion failure. An emergency resolver escape SHALL be bounded and SHALL invalidate the scenario rather than impersonating an explicit release. It SHALL NOT rely on an unbounded executor shutdown for failure cleanup.

#### Scenario: Assertion fails while DNS is held

- **WHEN** an assertion or request fails before normal teardown
- **THEN** cleanup releases the held resolver, observes its termination and joins the request worker within explicit bounds
- **AND** no owned worker survives the test

### Requirement: The repaired oracle rejects resolver-shutdown regression

Qualification SHALL retain the original failed observation, a valid run against unchanged production, a discriminating rejection of a disposable resolver-shutdown-wait implementation, and restoration success. The bad control SHALL fail for the intended response-order/deadline invariant, not setup or import failure. Every stability trial SHALL be retained; retries, skipped failures and looser deadline-overrun allowance SHALL NOT establish success.

#### Scenario: Per-call loop waits for the resolver

- **WHEN** a disposable implementation runs the real downloader on a per-call event loop whose shutdown waits for the held resolver
- **THEN** the oracle rejects its missing response before release and performs bounded cleanup
- **AND** restoring the unchanged request-loop implementation passes the same oracle
