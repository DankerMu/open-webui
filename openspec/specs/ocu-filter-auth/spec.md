# ocu-filter-auth Specification

## Purpose

Retrieve authorized OCU prompts without exposing service credentials and decorate chat output with concrete-file links under the deployed public cookie path.

## Requirements

### Requirement: Authenticated filter retrieval and cache

The filter SHALL fetch `/system-prompt` with the process-environment internal token as Authorization Bearer and derive user_email only from server-injected `__user__`. It SHALL NOT expose that token through Valves, results or logs, or forward it through redirects. Cache entries SHALL remain isolated by chat/user and be invalidated when credentials or internal origin change. Missing credentials, authorization rejection or missing public-base metadata SHALL NOT be satisfied from a cached prompt or internal-URL fallback.

#### Scenario: Guarded prompt fetch

- **WHEN** the filter fetches with the correct token and current server-injected identity
- **THEN** the real OCU guard accepts and the filter injects the returned prompt without changing its content or baseline insertion order

#### Scenario: Credential absent or rejected

- **WHEN** the internal credential is missing or the service returns 401/403, including after a previous successful fetch
- **THEN** no unauthorized or stale prompt is injected, no internal address becomes a browser link, and no secret appears in the failure output

#### Scenario: Redirect attempts to carry credential away

- **WHEN** `/system-prompt` responds with a redirect to another origin
- **THEN** the filter does not contact that origin with credentials and does not treat the redirect as a valid prompt

#### Scenario: Prompt cache changes authority

- **WHEN** ORCHESTRATOR_URL or the environment token changes between calls
- **THEN** cached prompt/public-base data from the previous authority are not reused

### Requirement: Reject trailing public base slash at startup

OCU SHALL reject a configured PUBLIC_BASE_URL ending in `/` with a non-zero startup exit before serving, including the packaged multi-worker entrypoint. It SHALL NOT silently strip that slash. A valid configured value without trailing slash SHALL be preserved in the prompt and X-Public-Base-URL response header. Deployment documentation SHALL identify the public value as the proxied `/ocu` base, separate from internal ORCHESTRATOR_URL.

#### Scenario: Invalid configured public base

- **WHEN** OCU starts with PUBLIC_BASE_URL set to `https://webui.example/ocu/`
- **THEN** startup exits non-zero naming PUBLIC_BASE_URL and no serving listener is established

#### Scenario: Valid configured public base

- **WHEN** OCU starts with PUBLIC_BASE_URL set to `https://webui.example/ocu`
- **THEN** an authenticated prompt request returns that base unchanged in its header and generated file links

### Requirement: Preview links address concrete files

For a current-chat concrete file URL under PUBLIC_BASE_URL, filter preview decoration SHALL point to that file's cookie URL, not a preview-shell or grant URL. It SHALL select the first matching file in message order, preserve its encoding/suffix, and append the preview label at most once. Archive decoration SHALL retain its separate toggle and current-chat cookie archive path. Non-file browser-tool results SHALL receive no preview/archive decoration. Foreign-base/chat links and non-assistant/non-string content SHALL remain unchanged.

#### Scenario: File preview and repeat decoration

- **WHEN** a message links `{PUBLIC_BASE_URL}/files/C/report.html` and the filter runs twice for chat C
- **THEN** it has one configured preview-label link to that concrete file, with no `/preview/C` or grant link, and archive behavior follows its configured toggle

#### Scenario: Browser output without a file

- **WHEN** a browser-tool result contains no current-chat concrete file link
- **THEN** the filter appends no preview or archive link

#### Scenario: Foreign or absent public base

- **WHEN** the message links another chat/base, or the server omitted X-Public-Base-URL
- **THEN** no internal-address or cross-chat preview decoration is invented
