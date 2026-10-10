# ocu-proxy-smoke Specification

## Purpose

Provide a reproducible permanent native gateway acceptance command that verifies real WebUI ownership, private OCU forwarding observations and browser-response credential containment against an exact reviewed cross-repository source.

## Requirements

### Requirement: Exact-source fail-loud native smoke

make smoke-proxy SHALL exercise the reviewed gateway through the existing launcher against real WebUI auth and the existing extended OCU stub. It SHALL verify the full OCU commit pinned in constraints.yaml and fail on missing prerequisites, wrong revision or modified tracked source. It SHALL own and terminate its temporary proxy/stub processes and delete only test-created harness data, preserving unrelated services/data. It SHALL NOT require Docker or become part of the ordinary smoke glob.

#### Scenario: Successful local and CI run

- **WHEN** the real harness is healthy and the pinned OCU checkout and native prerequisites are available
- **THEN** make smoke-proxy runs the permanent matrix and exits0 only when every assertion passes

#### Scenario: Wrong checkout or missing prerequisite

- **WHEN** the OCU checkout revision differs, tracked source is modified or a required tool/config is missing
- **THEN** the command fails nonzero naming the problem without claiming a skip or silently changing the checkout

#### Scenario: Existing checkout runtime remains untouched

- **WHEN** the source checkout already has ignored proxy configuration or runtime files
- **THEN** the command verifies and copies only reviewed tracked proxy sources into private scratch, renders and launches there, and leaves the original ignored material unchanged on success, failure and interruption

#### Scenario: Failure cleanup and ordinary smoke independence

- **WHEN** a proxy assertion fails or the command is interrupted
- **THEN** owned processes terminate and test data is cleaned without hiding failure
- **WHEN** make smoke runs without an OCU checkout
- **THEN** its existing API smoke behavior remains available without proxy prerequisites

### Requirement: Observable authentication and forwarding matrix

The permanent judge SHALL distinguish owner success, anonymous401, valid-session non-owner404, session-only static access, mutation403 and upstream error passthrough. It SHALL prove denied/unlisted requests do not contact OCU and allowed requests carry server-derived identity and the internal credential. It SHALL preserve exact per-request attribution, query/encoded path and upload bytes, and exercise authenticated WS upgrades.

#### Scenario: Owner versus foreign authenticated user

- **WHEN** owner and distinct valid non-owner sessions request the same chat row
- **THEN** owner succeeds with server-derived identity and non-owner receives404 without OCU contact, while that non-owner can access static assets

#### Scenario: Forged identity and alternate credential

- **WHEN** requests carry forged identity headers or a JWT only in the default active x-api-key header
- **THEN** forged identity is overwritten on owner requests and cookie-less chat/static requests receive401 without OCU contact

#### Scenario: Active alternate-header positive control

- **WHEN** the matrix begins alternate-credential checks
- **THEN** a cookie-less and Authorization-less direct WebUI owner-auth request with the JWT solely in x-api-key first returns200 with owner identity, followed by gateway chat/static401 for the same header credential and unchanged OCU arrival counts
- **WHEN** that direct control cannot establish the active header path
- **THEN** the command fails a named prerequisite without restarting WebUI or reporting the negative gateway check as passed

#### Scenario: Default deny and mutation provenance

- **WHEN** unlisted identity/internal/health/MCP/docs paths or methods are requested
- **THEN** they return404 without OCU contact
- **WHEN** Origin:null or missing mutation headers accompany POST or mutating GET heartbeat
- **THEN** they return403 without OCU contact, distinct from owner denial404 and unchanged OCU403/409

#### Scenario: Prefix, encoded paths, upload and WS

- **WHEN** listed static/chat, encoded nested file, upload or WS requests are exercised
- **THEN** private observations prove correct prefix handling, matching route chat, query and payload fidelity, with exactly attributable requests and successful allowed WS frame exchange

### Requirement: Generated-content policy and credential containment

The matrix SHALL assert enforced CSP/nosniff on generated HTML/SVG/XML, preserved binary/download policy, attachment disposition, prefixed preview resources and cookie-less relative-resource401. Every exercised browser response's headers and body SHALL exclude the synthetic internal token; allowed requests SHALL independently prove correct upstream credential receipt. Public stub routes SHALL not echo credentials; existing internal fixture echo behavior MAY remain unproxied.

#### Scenario: Generated and downloaded file responses

- **WHEN** generated files, binary files and download=1 fixtures are requested
- **THEN** each follows the approved gateway MIME/download policy without duplicate CSP

#### Scenario: Credential echo regression

- **WHEN** a controlled upstream fixture reflects the internal token in a browser response
- **THEN** the judge fails for containment without printing that token
- **WHEN** the corrected public fixture handles an allowed request
- **THEN** response containment and private correct-token receipt both pass

### Requirement: Pinned CI and paired merge gate

CI layer3 SHALL check out the public OCU repository at constraints.yaml's exact SHA under .run/open-computer-use and run the same make smoke-proxy target. Documentation SHALL name that target in the Verification Matrix. OCU PR15 and this change SHALL remain unmerged until both reviews and the permanent matrix/CI pass on the exact paired candidates; OCU SHALL merge first without changing the tested source pin.

#### Scenario: CI consumes reviewed source

- **WHEN** CI runs the integration layer
- **THEN** it resolves the declared full SHA, checks out that source and produces a successful smoke-proxy result before the paired merge gate can open

### Requirement: Best-effort cleanup of run-owned data

The smoke harness SHALL attempt all eligible run-owned chat and user cleanup operations even when another cleanup operation fails with an HTTP or transport error. Eligibility SHALL remain limited to this run's recorded IDs and exact owner or foreign email matches. It SHALL report one aggregate cleanup failure containing only operation kinds and HTTP statuses or exception classes. It SHALL NOT include credentials, URLs, identifiers, email addresses, response bodies or exception messages. It SHALL preserve an existing nonzero run status, turn a successful run nonzero on cleanup failure, and continue its existing process, sentinel and scratch cleanup lifecycle without adding retries.

#### Scenario: Failed first owned delete

- **WHEN** the first owned chat deletion returns HTTP 500 or raises a transport error
- **THEN** all remaining owned chats, known users and exact-email fallbacks are attempted, unrelated data stays untouched, and the aggregate is redacted

#### Scenario: Failed email fallback operation

- **WHEN** a fallback lookup fails or one deletion among exact-email results fails
- **THEN** the other eligible result deletions and fallback lookups are attempted without deleting partial email matches

#### Scenario: Cleanup preserves the run verdict and resource cleanup

- **WHEN** data cleanup fails after a run returns 0, 1 or is interrupted with 130
- **THEN** the final code is respectively 1, 1 or 130, with process, sentinel and scratch cleanup retained

#### Scenario: Successful and unauthenticated cleanup

- **WHEN** each owned deletion returns 200, 204 or 404
- **THEN** no cleanup error is reported
- **WHEN** no admin cookie was acquired
- **THEN** cleanup makes no data requests
