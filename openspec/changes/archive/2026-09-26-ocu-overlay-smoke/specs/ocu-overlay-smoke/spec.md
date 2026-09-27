# Spec Delta

## Purpose

Provide an operator-run, fail-loud verification of the deployed overlay's actual publications, sandbox connectivity and newly opened terminal behavior, with safe ownership and bounded evidence.

## ADDED Requirements

### Requirement: Deployed port matrix

The smoke SHALL inspect running project services and assert that only the intended proxy TCP port is published, with required application/proxy services running. It SHALL corroborate inspected identities and fail malformed or incomplete inventory. It SHALL verify that a connection to the explicitly supplied former OCU publication is refused; a successful connection or timeout SHALL not pass that assertion.

#### Scenario: Unexpected publication

- **WHEN** a non-proxy service publishes any host port or the proxy mapping differs from the expected publication
- **THEN** smoke exits nonzero and names the assertion

#### Scenario: Former OCU entry

- **WHEN** the former OCU address accepts a connection, times out or fails for an unrelated reason
- **THEN** smoke refuses to certify that entry as absent

### Requirement: Causal network evidence

The smoke SHALL require live positive controls and actual successful HTTP egress to an explicitly allowlisted IPv4 destination before accepting sandbox control-plane isolation. It SHALL use literal addresses, bypass environment proxies and distinguish connection timeout from DNS failure, refusal, missing tools, engine errors and post-connect response timeout. Only a connection-phase timeout against the exact independently live control endpoint SHALL satisfy the negative probe.

#### Scenario: False isolation signals

- **WHEN** a sandbox probe fails due to DNS, a dead listener, missing executable or a timeout after connection
- **THEN** smoke exits nonzero rather than reporting isolation success

#### Scenario: No usable positive egress

- **WHEN** no allowed positive target exists, including a valid deny-all deployment, or its HTTP request fails
- **THEN** smoke reports an unsuitable prerequisite or assertion failure and does not report a complete PASS
- **AND** it never changes the allowlist to manufacture success

### Requirement: Actual terminal default

On a dedicated operator-designated smoke sandbox, the smoke SHALL open the product terminal via its authenticated start request and ttyd WebSocket, then observe the product-created terminal's Bash process and foreground state. Environment presence or a separately spawned Bash SHALL not substitute for this observation. It SHALL reject an auto-started coding CLI and SHALL not inject NO_AUTOSTART or persistent bypass markers.

#### Scenario: New product terminal

- **WHEN** the dedicated sandbox has no prior terminal state and the product starts a new session
- **THEN** smoke verifies the pane and actual foreground process remain plain Bash over the bounded observation
- **AND** an auto-started CLI causes nonzero failure

### Requirement: Owned bounded execution

The smoke SHALL require matching inspected sandbox/chat identity and explicit exclusive smoke ownership. It SHALL refuse pre-existing terminal state, keep credentials out of arguments/logs, bound subprocess and protocol waits, and clean only terminal state it created. Cleanup failures SHALL fail the run. Nonzero assertion or prerequisite failures SHALL be named; exit0 SHALL mean every required assertion and owned cleanup completed.

#### Scenario: Existing user terminal

- **WHEN** ttyd or any assistant tmux session exists before the run
- **THEN** smoke refuses before terminal mutation and does not stop that session

#### Scenario: Failed observation or cancellation

- **WHEN** a probe or terminal observation fails or the run is interrupted after owned terminal creation
- **THEN** owned connections/processes and terminal state are cleaned with bounded operations, without changing unrelated containers or firewall state

### Requirement: Evidence scope

Development fake/native checks SHALL not be represented as real Docker acceptance. Final issue36 SHALL run the shipped command on the actual pinned deployment and retain observed port, network, terminal and cleanup results.

#### Scenario: Development-only verification

- **WHEN** only isolated fake/native fixtures were exercised
- **THEN** the command implementation may be reviewed but deployed-host acceptance remains explicitly pending
