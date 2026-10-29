## ADDED Requirements

### Requirement: Terminal reuse requires a listening ttyd and stopping escalates

In gateway mode, a terminal start SHALL report an existing terminal as already running only when a ttyd carrying this request's fingerprint is accepting connections on the terminal port. Stopping the terminal SHALL escalate from SIGTERM to SIGKILL for ttyd processes that do not exit within the bound, and every stated wait bound SHALL be a minimum.

#### Scenario: A fingerprinted ttyd that does not listen

- **WHEN** a ttyd with this request's fingerprint is running but not accepting connections, including one that ignores SIGTERM
- **THEN** the start does not report it as already running, the stop removes it, and a later start with the same settings does not report it as already running
