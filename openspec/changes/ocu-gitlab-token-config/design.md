## Context

OCU `main` @ `b9d4118` (DankerMu/open-computer-use). Facts:

- `computer-use-server/docker_manager.py:437-438` reads `MCP_TOKENS_URL` and `MCP_TOKENS_API_KEY` at import, and only the GitLab fetch uses them:
  - `_fetch_gitlab_token` (`:617-656`) sends `GET {url}/api/internal/tokens/{email}/gitlab` with `X-Internal-Api-Key`, under `ClientTimeout(total=5)`;
  - `_ensure_gitlab_token` (`:658-679`) runs for the five MCP tools and picks `current_mcp_tokens_url.get() or MCP_TOKENS_URL` and `current_mcp_tokens_api_key.get() or MCP_TOKENS_API_KEY` independently (`:673-674`);
  - `_server_gitlab_token` (`:681-689`) runs from `_create_container` when `credential_source == "server"` (`:1186`), and uses only the module values.
- The skill registry reads its own `MCP_TOKENS_URL` (`skill_manager.py:34`), and `/api/skill-stats` reads `MCP_TOKENS_API_KEY` through `os.getenv` (`app.py:1699`). Neither changes.
- `mcp_tools.py:176` re-imports `MCP_TOKENS_URL` and `MCP_TOKENS_API_KEY` from `docker_manager` and uses neither.
- `context_vars.current_mcp_tokens_url` and `current_mcp_tokens_api_key` are set from headers (`mcp_tools.py:1472-1480`) and reset per request (`:1505-1506`). Only `_ensure_gitlab_token` reads them.
- The repository's settings wrapper has no `/api/internal/tokens/...` route. The GitLab fetch targets an external MCP Tokens Wrapper that this fork does not deploy.

## Goals / Non-Goals

**Goals:**

- No GitLab-token request unless a GitLab-specific URL and key are configured. This covers the issue's acceptance items 1 and 2.
- Configured behaviour is unchanged: 200 JSON gives the token, 404 gives none. This covers acceptance item 3.
- An environment key never goes to a header-chosen URL.
- Each variable's purpose is documented. This covers acceptance item 4.

**Non-Goals:**

- The skill registry, `/api/skill-stats`, the #753 deploy wiring, and the proxy.
- A WebUI route for GitLab tokens.
- A negative cache. The issue rejects it as the main fix.
- Renaming the request headers.
- Changing the overlay's compose files: GitLab fetching stays off there.

## Decisions

1. **Two new variables, read at import next to the removed ones:** `GITLAB_TOKENS_URL = os.getenv("GITLAB_TOKENS_URL", "")` and `GITLAB_TOKENS_API_KEY = os.getenv("GITLAB_TOKENS_API_KEY", "")`. A new pair keeps the two purposes apart in config, and is what the issue recommends.
   - Alternative rejected: a boolean `GITLAB_TOKEN_FETCH=1` that keeps reading `MCP_TOKENS_URL`. It would still send the registry key (`OCU_INTERNAL_TOKEN`) to the GitLab path.
2. **The URL and key are chosen as a pair:**
   - `_ensure_gitlab_token` uses `(header URL, header key)` when the URL header is set;
   - otherwise it uses `(GITLAB_TOKENS_URL, GITLAB_TOKENS_API_KEY)`;
   - it fetches only when the email and both values of the chosen pair are non-empty.
   - `_server_gitlab_token` uses only the environment pair, as it does today with the old names.
   - Upstream behaviour mixed a header URL with an environment key. Dropping that is the security fix, and it is a behaviour change for clients that send only the URL header. The CHANGELOG states it.
3. **Remove `docker_manager.MCP_TOKENS_URL` and `MCP_TOKENS_API_KEY`, and their unused re-import in `mcp_tools.py:176`:**
   - no alias and no fallback, so the old names cannot silently re-enable the fetch;
   - `git grep` shows no other reader. The tests that patch them switch to the new names.
4. **No change to `_fetch_gitlab_token`:** its timeout, log lines and status handling stay. Acceptance item 2 is met by not calling it, not by shortening its timeout.

## Risks / Trade-offs

- A deployment that used `MCP_TOKENS_URL` for a real MCP Tokens Wrapper loses GitLab tokens until it sets the new pair. This is stated in the CHANGELOG upgrade note and the README, and it does not affect this fork's overlay.
- Clients that send `X-Mcp-Tokens-Url` without `X-Mcp-Tokens-Api-Key` get no GitLab token. This is intended (Decision 2).

## Sketch seams under test

- `docker_manager._ensure_gitlab_token()` with context vars and module attributes set by the test, against a loopback `aiohttp.web` stub that records requests.
- `docker_manager._server_gitlab_token(email)` called from a worker thread (no running loop), as `_create_container` calls it, against the same stub.
- Module attributes are patched with `monkeypatch.setattr(docker_manager, name, value, raising=False)`, so the same test runs on `b9d4118`, where the `GITLAB_*` attributes do not exist yet.

## Not yet specified

Nothing. The variable names are fixed by Decision 1.
