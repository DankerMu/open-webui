## ADDED Requirements

### Requirement: Terminal start reports success only for a listening terminal

In gateway mode, a terminal start that stops a running terminal SHALL wait, within a bound, for the previous ttyd to exit before starting a new one, and SHALL answer with an error instead of starting when it does not exit. After starting, it SHALL report success only once a ttyd carrying this request's fingerprint is accepting connections on the terminal port within a bound, and SHALL otherwise answer with an error. The deployment smoke SHALL check that an immediate second start with the same token and model reuses the terminal, while still never stopping a terminal it did not start.

#### Scenario: The previous ttyd exits late

- **WHEN** the previous ttyd is still exiting when the terminal restarts
- **THEN** the new ttyd starts only after the previous one has exited, and the start reports success once the new one listens

#### Scenario: The new ttyd does not listen

- **WHEN** the previous ttyd does not exit within the bound, or no ttyd with this request's fingerprint listens on the terminal port within the bound after starting
- **THEN** the start answers with an error naming the cause and does not report the terminal as started

#### Scenario: Smoke checks reuse

- **WHEN** the deployment smoke has started its own terminal and starts it again with the same token and model
- **THEN** the second start must report the terminal as already running, and the smoke still stops only its own terminal
