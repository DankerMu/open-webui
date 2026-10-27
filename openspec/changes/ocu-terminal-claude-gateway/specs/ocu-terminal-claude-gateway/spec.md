## ADDED Requirements

### Requirement: Terminal Claude Code uses the opener's token and the chat model

When gateway mode is configured (`OCU_SANDBOX_MESSAGES_ADDRESS` set for Computer Use), starting a workspace terminal SHALL give ttyd and every process under it `ANTHROPIC_BASE_URL` pointing at the Messages ingress, `ANTHROPIC_AUTH_TOKEN` equal to the WebUI login token from the starting request's `token` cookie, and the model variables equal to the model supplied by the chat at terminal open. The token SHALL be passed only through the exec environment, never in a command string, URL, response, or log. A running terminal SHALL be reused only when it was started with the same base URL, model and token. Otherwise any running terminal process and terminal multiplexer SHALL be stopped and a fresh one started, and concurrent starts for one chat SHALL NOT interleave. Gateway mode SHALL apply only when the sandbox coding CLI is Claude Code. With gateway mode not configured, terminal start SHALL behave as before and ignore any supplied model.

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
- **THEN** terminal start runs exactly the existing command without an added environment and ignores the model and cookie

### Requirement: The chat model reaches the terminal at open time

Open WebUI SHALL pass the displayed chat's current model id to the framed terminal view as an encoded `model` query parameter, captured when the terminal view opens and after that chat's models have loaded, and SHALL NOT pass it to other views or when the chat has no model. A model change while the terminal view stays open SHALL NOT reload the terminal; reopening the terminal view SHALL use the current model.

#### Scenario: Terminal URL carries the model

- **WHEN** the workspace shows the terminal view in a chat whose model is `deepseek-flash-guan`
- **THEN** the framed URL is the terminal embed URL with `model=deepseek-flash-guan`, and the browser view URL carries no model

#### Scenario: Switching chats with the terminal open

- **WHEN** the user navigates from a chat on model A to a chat on model B whose saved workspace view is the terminal
- **THEN** the terminal URL carries model B

#### Scenario: Model switch while the terminal is open

- **WHEN** the chat's model changes while the terminal view stays open
- **THEN** the terminal frame is not reloaded, and the next time the terminal view is opened its URL carries the new model
