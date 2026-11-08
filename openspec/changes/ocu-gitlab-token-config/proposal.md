## Why

OCU's GitLab token fetch and the WebUI skill registry read the same pair of variables, `MCP_TOKENS_URL` and `MCP_TOKENS_API_KEY`:

- `docker_manager.py:437-438` reads them at import for the GitLab fetch.
- `_ensure_gitlab_token` (`:658-679`) and `_server_gitlab_token` (`:681-689`) request `{MCP_TOKENS_URL}/api/internal/tokens/{email}/gitlab`. The request carries `X-Internal-Api-Key`, has a 5 s timeout and no negative cache.

DankerMu/open-computer-use#224 (#753) points that URL at the WebUI skill registry, which has no `tokens` route. As a result, on every call of the five MCP tools (`mcp_tools.py:512,589,662,735,1086`) and on the server-credential rebuild in `_create_container` (`:1186`, inside the per-chat lifecycle lock), OCU sends a request that always fails. WebUI answers it with the SPA's 200 HTML. OCU logs a line that contains the user's email, and waits up to 5 s when WebUI is slow.

The same fetch also sends `MCP_TOKENS_API_KEY`, which on the overlay is `OCU_INTERNAL_TOKEN`, to a URL that a request header (`X-Mcp-Tokens-Url`) can choose. That header is set without an `X-Mcp-Tokens-Api-Key` (`:673-674`).

Issue #776.

## What Changes

- The GitLab fetch gets its own pair of variables, `GITLAB_TOKENS_URL` and `GITLAB_TOKENS_API_KEY`, read at import in `docker_manager.py`. When either is empty, neither fetch path sends a request. The fetch no longer reads `MCP_TOKENS_URL` or `MCP_TOKENS_API_KEY`.
- The per-request headers `X-Mcp-Tokens-Url` and `X-Mcp-Tokens-Api-Key` stay as an override, but only as a pair:
  - when the URL header is set, the fetch uses the header URL with the header key, and sends nothing when the header key is empty;
  - an environment key is never sent to a URL that came from a header.
- `docker_manager.MCP_TOKENS_URL` and `docker_manager.MCP_TOKENS_API_KEY` are removed, together with their re-import in `mcp_tools.py:176`. The skill registry (`skill_manager.py`) and `/api/skill-stats` (`app.py:1699`) read their own copies and are unchanged.
- Docs:
  - `computer-use-server/README.md` environment table, root `README.md` env rows and PAT paragraph, `.env.example`;
  - the `mcp_tools.py` header/env table;
  - `NETWORK-HARDENING.md`, the GitLab sentence in the #753 entry;
  - a `CHANGELOG.md` entry with the upgrade note.

## Triage

```text
Issue type: bugfix
Fixture level: standard
Upstream suggested level: none stated (issue says p2, size S)
Blast radius: every MCP tool call and every server-credential sandbox rebuild; a credential that leaves the server
Selected risk packs: Auth / secrets; Config; Legacy compatibility; Documentation
Evidence floor: stub-server tests red on OCU main b9d4118 and green after; existing GitLab lifecycle tests pass with the new names; targeted OCU unit modules pass
```

Repository: `DankerMu/open-computer-use`. As for every `[ocu]` issue, this fixture lives in the WebUI control plane. Precedent: `ocu-skill-zip-safety` (#740, OCU PR #222).

## Impact

- `computer-use-server/docker_manager.py`, `computer-use-server/mcp_tools.py` (import line and docstring table), `computer-use-server/README.md`, `README.md`, `.env.example`, `deploy/production-like-test/NETWORK-HARDENING.md`, `CHANGELOG.md`.
- Tests: `tests/orchestrator/test_gitlab_token_config.py` (new), and `tests/orchestrator/test_lifecycle.py:528-560` and `:2370-2400`, which switch to the new names.
- Deployments that used `MCP_TOKENS_URL` for an external MCP Tokens Wrapper must set `GITLAB_TOKENS_URL` and `GITLAB_TOKENS_API_KEY` to keep GitLab tokens. This fork's overlay sets neither, so GitLab fetching is off there, and that was the state before #753.
