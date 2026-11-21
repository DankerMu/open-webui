# ocu-init-secrets Specification

## Purpose

Keep the credentials OCU's Open WebUI initializer handles (the admin password, the MCP API key and the admin session token) out of every process argument, where any account on a shared host can read them, and leave no copy of them on disk after the initializer exits.

## Requirements

### Requirement: The initializer keeps credentials out of process arguments

OCU's `openwebui/init.sh` SHALL NOT pass `ADMIN_PASSWORD`, `MCP_API_KEY` or the admin session token as an argument of any process it starts. This includes the model check that `deploy/production-like-test/init/run-init.sh` injects. Secret request bodies SHALL reach `curl` on stdin. The `Authorization` header SHALL reach `curl` from a file that is mode `0600`, inside a directory that is mode `0700`. That directory SHALL be removed when the initializer succeeds, fails, or is stopped by `INT`, `TERM` or `HUP`.

#### Scenario: First boot with distinctive secrets

- **WHEN** the wrapper runs the initializer against an empty Open WebUI with distinctive `ADMIN_PASSWORD` and `MCP_API_KEY` values, and `PRIMARY_CHAT_MODEL` set
- **THEN** signup, tool-valve seeding and every authenticated call succeed
- **AND** no recorded `curl` argument contains the password, the MCP key or the admin token

#### Scenario: Existing admin

- **WHEN** an admin already exists, so signin succeeds
- **THEN** no recorded `curl` argument contains the password or the token

#### Scenario: Stopped during a request

- **WHEN** the wrapper, or an initializer run by hand, receives `TERM`, `HUP` or `INT` while a request after signin is held
- **THEN** the initializer exits non-zero, no marker is written, and no `ocu-init-auth.*` directory remains
- **AND** an initializer run by hand exits 143, 129 or 130 respectively

#### Scenario: Secret with JSON metacharacters

- **WHEN** `ADMIN_PASSWORD` contains `"` and `\`
- **THEN** the signup body the API receives decodes to that exact password
