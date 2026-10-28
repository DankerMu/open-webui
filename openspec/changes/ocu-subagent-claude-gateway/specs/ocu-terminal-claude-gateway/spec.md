## ADDED Requirements

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
