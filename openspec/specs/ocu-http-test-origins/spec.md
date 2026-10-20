# ocu-http-test-origins Specification

## Purpose

Keep fake HTTP test origins' request workers, sockets and failures within the owning test lifetime, including intentional client timeout, cancellation and exceptional teardown, and keep intentionally refused endpoints refusing on every host.

## Requirements

### Requirement: Office origin teardown owns every admitted handler

Office test origins SHALL complete or release every admitted request handler and close their listening and accepted sockets before successful context exit. Teardown SHALL use an explicit finite completion bound and SHALL fail the owning test rather than claim success if an owned worker survives. Test-controlled holds and delays SHALL be releasable on exceptional exit; closing only the listener SHALL NOT establish completion.

#### Scenario: Successful request leaves a keep-alive connection

- **WHEN** a request succeeds but its client retains the connection
- **THEN** exiting the origin context retires its worker and both accepted and listening sockets within the teardown bound
- **AND** no owned request worker remains for a later test

#### Scenario: Client times out while a handler is held

- **WHEN** the client reports its expected timeout while the origin handler is still active
- **THEN** origin teardown releases the held response and observes handler termination before successful exit
- **AND** the client's expected command outcome remains unchanged

#### Scenario: Client is cancelled after handler admission

- **WHEN** the admitted client's operation is cancelled
- **THEN** cancellation still reaches that caller and teardown retires its request handler and sockets within the bound

#### Scenario: Test body fails before releasing a handler

- **WHEN** the owning test raises while its handler is held or waiting for request input
- **THEN** teardown releases fixture-controlled waits and closes accepted I/O, observes worker termination and closes the listener
- **AND** the original body failure remains visible

### Requirement: Handler failures belong to the originating test

Unexpected responder and handler failures SHALL be surfaced in the originating test after owned workers are drained, not printed later or discarded. If the body and a handler both fail, both failures SHALL remain observable. Expected client-disconnect handling SHALL be restricted to intentional transport shutdown; it SHALL NOT hide responder assertions or unrelated connection errors.

#### Scenario: Responder deliberately fails

- **WHEN** a responder raises a deliberate assertion
- **THEN** the same origin context reports that failure to its owning test and completes resource cleanup
- **AND** no late socketserver banner or unhandled worker error is left for a subsequent test

#### Scenario: Body and responder fail together

- **WHEN** the body raises and an admitted handler also raises during teardown
- **THEN** the test reports both failures without replacing the body failure with an incidental cleanup timeout

#### Scenario: Expected disconnect is not a blanket exception exemption

- **WHEN** an intentional client timeout or cancellation disconnects the response transport
- **THEN** the fixture handles that expected transport outcome while draining the handler
- **AND** a separately injected responder failure still fails the owning test

### Requirement: Origin ownership preserves Office behavior

The command, recording, content and download origin families SHALL share one lifetime implementation while retaining their distinct response and request-observation contracts. Existing command/router/save-close and analogous origin-consumer assertions SHALL remain active, including status/body validation, redirect refusal, secrecy, cancellation, save/close state and concurrency ordering. Production command behavior SHALL remain unchanged.

#### Scenario: Existing Office consumers use managed origins

- **WHEN** existing command/router/save-close, content/download, session, sweep and resolution tests run through the managed origins
- **THEN** their existing outcome and concurrency assertions pass without retries, weakened checks or skipped cases
- **AND** owned fixture workers and sockets are retired on each exit

### Requirement: Non-Office test origins share bounded ownership

Tool redirect, font archive, deployment smoke fixture/control, initializer fake WebUI and native HTTP/TTY test origins SHALL use the canonical HTTP lifetime owner. Successful test or context exit SHALL follow completion of every admitted handler and closure of its accepted and listening sockets within a finite teardown bound. Fixture-controlled holds SHALL be released or canceled on exceptional exit. Unexpected handler failures SHALL reach the owning test under the existing shared error-attribution contract; failure of one owned server SHALL NOT bypass cleanup of other owned servers or fixture resources.

#### Scenario: Completed and incomplete requests retire before exit

