# Spec Delta

## Purpose

Keep Office fake HTTP origins' request workers, sockets and failures within the owning test lifetime, including intentional client timeout and cancellation.

## ADDED Requirements

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
