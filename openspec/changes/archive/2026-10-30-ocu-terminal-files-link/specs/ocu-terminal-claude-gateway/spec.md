## ADDED Requirements

### Requirement: A terminal start leaves a files link in the sandbox home

Every terminal start request that reaches a running sandbox, in gateway and non-gateway mode, and whether it reuses or starts a terminal, SHALL ensure `/home/assistant/files` is a symlink to `/mnt/user-data/files` when nothing exists at that path. It SHALL NOT replace or modify an existing file, directory or symlink there, dangling symlinks included, and the link's creation or failure SHALL NOT change the start's answer. The terminal SHALL still start in `/home/assistant`.

#### Scenario: Opening the terminal

- **GIVEN** nothing exists at `/home/assistant/files` in the chat's sandbox
- **WHEN** the chat owner opens the terminal, whether it is reused or started
- **THEN** `/home/assistant/files` is a symlink to `/mnt/user-data/files`, the terminal starts in `/home/assistant`, and an existing entry at that path would have been left unchanged

## MODIFIED Requirements

### Requirement: Terminal Claude Code uses the opener's token and the chat model

When gateway mode is configured (`OCU_SANDBOX_MESSAGES_ADDRESS` set for Computer Use), starting a workspace terminal SHALL give ttyd and every process under it `ANTHROPIC_BASE_URL` pointing at the Messages ingress, `ANTHROPIC_AUTH_TOKEN` equal to the WebUI login token from the starting request's `token` cookie, and the model variables equal to the model supplied by the chat at terminal open. The token SHALL be passed only through the exec environment, never in a command string, URL, response, or log. A running terminal SHALL be reused only when it was started with the same base URL, model and token. Otherwise any running terminal process and terminal multiplexer SHALL be stopped and a fresh one started, and concurrent starts for one chat SHALL NOT interleave. Gateway mode SHALL apply only when the sandbox coding CLI is Claude Code. With gateway mode not configured, terminal start SHALL behave as before apart from the files link, and ignore any supplied model.

#### Scenario: First open binds token and model

- **GIVEN** gateway mode is configured and no terminal runs in the chat's sandbox
- **WHEN** the chat owner opens the terminal in a chat whose model is `m-1`
- **THEN** ttyd starts with the ingress base URL, the owner's token and `m-1` in its environment, and the token does not appear in the exec command string or the response

#### Scenario: Unchanged reopen reuses the terminal

- **WHEN** the same owner reopens the terminal with the same model and token
- **THEN** the running terminal is reused and nothing is stopped

#### Scenario: Changed model or token restarts the terminal

- **WHEN** the terminal is opened with a different model or token than the running terminal was started with, or the running terminal predates this behaviour
- **THEN** the running terminal is stopped and a new one starts with the new values

#### Scenario: Missing token or model fails visibly

- **WHEN** gateway mode is configured and the start request carries no token cookie, or no valid model
- **THEN** the start answers 422 with a string detail naming what is missing, before any container lookup, nothing runs in the sandbox, and the terminal pane shows the message instead of a terminal

#### Scenario: Gateway mode off

- **WHEN** `OCU_SANDBOX_MESSAGES_ADDRESS` is not set for Computer Use
- **THEN** terminal start runs the existing commands, its first check prefixed only by the files-link snippet, without an added environment, and ignores the model and cookie
