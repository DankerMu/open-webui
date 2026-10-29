# ocu-terminal-claude-gateway Specification

## Purpose

Start the workspace terminal's Claude Code against Open WebUI's Messages ingress with the opening user's own WebUI token and the chat's model, restart it when either changes, and keep the token out of process arguments and container metadata.

## Requirements

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

### Requirement: sub_agent Claude Code uses the caller's token and the chat model

When gateway mode is configured (`OCU_SANDBOX_MESSAGES_ADDRESS` set for Computer Use and the sandbox coding CLI is Claude Code), every `sub_agent` call SHALL run Claude Code with `ANTHROPIC_BASE_URL` pointing at the Messages ingress, `ANTHROPIC_AUTH_TOKEN` equal to the calling user's WebUI token forwarded by the WebUI tool for that call, and every model variable and the `--model` argument, on new and resumed sessions, equal to the chat's model forwarded for that call, used verbatim. The model chosen by the language model SHALL be ignored. The token SHALL reach Claude Code only through the exec environment of that call; Computer Use SHALL NOT write it to a command string, argument list, container environment, response, error text or log. A call missing the token or a valid model SHALL fail with an error naming what is missing before any sandbox work. The WebUI tool SHALL forward the token and the model only on `sub_agent` calls, SHALL take the model from the chat request, and SHALL forward the token only when the calling user owns the chat. With gateway mode not configured, `sub_agent` SHALL behave as before and ignore the forwarded values. The production-like deployment SHALL install the Computer Use tool with `sub_agent`.

#### Scenario: Call binds the caller's token and the chat model

- **GIVEN** gateway mode is configured
- **WHEN** a chat on model `m-1` calls `sub_agent` with the language model asking for `opus`
- **THEN** Claude Code runs with the ingress base URL, the caller's token and `m-1`, and the token does not appear in the command string, the container environment or any log line

#### Scenario: Next call follows a changed chat model

- **WHEN** the same chat switches to model `m-2` and calls `sub_agent` again, including when resuming the previous session
- **THEN** that call runs Claude Code with `m-2` and the token forwarded with that call

#### Scenario: Missing token or model fails visibly

- **WHEN** gateway mode is configured and the call carries no token, or no valid model
- **THEN** `sub_agent` returns an error naming what is missing, and no container is touched and no Claude Code process starts

#### Scenario: Caller who does not own the chat

- **WHEN** an admin's completion in another user's chat calls `sub_agent`
- **THEN** the WebUI tool forwards no token, and `sub_agent` returns the missing-token error

#### Scenario: Gateway mode off

- **WHEN** gateway mode is not configured
- **THEN** `sub_agent` uses the requested model with its aliases as before and passes no per-call Claude Code environment

#### Scenario: A model the user may not access is refused

- **WHEN** Claude Code asks the Messages endpoint for a model the calling user may not access
- **THEN** Open WebUI refuses it before any upstream call, with the same status a chat request for that model gets when the connection is OpenAI-compatible, and 403 on the Anthropic passthrough

#### Scenario: Deployment offers sub_agent

- **WHEN** the production-like deployment installs the Computer Use tool
- **THEN** the installed tool is the shipped tool including `sub_agent`

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

### Requirement: A resumed sub-agent receives the caller's task

When `sub_agent` resumes a Claude Code session, the prompt SHALL begin with fixed text, followed by the caller's `task` and a pointer to the plan file, so caller text never begins the prompt. An empty or whitespace-only `task` SHALL resume with the fixed continue prompt. The plan file SHALL keep the original task.

#### Scenario: Follow-up instructions on resume

- **WHEN** a model calls `sub_agent` with `resume_session_id` and a follow-up task on the Claude Code runtime, including a task that starts with `-`
- **THEN** Claude Code is resumed with a prompt that starts with fixed text and contains that task, and the plan file still holds the original task

### Requirement: Terminal reuse requires a listening ttyd and stopping escalates

In gateway mode, a terminal start SHALL report an existing terminal as already running only when a ttyd carrying this request's fingerprint is accepting connections on the terminal port. Stopping the terminal SHALL escalate from SIGTERM to SIGKILL for ttyd processes that do not exit within the bound, and every stated wait bound SHALL be a minimum.

#### Scenario: A fingerprinted ttyd that does not listen

- **WHEN** a ttyd with this request's fingerprint is running but not accepting connections, including one that ignores SIGTERM
- **THEN** the start does not report it as already running, the stop removes it, and a later start with the same settings does not report it as already running
