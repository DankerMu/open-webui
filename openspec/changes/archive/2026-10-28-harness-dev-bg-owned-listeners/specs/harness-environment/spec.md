## ADDED Requirements

### Requirement: The development lifecycle touches only listeners this checkout owns

The development server lifecycle SHALL signal only processes whose working directory resolves to this checkout's repository root. Stopping SHALL leave any other listener on the harness ports running and SHALL name it. Starting SHALL refuse, before starting anything, when another process holds a harness port. Status SHALL NOT report a server it did not start as healthy, and SHALL report healthy only when a listener of this checkout serves the backend port; starting SHALL declare readiness only for a server it started. Processes this checkout started, including servers re-spawned outside the recorded process group, SHALL still be stopped.

#### Scenario: Another project's server holds a harness port

- **WHEN** a process whose working directory does not resolve to this checkout's repository root, including one in another or a nested repository, listens on the frontend or backend port
- **THEN** stop leaves it running and names it, start refuses naming it without starting anything, and status does not report it as healthy

#### Scenario: The harness's own servers are stopped

- **WHEN** the harness started the servers, including a server re-spawned outside the recorded process group
- **THEN** stop stops them and the ports are free
