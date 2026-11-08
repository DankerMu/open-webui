## ADDED Requirements

### Requirement: GitLab token fetch has its own configuration

OCU SHALL fetch a GitLab token only from a URL and key configured for that purpose: the request-header pair `X-Mcp-Tokens-Url` and `X-Mcp-Tokens-Api-Key`, or, when no URL header is set, the environment pair `GITLAB_TOKENS_URL` and `GITLAB_TOKENS_API_KEY`. It SHALL NOT use `MCP_TOKENS_URL` or `MCP_TOKENS_API_KEY` for this fetch, SHALL NOT send any request when the selected URL or key is empty, and SHALL NOT send an environment key to a URL taken from a request header.

#### Scenario: Skill registry configured, GitLab fetch not configured

- **WHEN** `MCP_TOKENS_URL` and `MCP_TOKENS_API_KEY` point at a stub, `GITLAB_TOKENS_URL` and `GITLAB_TOKENS_API_KEY` are empty, and a tool call or a server-credential rebuild runs for a user with an email
- **THEN** the stub receives no request and no GitLab token is set

#### Scenario: Hanging token service does not delay a call

- **WHEN** the stub at `MCP_TOKENS_URL` holds every request open for longer than 5 s and the GitLab variables are empty
- **THEN** `_ensure_gitlab_token` and `_server_gitlab_token` return within one second

#### Scenario: Configured GitLab token service

- **WHEN** `GITLAB_TOKENS_URL` and `GITLAB_TOKENS_API_KEY` are set and the service answers `GET /api/internal/tokens/{email}/gitlab` with 200 `{"token": "t"}`
- **THEN** the request carries `X-Internal-Api-Key` equal to `GITLAB_TOKENS_API_KEY`, the tool path sets the GitLab token to `t`, and `_server_gitlab_token` returns `t`; a 404 answer gives no token

#### Scenario: Header URL without a header key

- **WHEN** a request sets `X-Mcp-Tokens-Url` to a stub and no `X-Mcp-Tokens-Api-Key`, while `GITLAB_TOKENS_API_KEY` is set
- **THEN** the stub receives no request