- **WHEN** each named family exits after a completed request or while an admitted handler waits on partial HTTP input
- **THEN** its request worker and accepted/listening sockets are retired before successful owner exit
- **AND** no late worker output is required to discover an error

#### Scenario: Controlled responder or WebSocket hold

- **WHEN** an owning test exits while an initializer marker, deployment response/WebSocket hold or native TTY hold is active
- **THEN** teardown releases or cancels the hold and observes handler completion within its bound
- **AND** cleanup does not rely on later deletion of an unrelated marker or on an emergency rescue

#### Scenario: Body and handler failure remain attributable

- **WHEN** a test body raises, a handler deliberately raises, or both fail in the same lifetime
- **THEN** the original failures remain observable by the owning context or unittest result after resource retirement
- **AND** no broad exception suppression or late socketserver banner substitutes for attribution

#### Scenario: Multiple servers and partial startup

- **WHEN** a deployment fixture owns several listeners and one startup or teardown path fails
- **THEN** all already-acquired servers, handlers and accepted sockets remain eligible for bounded cleanup
- **AND** the initiating failure remains visible rather than being replaced by a false successful teardown

#### Scenario: Existing bind and protocol behavior remains intact

- **WHEN** the deployment control listeners use their existing loopback ports, or redirect/font/init/native HTTP/TTY consumers run normally
- **THEN** addresses, response bytes/framing, protocol handshake and existing behavioral assertions remain intact
- **AND** redirect targets receive no disallowed arrivals, configuration errors remain explicit and credential-absence assertions remain active

#### Scenario: Office consumers and entrypoints remain compatible

- **WHEN** existing Office origins, focused pytest selections, deploy unittest discovery or the affected direct-script entrypoints use the shared owner
- **THEN** they retain their default bind behavior, finite teardown, error attribution and existing outcome assertions without skips or a second lifetime implementation

### Requirement: Transport-error regressions distinguish runtime from teardown

Native TTY origin regressions SHALL distinguish a real closed-socket timeout error classified while the owner is running from an error caused after owner shutdown begins. Runtime evidence SHALL establish completed handler error attribution before leaving the running-owner context; client EOF alone SHALL NOT establish that boundary. The runtime case SHALL surface the same unexpected error exactly once, while the teardown case SHALL retain expected-disconnect handling. Both cases SHALL verify bounded worker and accepted/listening-socket retirement before emergency cleanup.

#### Scenario: Runtime error races with client EOF

- **WHEN** closing the accepted socket makes client EOF visible before the handler's timeout operation and error classification finish
- **THEN** the runtime regression waits for completed handler attribution while the owner remains running
- **AND** the actual timeout operation reports EBADF and the owner surfaces that identical error exactly once after retirement

#### Scenario: Timeout configuration occurs during shutdown

- **WHEN** owner shutdown closes the accepted socket before the handler configures its timeout
- **THEN** the teardown contrast observes actual EBADF without reporting an unexpected runtime failure
- **AND** the request worker and accepted/listening sockets are retired

#### Scenario: Injected operation does not produce the expected error

- **WHEN** the runtime test's timeout operation succeeds or is never reached
- **THEN** the regression fails with evidence distinguishing that missing operation/error from a recorded error suppressed by the owner
- **AND** cleanup remains bounded without masking the initiating failure

### Requirement: Refused DocumentServer endpoints refuse deterministically

Office tests that cover the DocumentServer connection-refused branch SHALL point the client at a loopback port whose socket was closed before the client connects, and SHALL NOT keep a bound, non-listening socket open across the connect. Before use, the shared helper SHALL verify that the port refuses a direct connection, and SHALL fail the test with a diagnostic when it does not. Existing outcome assertions SHALL remain unchanged.

#### Scenario: Refused case on a host that silently drops non-listening connects

- **WHEN** a refused-connection Office test runs on a host where a bound, non-listening loopback port times out instead of refusing
- **THEN** the client still receives a connection refusal promptly and every existing outcome assertion holds

#### Scenario: Endpoint that does not refuse

- **WHEN** the helper's probe of the prepared port does not end in a connection refusal
- **THEN** the test fails with a diagnostic instead of exercising a different failure branch
