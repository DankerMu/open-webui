## Design

Change surface: `utils/image_budget.py` (new), `normalize_messages_for_model` in `utils/middleware.py`, `CHAT_MAX_IMAGES_PER_REQUEST` in `config.py`.

Must preserve:

- A payload with at most N image parts is returned unchanged (same objects, same order).
- Message count, roles, order, `tool_call_id`s, `tool_calls`, and every non-image part are unchanged.
- `strip_empty_content_blocks` and `merge_system_messages` still run first, as today.
- Stored chat history (`output`, `files`) is never modified, and neither are the caller's message objects: the cap copies a message and its `content` list only when it replaces a part in it (copy-on-write); message dicts are shared across tool-loop rounds through `*form_data['messages']` (`middleware.py:5963`, `:6190`).
- `normalize_messages_for_model` keeps assigning `form_data['messages']` on the dict it was passed: the approval-resume caller (`:3431`) discards the return value.

Must add/change:

- Image parts are detected by `type` alone: `image_url` (value `{"url": ...}` or a string, both accepted by `routers/openai.py:1355-1360`) and `input_image` (string `image_url`; tool messages and the stateful branch), inside list `content`. These are the only image shapes that reach this point; the Anthropic `image` block reaches only the passthrough branch, which never calls this function. Counting runs newest first: from the last message backwards, and within a message from its last part backwards. The newest N stay; each older image part becomes `{"type": "text", "text": OMITTED}` (`image_url`) or `{"type": "input_text", "text": OMITTED}` (`input_image`), keeping the replaced part's `cache_control` key if it has one, where OMITTED tells the model an earlier image was left out to stay within the per-request image limit and that it can open the file again with a tool.
- `CHAT_MAX_IMAGES_PER_REQUEST`: unset means 30; otherwise a decimal integer ≥ 1, else startup raises `ValueError` naming the variable.

Governing invariant: every payload that leaves `normalize_messages_for_model` carries at most N image parts, and the kept ones are the newest.

Sibling surfaces:

- The four `normalize_messages_for_model` callers (`middleware.py:3115`, `:3431`, `:5992`, `:6212`): all get the cap through the one call.
- `request` filters run before the cap (`:3104`, `:3408`, `:5983`, `:6203`), so a filter that adds images is capped too.
- `/api/v1/messages` converted branch (`main.py:1976-2041` → `chat_completion`): capped at `:3115`. Its `tool_result` images become `image_url` parts in `tool` messages (`utils/anthropic.py:273-298`), which `routers/openai.py:1602-1610` later drops on Chat Completions; they still count against the budget, so the cap may be conservative there (never over-sends), and a placeholder in a tool message becomes text of that tool result. Accepted: this is Claude Code's own session, which compacts on its own.
- `/api/v1/messages` passthrough branch (`main.py:1916`, `:2012-2015`; only an `api.anthropic.com` URL or `provider == 'litellm'`): bypasses this function. Non-goal: production's upstream is an OpenAI-compatible URL (rules out the Anthropic-URL case); whether its connection config sets `provider: litellm` is not checked from the repo, and the decision record says so.
- Stateful Responses branch (`:5934-5941`, `previous_response_id`): the cap bounds this turn's payload but not images the upstream keeps from earlier turns. Non-goal: `ENABLE_RESPONSES_API_STATEFUL` defaults to off (`env.py:1082`) and production does not set it.
- Context compaction (`utils/context_compaction.py`): unchanged; it runs on stored history, not on this payload.
- Image-edit input (`middleware.py:1796-1804`): its own cap, unchanged.

Seams under test: `image_budget` as a function that never mutates its input; `normalize_messages_for_model` as the integration seam (all four callers pass their full outgoing `form_data` to this one function, so a direct call stands in for each caller; driving `process_chat_payload` or the tool loop would need the whole chat pipeline); config parsing in a subprocess or by re-evaluating the parser function.

Required evidence:

- 40 tool-result images in a flattened user message plus 3 user images in earlier messages, N = 30 → exactly 30 image parts remain, the newest 30; 13 placeholders; all text parts and message order unchanged.
- 30 images, N = 30 → returned unchanged.
- One user message with 5 images, N = 2 → the last 2 parts stay; the first 3 become text placeholders.
- A tool message with `input_image` parts over budget → each becomes `input_text`.
- String `content` and messages without images are untouched.
- `CHAT_MAX_IMAGES_PER_REQUEST` = `0`, `-1`, `abc`, `3.5` → `ValueError`; unset → 30; `5` → 5.
- `normalize_messages_for_model` with 33 images and the default config → 30 images out, set on the passed dict's `messages` (red before the change).
- A string-valued `image_url` part (`{"type": "image_url", "image_url": "data:..."}`) over budget → replaced.
- A replaced part that had `cache_control` → the placeholder keeps it.
- After the call, the caller's input message objects and content lists are unchanged (deep-equal to a copy taken before).

Non-goals: enabling or changing compaction; rewriting stored history; task-model calls (title, tags) that build their own short payloads; the passthrough and stateful branches above. Deviation from #936: the placeholder does not name the omitted image's sandbox path. After `flatten_tool_images` (`misc.py:401-418`, `middleware.py:5950-5980`) all images of a batch of tool outputs sit in one trailing user message, so an image no longer maps to its `view` call; the placeholder tells the model to open the file again with a tool instead.

Review focus: newest-first selection and same-position, copy-on-write replacement; nothing but image parts changes; the invariant at all four callers; fail-loud config; minimal spine diff.
