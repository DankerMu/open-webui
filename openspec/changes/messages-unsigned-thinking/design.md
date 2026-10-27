## Design

Change surface: `convert_anthropic_to_openai_payload` in `backend/open_webui/utils/anthropic.py` (lines 204-205 and 372), reached from `POST /api/v1/messages` and `/api/message` (`main.py:1975-2000`) when the target is not a native Anthropic passthrough.

Must preserve: output for thinking-free requests whose assistant turns each yield at least one content part or a tool call; signed thinking and redacted_thinking replay (an OpenAI-compatible gateway that forwards to Anthropic but is not recognised as Anthropic or tagged `provider: litellm` — those go to passthrough at `main.py:2016-2017` and never reach the converter — needs the previous turn's signed block for extended thinking with tool use); omission of empty user messages; response-direction thinking production.

Must add/change: drop `thinking` blocks lacking a truthy `signature`; emit an assistant message with `content: ''` when its block list converts to nothing and has no tool calls.

Governing invariant: a converted Chat Completions request never contains a content part of type `thinking` that has no signature, and the assistant/user turn order of the Anthropic request is preserved.

Sibling surfaces:
- Assistant message with tool calls (line 364-371): `content` becomes `''` when only unsigned thinking preceded the tool_use — the shape measured as accepted.
- System prompt conversion: only text blocks are taken; none - thinking is not valid there.
- Response converters: produce thinking, never consume it; none - untouched.
- Native passthrough: request forwarded untouched; none - not on this path.

Seams under test: `convert_anthropic_to_openai_payload(payload)` return value (pure function).

Required evidence (pytest, each red on `main` unless marked):
a. assistant `[thinking(no signature), tool_use]` → assistant message `{'content': '', 'tool_calls': [...]}`, no `thinking` part anywhere in `messages`.
b. assistant `[thinking(no signature), text]` → assistant `content == 'text'` (string), no thinking part.
c. assistant `[thinking(signature='sig'), tool_use]` → the thinking block is kept verbatim as a content part (green on main too: preservation).
d. assistant `[redacted_thinking(data=...)]` → kept as a content part (preservation).
e. assistant `[thinking(no signature)]` only → `{'role': 'assistant', 'content': ''}` present between the surrounding user turns.
f1. user content `[]` between turns → still omitted (preservation, green on main; guards the role restriction).
f2. user content `[thinking(no signature)]` → omitted (red on main, which emits `{'role':'user','content':[thinking]}`).
i. assistant content `[]` between two user turns → `{'role': 'assistant', 'content': ''}` emitted (red on main, which omits it; intended effect of upstream hunk 2).
g. `cache_control` on a signed thinking block is copied (preservation).
h. full Claude Code shape: user text → assistant `[thinking, tool_use]` → user `[tool_result]` → `[user, assistant(tool_calls, content ''), tool]` in order.

Non-goals: reasoning_content forwarding; SSE-for-non-stream; any OCU or deploy change.

Review focus: behaviour identical to upstream `75b1836322` (hunk 2 verbatim, hunk 1 line-neutral equivalent); `anthropic.py` stays at 981 lines; role restriction on the empty-message rule; no change for thinking-free requests except assistant turns that convert to nothing (now an empty assistant message, evidence i); tests assert outputs, not internals.
