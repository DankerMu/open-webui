## 1. Separate GitLab token fetch configuration

- [ ] 1.1 Write `tests/orchestrator/test_gitlab_token_config.py` with cases (a)-(f) below. Run it on OCU `main` @ `b9d4118` before any source change: (a)-(e) fail, because the old code reads only `MCP_TOKENS_*` and mixes a header URL with an env key; (f) passes before and after.
- [ ] 1.2 In `computer-use-server/docker_manager.py`, replace `MCP_TOKENS_URL`/`MCP_TOKENS_API_KEY` (`:437-438`) with `GITLAB_TOKENS_URL`/`GITLAB_TOKENS_API_KEY`. Pair the selection in `_ensure_gitlab_token` (design Decision 2), and switch `_server_gitlab_token` to the new pair. Drop the two names from the `mcp_tools.py:176` import. Switch `tests/orchestrator/test_lifecycle.py:532-533` and `:2381-2382` to the new names.
- [ ] 1.3 Docs:
  - `computer-use-server/README.md:606-607`: `MCP_TOKENS_URL`/`MCP_TOKENS_API_KEY` describe the skill registry and `/api/skill-stats`, and two new rows describe `GITLAB_TOKENS_URL`/`GITLAB_TOKENS_API_KEY`.
  - `mcp_tools.py:35-43`: the header table names the new env fallback and states the pairing rule.
  - `deploy/production-like-test/NETWORK-HARDENING.md`: the sentence "The GitLab-token fetch checks the URL and is skipped" becomes "The GitLab-token fetch reads only `GITLAB_TOKENS_URL`/`GITLAB_TOKENS_API_KEY`, which this overlay does not set, so it sends no request".
  - `CHANGELOG.md` Unreleased: a Fixed entry with the upgrade note (design Risks).
- [ ] 1.4 Run the verification commands below and record before/after counts in the PR.

Required evidence (each item is input → expected output):

- Test cases. Each uses a loopback `aiohttp.web` stub that records the method, path and `X-Internal-Api-Key` of every request, and a user email set in `current_user_email`:
  - (a) Registry configured, GitLab pair empty: `MCP_TOKENS_URL`/`MCP_TOKENS_API_KEY` attributes point at the stub, and `GITLAB_TOKENS_*` are `""`. `await _ensure_gitlab_token()` and `_server_gitlab_token(email)` (run through `asyncio.to_thread`) leave the stub with 0 requests, and `current_gitlab_token` stays `None`.
  - (b) Hanging stub: same configuration as (a), but the stub sleeps 7 s before answering. Both calls return in under 1 s, measured with `time.monotonic()`.
  - (c) GitLab pair configured (`MCP_TOKENS_*` left `""`), stub answers 200 `{"token": "t"}`:
    - `_ensure_gitlab_token` sets `current_gitlab_token` to `t`;
    - `_server_gitlab_token` returns `t`;
    - each stub request is `GET /api/internal/tokens/{email}/gitlab` with `X-Internal-Api-Key` equal to the configured key.
  - (d) GitLab pair configured, stub answers 404: the stub gets one request from each function, and neither gives a token.
  - (e) Header URL without a header key: `current_mcp_tokens_url` points at the stub, `current_mcp_tokens_api_key` is `""`, and `GITLAB_TOKENS_API_KEY` and `MCP_TOKENS_API_KEY` are both a synthetic key. The stub gets 0 requests.
  - (f) Header pair: `current_mcp_tokens_url` and `current_mcp_tokens_api_key` are both set, and the env pair points elsewhere. The stub gets one request, carrying the header key.
- Must preserve:
  - `tests/orchestrator/test_lifecycle.py` server-credential cases pass with the new names, unchanged otherwise;
  - `tests/orchestrator/test_mcp_tools.py` and `tests/test_service_key_compare.py` pass;
  - `skill_manager.py` and `app.py` are unchanged.
- Verification commands, run from the OCU checkout. Before means OCU `main` @ `b9d4118` with only the new test file added; after means the PR head.
  - `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/orchestrator/test_gitlab_token_config.py tests/orchestrator/test_lifecycle.py tests/orchestrator/test_mcp_tools.py tests/orchestrator/test_docker_manager.py tests/test_service_key_compare.py -q --import-mode=importlib`, before and after.
  - `git grep -n 'MCP_TOKENS_URL\|MCP_TOKENS_API_KEY' -- computer-use-server tests` after: hits only in `skill_manager.py`, `app.py`, the README and docstring rows, the new test (as the registry-side config) and `test_service_key_compare.py`.
  - `uvx ruff@0.17.2 check` on the changed Python files adds no finding over `b9d4118`.
  - The full OCU `tests/` suite is not required: it takes 48+ minutes on this machine. The targeted modules are every module that imports `docker_manager`'s GitLab names or patches `_ensure_gitlab_token`, and the PR lists them from `git grep`.
- File gate: the PR changes only `computer-use-server/docker_manager.py`, `computer-use-server/mcp_tools.py`, `computer-use-server/README.md`, `deploy/production-like-test/NETWORK-HARDENING.md`, `CHANGELOG.md`, `tests/orchestrator/test_gitlab_token_config.py` and `tests/orchestrator/test_lifecycle.py`.

Risk packs:

- Auth / secrets: selected. The fix keeps `OCU_INTERNAL_TOKEN` off the GitLab path and keeps environment keys off header-chosen URLs. Covered by cases (a), (e) and (f).
- Config: selected. It adds two variables and removes two module attributes. Covered by (a), (c) and the docs.
- Legacy compatibility: selected. Behaviour once configured is unchanged, and the header pair still overrides. Covered by (c), (d), (f) and the lifecycle tests.
- Documentation: selected. Covered by task 1.3.
- Not selected: Public API / CLI, Schema, Concurrency, File IO, Resource limits, Error handling, Release. The fetch body, its timeout and its error handling are unchanged.

Suggested fixture level: standard
Minimal mergeable slice: atomic
