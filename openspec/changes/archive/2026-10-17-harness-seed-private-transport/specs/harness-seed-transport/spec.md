## Purpose

Keep generic harness seed credentials out of transport subprocess arguments and bind private credential files to the lifetime of their owning seed or smoke invocation.

## ADDED Requirements

### Requirement: Seed and smoke use private credential transport

Generic seed and smoke SHALL keep passwords and password-bearing JSON out of curl, Hurl and helper subprocess argv. Curl request bodies and Hurl secrets SHALL use mode0600 files beneath fresh owned mode0700 scratch. Hurl SHALL mark the password secret for report redaction. Seed and Hurl SHALL consume the same resolved credentials, preserving Make command-line precedence over environment values and seed's existing absent/empty fallback defaults. Standalone seed and its e2e/UI callers SHALL retain signin-first idempotence and signup fallback for unsuccessful authentication responses.

#### Scenario: Default and overridden credentials

- **WHEN** seed/smoke use defaults, environment overrides or Make command-line overrides
- **THEN** seed and Hurl authenticate with the same effective credentials and no transport/helper argv contains the password
- **AND** an already seeded account succeeds through signin without another signup

#### Scenario: Private files and redacted reports

- **WHEN** curl or Hurl consumes the credential inputs
- **THEN** each input file is0600 beneath this invocation's fresh0700 scratch and contains the intended effective values
- **AND** real Hurl reports redact the password, with a non-secret-variable control proving the report oracle can observe an exposed value

### Requirement: Credential lifetime follows owned child lifetime

The owner SHALL retire its active credential-transport child and remove its private files/scratch after success, nonzero child exit, launch failure and catchable interruption. Failures SHALL remain nonzero; cleanup SHALL NOT affect unrelated files or processes. Environment visibility, the operator's own Make command line, uncatchable SIGKILL and host crashes are outside this guarantee.

#### Scenario: Completion and launch errors

- **WHEN** a seed or smoke transport succeeds, returns nonzero or cannot launch
- **THEN** the command reports the corresponding success/failure and leaves no owned credential files or scratch

#### Scenario: Interrupted transport

- **WHEN** the owning seed or smoke invocation receives SIGINT, SIGTERM or SIGHUP during a transport
- **THEN** its child is retired before private credential inputs are removed and the command exits nonzero
- **AND** unrelated sentinel files and processes remain untouched
