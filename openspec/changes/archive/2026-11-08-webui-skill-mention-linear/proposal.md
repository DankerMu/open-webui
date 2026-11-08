## Why

The backend skill-mention patterns in `backend/open_webui/utils/middleware.py` (`SKILL_MENTION_RE` at `:2271`, `SKILL_MENTION_STRIP_RE` at `:2293`) match the label with `[^>]*` (#769). When a message holds many unclosed `<$x|` starts, each start scans to the end of the text before failing, so one scan costs O(n·L). A 90 KB message (`"<$ocu--a|" * 10000`) takes about 3 s per scan, and `process_chat_payload` runs two scans per request synchronously on the asyncio event loop, so every user on that worker stalls for 6–7 s. The message stays in the chat history and repeats the cost on every turn, and the gateway sets no request body limit. Any signed-in user can trigger it. The code comes from upstream Open WebUI; it is unchanged from the fork base v0.11.3 `2a960a5`.

## What Changes

- The label character class in both patterns changes from `[^>]*` to `[^<>]*`, the same class OCU's filter marker uses (DankerMu/open-computer-use#223). A label can no longer cross a `<`, so each start scans at most to the next `<` and a scan is linear.
- A label that contains `<` (such as `<$b|c<d>`) is no longer recognised or stripped. Every other mention form keeps its current result.
- New pytest module `backend/open_webui/test/utils/test_skill_mention_patterns.py`.

## Triage

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent (follow-up issue, no field)
Blast radius: event-loop stall for every user on a worker, repeated on every turn of the affected chat; upstream spine file middleware.py
Selected risk packs: Resource limits / large input; Legacy compatibility
Evidence floor: new pytest module red before and green after; the #751 pin module still green; make smoke
```
