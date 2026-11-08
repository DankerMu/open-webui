## Why

Open WebUI calls the OCU Computer Use filter's synchronous `inlet` and `outlet` directly on its only event loop. `backend/open_webui/utils/filter.py:159-162` calls a synchronous handler inline, and `backend/start.sh:100` defaults to `UVICORN_WORKERS=1`. Both handlers reach `_fetch_system_prompt`, which does a blocking `urllib` GET of OCU `/system-prompt` with a 10 s timeout. That has two consequences:

- **Already on `main`:** every prompt-cache miss stalls every WebUI user for the duration of the fetch, up to 10 s.
- **After #753:** the `/system-prompt` render calls back into WebUI's skill registry (`system_prompt.py:728-733` → `skill_manager.py:298-330`). WebUI's loop is blocked in `inlet` and cannot serve that callback, so it times out after 5 s. Each cold render then freezes WebUI for everyone for about 5 s, up to about 10 s. Uploaded skills never reach the prompt on this path, and in the worst case the chat gets no OCU prompt at all.

This was found in review round 1 of OCU PR DankerMu/open-computer-use#224 (#753). The user chose option (a) on 2026-11-08: make the filter async, in its own PR, merged before #753. Issue #777.

## What Changes

- `Filter.inlet` and `Filter.outlet` become `async def`. Open WebUI awaits coroutine handlers (`utils/filter.py:159-160`).
- `_fetch_system_prompt` becomes a coroutine. Only the blocking HTTP exchange (open, read, headers) runs in `asyncio.to_thread`. Every read and write of `_prompt_cache` and `_cache_authority` stays on the event-loop thread.
- After the fetch returns, the result is cached only while the authority it was fetched under is still current.
- Docs, changelog and version 5.3.0.

## Triage

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: expanded (agree: shared request entrypoint, concurrency, persisted in-process cache state)
Blast radius: every chat request of every WebUI user; the epic's skill delivery path
Selected risk packs: Concurrency / shared state / ordering; Legacy compatibility; Error handling; Resource limits (event-loop blocking); Documentation
Evidence floor: a same-loop callback test red before and green after; every existing filter test passes in the await form; OCU unit command passes
```

Repository: `DankerMu/open-computer-use`. As for every `[ocu]` issue, this fixture lives in the WebUI control plane. Precedent: `ocu-skill-zip-safety` (#740, OCU PR #222).
