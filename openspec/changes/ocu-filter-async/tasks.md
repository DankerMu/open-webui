## 1. Async Computer Use filter

- [ ] 1.1 Write the tests first, in `tests/test_filter.py`, reusing `_live_asgi`, `_prompt_app`, `_make_filter`, `_system_content` and `CHAT_ID`.
      Task 1.1 required evidence (issue #777; each item is input → expected output):
  - **Same-loop callback, inlet (red on OCU `main` `d81be4e`, green after).**
    - Setup:
      - The test runs one asyncio loop (`asyncio.run`).
      - On that loop it starts a minimal HTTP endpoint with `asyncio.start_server` on `127.0.0.1:0`. The endpoint answers `200 ok` and counts requests. It stands in for the WebUI registry served by the blocked loop.
      - A `/system-prompt` stub served by `_live_asgi` in its own thread does a synchronous `urllib` GET to that endpoint with a 3 s timeout during the request. It answers `PROMPT` with `X-Public-Base-URL` only when the callback succeeded, and `503` otherwise.
    - Action: `await _make_filter(<stub url>).inlet(<saved-chat body>, __metadata__={"chat_id": CHAT_ID})`.
    - Expected:
      - the callback counter is 1;
      - the system message content is `PROMPT`;
      - the call takes under 2 s, measured with `time.perf_counter`.
    - On `main`, the synchronous `inlet` blocks the loop, so the callback cannot be served. The stub times out, answers 503, and the test fails.
  - **Same-loop callback, outlet (red on `main`, green after).** The same setup, with an empty `_prompt_cache` so `outlet` must fetch. An assistant message linking `{public}/files/{CHAT_ID}/report.pdf` gets its preview link, and the callback counter is 1.
  - **Concurrency (green after; this is new behaviour, so its red form is the `await` call failing on `main`).**
    - With `_PROMPT_CACHE_MAX_SIZE` patched to 5, `asyncio.gather` of 20 `inlet` calls for 20 distinct saved chat ids against one stub raises no exception.
    - Every body gets `PROMPT`.
    - `len(f._prompt_cache) <= 5`.
  - **Stale-authority guard (green after).**
    - A stub holds the response until a `threading.Event` is set.
    - While one `inlet` is in flight, the test changes `OCU_INTERNAL_TOKEN` and runs `_configured_authority()`, which switches the authority.
    - Then it releases the stub.
    - Expected: the in-flight call returns its prompt, and `f._prompt_cache` holds no entry from the old authority.
    - Variant, rejection: the held stub answers 401 after the switch, while the cache holds an entry stored under the new authority. Expected: the call returns `None` and the new-authority entry is still cached.
    - Variant, transport error: the cache held a stale entry for the key before the call, and the held stub then drops the connection after the switch. Expected: the call returns `None`, not the old-authority entry.
  - **Cache is loop-thread only.** Every read and write of `_prompt_cache` and `_cache_authority` sits outside the function passed to `asyncio.to_thread`. A test proves it by wrapping `asyncio.to_thread` to record the function it is given, and asserting that function is the request helper. Review also checks it.
  - **Mechanical conversion.**
    - Every existing `tests/test_filter.py` case calls `inlet`, `outlet` and `_fetch_system_prompt` through `asyncio.run`, the pattern `tests/orchestrator/` already uses. pytest-asyncio is not used: the OCU unit command installs only pytest.
    - No assertion is removed or weakened. The PR states the count of converted call sites (68 in `tests/test_filter.py` at `d81be4e`), and the diff of existing test bodies changes only those call sites.
    - `tests/test_org_prompt_filter.py:58` replaces `_fetch_system_prompt` with an `async` stand-in, and its calls of the Computer Use filter's `inlet` are converted the same way. Its `org_prompt_filter.Filter().inlet` calls stay synchronous.
    - `tests/test_video_production_filter.py` calls only the synchronous video filter and stays unchanged.
  - **Must preserve.**
    - The existing cases still all pass: at `d81be4e`, `tests/test_filter.py` has 104 passed and 16 subtests passed, `tests/test_org_prompt_filter.py` 28 and `tests/test_video_production_filter.py` 5. The new tests add to these counts.
    - The full OCU unit command passes, and the PR states its counts before and after.
- [ ] 1.2 Implement per design.md: `async def inlet`, `async def outlet`, `async def _fetch_system_prompt`, one synchronous request helper run through `asyncio.to_thread`, and the stale-authority guard. Change nothing else in the request logic.
- [ ] 1.3 Docs:
  - The module docstring FUNCTIONALITY block states that `inlet` and `outlet` are coroutines and the prompt fetch runs off the event loop.
  - The header `version` goes from 5.2.0 to 5.3.0.
  - `docs/openwebui-filter.md` "Prompt retrieval and cache" says the same.
  - `CHANGELOG.md` gains an Unreleased `main` / Fixed entry.
  - If WebUI #769 has merged by then, also correct the `_SKILL_MARKER_RE` comment that says native mention stripping uses `[^>]*`.
- [ ] 1.4 Run:
  - the three filter test files;
  - the OCU unit command from OCU `AGENTS.md`;
  - `uvx ruff@0.17.2 check` on the changed Python files, which must add no finding over `main`.
  - The PR changes only `openwebui/functions/computer_link_filter.py`, `tests/test_filter.py`, `tests/test_org_prompt_filter.py`, `docs/openwebui-filter.md` and `CHANGELOG.md`.

Risk packs:

- Concurrency / shared state / ordering — selected: concurrent coroutines and a thread hop around the cache; tests 1.1 Concurrency, Stale-authority guard and Cache is loop-thread only.
- Resource limits (event-loop blocking) — selected: the defect itself; tests 1.1 Same-loop callback for inlet and outlet.
- Legacy compatibility — selected: the `ocu-filter-auth` behaviour; 1.1 Mechanical conversion and Must preserve.
- Error handling — selected: exceptions crossing `to_thread`; the existing 401/403/redirect/transport tests in their await form.
- Documentation — selected: 1.3.
- Public API / CLI, Config, Schema, Auth/secrets beyond the preserved behaviour, Release — not selected: no interface, config, schema or credential change. The Open WebUI handler contract already accepts coroutines.
