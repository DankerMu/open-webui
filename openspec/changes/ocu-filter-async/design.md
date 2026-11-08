## Design

Change surface: OCU `openwebui/functions/computer_link_filter.py`: `Filter.inlet`, `Filter.outlet`, `Filter._fetch_system_prompt`, and one new private synchronous helper for the HTTP exchange. Tests: `tests/test_filter.py` and `tests/test_org_prompt_filter.py` (it replaces `_fetch_system_prompt` with a synchronous lambda at `:58`).

Must preserve (the `ocu-filter-auth` spec; every existing test in its await form):

- **Credentials and URLs:**
  - Bearer credential from the process environment.
  - `user_email` comes only from `__user__`.
  - Redirects are rejected by `_NoRedirectHandler`.
  - 401/403/3xx and a missing `X-Public-Base-URL` clear the cache and inject nothing.
  - Transport errors fall back to a stale same-authority entry.
- **Cache behaviour:**
  - TTL and LRU size come from the module-level `_PROMPT_TTL_SECONDS` and `_PROMPT_CACHE_MAX_SIZE`, which tests patch.
  - The cache is cleared when the token or `ORCHESTRATOR_URL` changes.
  - The outlet uses any cached entry of the chat.
- **Other inlet and outlet behaviour:**
  - Tool attachment and every early return.
  - The system-message branches.
  - The #752 marker rewrite.
  - Preview and archive decoration.
- **Plumbing:**
  - No new dependency.
  - The `urllib` opener stays.
  - Open WebUI's `required_open_webui_version` is unchanged, because coroutine handlers are already awaited.

Must add/change:

- `async def inlet` and `async def outlet`. Their bodies are unchanged except that they `await self._fetch_system_prompt(...)`.
- `async def _fetch_system_prompt(...)`:
  - authority check, cache lookup and TTL check run on the loop as today;
  - then `await asyncio.to_thread(self._request_prompt, req)`, a synchronous helper that only opens the request, reads the body and returns the decoded prompt and the `X-Public-Base-URL` header value. An `HTTPError`, `URLError`, `TimeoutError` or `UnicodeDecodeError` propagates out of the thread exactly as today;
  - all cache mutations happen after the await, on the loop thread.
- **Cache generation guard:**
  - `Filter` gains `self._cache_generation`, an integer that grows by one at every clear of `_prompt_cache`: an authority switch, an unavailable token or bad orchestrator URL, a 401/403/3xx, and a missing `X-Public-Base-URL`. All these clears go through one private method.
  - `_fetch_system_prompt` captures the generation before the await. After the await, every cache effect requires the generation to be unchanged:
    - a successful entry is stored only then; otherwise it is returned, not cached;
    - the clearing on 401/403/3xx or a missing `X-Public-Base-URL` happens only then, so a late rejection cannot wipe entries stored after a newer clear;
    - the transport-error fallback returns the stale entry captured before the await only then; otherwise it returns `None`.
  - This covers both an authority change during the fetch and a same-authority clear by another request (for example a concurrent 401). On `main` neither ordering was possible, because the blocked loop serialized every fetch.
- The `except` structure and the printed messages stay the same.

Governing invariant: no `Filter` coroutine blocks the event loop on network I/O; `_prompt_cache`, `_cache_authority` and `_cache_generation` are read and written only on the event-loop thread; and no result fetched before a cache clear outlives that clear.

Cancellation: every cache effect sits after the await, so a cancelled `inlet` leaves the cache untouched. The worker thread runs to its 10 s timeout and its result is dropped.

Sibling surfaces:

- **Open WebUI side:** `run_filter_handler` (`utils/filter.py:159-162`) is the only caller of `inlet`, `outlet` and `stream`. It awaits coroutine functions. The filter defines no `stream`.
- **The other OCU filters:** `video_production_filter.py` and `org_prompt_filter.py` stay synchronous. They do no network I/O.
- **The OCU tool:** `openwebui/tools/computer_use_tools.py` already uses an async client and is unchanged.
- **The callback target:** OCU `/system-prompt` calls the WebUI registry (#753). That callback can only be served once the loop is free, which is the point of this change.

Seams under test: `await Filter().inlet(...)` and `await Filter().outlet(...)` on a real asyncio loop, against a real HTTP `/system-prompt` (the existing `_live_asgi` uvicorn helper) and a real loopback callback endpoint served by the test's own loop.

Required evidence: see tasks.md 1.1.

Non-goals:

- WebUI `utils/filter.py`; option (b) was rejected by the user.
- `computer-use-server/`.
- An async HTTP client library.
- Single-flight deduplication of concurrent misses for the same key. Before this change those fetches were serialized by the blocked loop; now each may fetch.
- Changes to the other filters.
- `http.client` exceptions that are not `URLError` (`RemoteDisconnected`, `IncompleteRead`) already escape `_fetch_system_prompt` on `main`; the `except` structure stays as it is.

Residual risk: the default executor has `min(32, cpu + 4)` workers, and each cache miss holds one for up to 10 s. A burst of slow misses can queue behind each other, but it no longer stalls the loop. `docs/openwebui-filter.md` states this.

Review focus:

- Nothing touches the cache off the loop thread.
- The stale-authority guard.
- The red test really blocks on the old code, rather than passing by timing luck.
- The mechanical test conversion weakens no assertion.
