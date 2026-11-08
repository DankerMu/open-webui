## 1. Async Computer Use filter

- [x] 1.1 Write the tests first, in `tests/test_filter.py`, reusing `_live_asgi`, `_prompt_app`, `_make_filter`, `_system_content` and `CHAT_ID`.
      Task 1.1 required evidence (issue #777; each item is input → expected output):
  - **Same-loop callback, inlet.**
    - Setup:
      - The test calls `_disable_proxy_env(monkeypatch)`; the filter's opener and the stub's `urllib` both read `HTTP_PROXY`.
      - The test runs one asyncio loop (`asyncio.run`).
      - On that loop it starts a minimal HTTP endpoint with `asyncio.start_server` on `127.0.0.1:0` that answers `200 ok`. It stands in for the WebUI registry served by the same loop.
      - A `/system-prompt` stub served by `_live_asgi` in its own thread does a synchronous `urllib` GET to that endpoint with a 3 s timeout during the request. It answers `PROMPT` with `X-Public-Base-URL` only when the callback was answered before that deadline, and `503` otherwise.
    - Action: `await _make_filter(<stub url>).inlet(<saved-chat body>, __metadata__={"chat_id": CHAT_ID})`, timed with `time.perf_counter` around this one call only, after both servers are up.
    - Expected (the deciding assertions): `_system_content(body) == "PROMPT"` and the call takes under 2 s.
    - Red, twice, both outputs pasted in the PR:
      - on OCU `main` `d81be4e`, where `inlet` is synchronous;
      - on a mutant of the fix that replaces `await asyncio.to_thread(self._request_prompt, req)` with a direct `self._request_prompt(req)` call. `inlet` is then a coroutine that still blocks the loop, and the test must fail on the prompt content and the elapsed time, not on a `TypeError`.
  - **Same-loop callback, outlet.** The same setup and the same two reds, with an empty `_prompt_cache` so `outlet` must fetch. An assistant message linking `{public}/files/{CHAT_ID}/report.pdf` gets its preview link, and the call takes under 2 s.
  - **Concurrency (smoke).**
    - With `_PROMPT_CACHE_MAX_SIZE` patched to 5, `asyncio.gather` of 20 `inlet` calls for 20 distinct saved chat ids against one stub raises no exception.
    - Every body gets `PROMPT`.
    - `len(f._prompt_cache) <= 5`.
  - **Cache generation guard.**
    - Every variant patches `urllib.request.OpenerDirector.open` with `held`, which runs in the worker thread: it sets `received`, waits on `release` for up to 5 s, then returns `_urlopen_mock(...)` or raises, per variant. Nothing blocks the uvicorn loop.
    - The order is fixed:
      1. `task = asyncio.create_task(f._fetch_system_prompt(CHAT_ID, ""))`;
      2. `await asyncio.to_thread(received.wait, 5)`;
      3. on the loop, the variant's clear (below);
      4. `release.set()`;
      5. `result = await task`.
    - Variants. The clear in step 3 is an authority switch (`monkeypatch.setenv("OCU_INTERNAL_TOKEN", <new>)` then `f._configured_authority()`) unless stated:

      | Variant                   | Clear and set-up in step 3                                                                                                                                                                                        | `held` then                               | Expected                                                                                                           |
      | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
      | Success                   | authority switch                                                                                                                                                                                                  | returns `PROMPT` with `X-Public-Base-URL` | `result == (PUB, "PROMPT")`; `(CHAT_ID, "", "") not in f._prompt_cache`; `f._cache_authority` is the new authority |
      | Late rejection            | authority switch, then `_prime_cache(f, OTHER_CHAT)`                                                                                                                                                              | raises `HTTPError(..., 401, ...)`         | `result is None`; the `OTHER_CHAT` entry is still cached                                                           |
      | Transport error           | before step 1, `f._prompt_cache` is seeded directly with an entry for `(CHAT_ID, "", "")` whose `fetched_at` is older than `time.time() - _PROMPT_TTL_SECONDS`, so the call does fetch; then the authority switch | raises `urllib.error.URLError("down")`    | `result is None`, not the old entry                                                                                |
      | Same-authority clear      | the token is set to `""`, `f._configured_authority()` runs (it clears the cache), the original token is restored and `f._configured_authority()` runs again, so the authority ends equal to the captured one      | returns `PROMPT` with `X-Public-Base-URL` | `result == (PUB, "PROMPT")`; `(CHAT_ID, "", "") not in f._prompt_cache`                                            |
      | Concurrent 401            | `await f._fetch_system_prompt(OTHER_CHAT, "")`; `held` dispatches on `OTHER_CHAT` in `req.full_url` and, for it, raises `HTTPError(..., 401, ...)` at once without waiting                                        | returns `PROMPT` with `X-Public-Base-URL` | the `OTHER_CHAT` call returns `None`; `result == (PUB, "PROMPT")`; `(CHAT_ID, "", "") not in f._prompt_cache`      |
      | Concurrent missing header | as Concurrent 401, but for `OTHER_CHAT` `held` returns at once a 200 response without `X-Public-Base-URL`                                                                                                         | returns `PROMPT` with `X-Public-Base-URL` | the `OTHER_CHAT` call returns `None`; `result == (PUB, "PROMPT")`; `(CHAT_ID, "", "") not in f._prompt_cache`      |

    - On `main` every variant fails already at `create_task`, which needs a coroutine. The deciding red is a mutant of the fix that compares authorities instead of generations: it must fail the same-authority clear, and the PR pastes that output.

  - **Cache is loop-thread only.**
    - `f._prompt_cache` is replaced by an `OrderedDict` subclass. It records `threading.get_ident()` in `get`, `__getitem__`, `__setitem__`, `__contains__`, `move_to_end`, `popitem`, `clear`, `items` and `__len__`.
    - A `__setattr__` hook on a `Filter` subclass records the thread of every write to `_cache_authority` and `_cache_generation`.
    - The test drives `inlet` and `outlet` through a cache hit, a cache miss, a 401 and a transport error.
    - Expected: every recorded thread id equals the loop thread's id, and at least one cache operation was recorded on each path.
  - **Cancellation.** With a cached entry for another chat and the generation recorded, the order is fixed:
    1. `task = asyncio.create_task(f.inlet(<saved-chat body>, __metadata__={"chat_id": CHAT_ID}))`;
    2. `await asyncio.to_thread(received.wait, 5)`;
    3. `task.cancel()`, then `await task` inside `pytest.raises(asyncio.CancelledError)`;
    4. `release.set()`; `held` returns `PROMPT` with `X-Public-Base-URL` and sets a `finished` event in its `finally`;
    5. `await asyncio.to_thread(finished.wait, 5)`, then `await asyncio.sleep(0)`.
    - Expected: `f._prompt_cache` and `f._cache_generation` equal their values from before step 1.
  - **Mechanical conversion.**
    - Every existing direct call of `inlet`, `outlet` and `_fetch_system_prompt` in `tests/test_filter.py`, including the `_run_inlet` helper, goes through `asyncio.run`, the pattern `tests/orchestrator/` already uses. pytest-asyncio is not used: the OCU unit command installs only pytest.
    - No assertion is removed or weakened. The PR states the count of converted call sites, and the diff of existing test bodies changes only those call sites.
    - `tests/test_org_prompt_filter.py:58` replaces `_fetch_system_prompt` with an `async` stand-in, and its calls of the Computer Use filter's `inlet` are converted the same way. Its `org_prompt_filter.Filter().inlet` calls stay synchronous.
    - In the mixed loop at `tests/test_org_prompt_filter.py:204-205`, each result goes through `asyncio.run(r) if inspect.iscoroutine(r) else r`, so both orders still run both filters.
    - `tests/test_video_production_filter.py` calls only the synchronous video filter and stays unchanged.
  - **Must preserve.**
    - The existing cases still all pass: at `d81be4e`, `tests/test_filter.py` has 104 passed and 16 subtests passed, `tests/test_org_prompt_filter.py` 28 and `tests/test_video_production_filter.py` 5. The new tests add to these counts.
    - The full OCU unit command passes, and the PR states its counts before and after.

- [x] 1.2 Implement per design.md: `async def inlet`, `async def outlet`, `async def _fetch_system_prompt`, one synchronous request helper run through `asyncio.to_thread`, one private cache-clear method that advances `_cache_generation`, and the cache generation guard. Change nothing else in the request logic.
- [x] 1.3 Docs:
  - The module docstring FUNCTIONALITY block states that `inlet` and `outlet` are coroutines and the prompt fetch runs off the event loop.
  - The header `version` goes from 5.2.0 to 5.3.0.
  - `docs/openwebui-filter.md` "Prompt retrieval and cache" says the same.
  - `docs/openwebui-filter.md` also states the executor residual risk from design.md.
  - `CHANGELOG.md` gains an Unreleased `main` / Fixed entry.
- [x] 1.4 Run:
  - the three filter test files;
  - the OCU unit command from OCU `AGENTS.md`;
  - `uvx ruff@0.17.2 check` on the changed Python files, which must add no finding over `main`.
  - The PR changes only `openwebui/functions/computer_link_filter.py`, `tests/test_filter.py`, `tests/test_org_prompt_filter.py`, `docs/openwebui-filter.md` and `CHANGELOG.md`.

Risk packs:

- Concurrency / shared state / ordering — selected: concurrent coroutines and a thread hop around the cache; tests 1.1 Concurrency, Cache generation guard, Cache is loop-thread only and Cancellation.
- Resource limits (event-loop blocking) — selected: the defect itself; tests 1.1 Same-loop callback for inlet and outlet.
- Legacy compatibility — selected: the `ocu-filter-auth` behaviour; 1.1 Mechanical conversion and Must preserve.
- Error handling — selected: exceptions crossing `to_thread`; the existing 401/403/redirect/transport tests in their await form.
- Documentation — selected: 1.3.
- Public API / CLI, Config, Schema, Auth/secrets beyond the preserved behaviour, Release — not selected: no interface, config, schema or credential change. The Open WebUI handler contract already accepts coroutines.
