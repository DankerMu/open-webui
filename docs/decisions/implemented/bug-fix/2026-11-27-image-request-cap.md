---
id: 2026-11-27-image-request-cap
title: Cap the images in every chat request before it is sent to the model
kind: bug-fix
status: implemented
date: 2026-11-27
supersedes: none
references: 'https://github.com/DankerMu/open-webui/issues/936; https://github.com/DankerMu/open-webui/issues/934; openspec/changes/webui-image-request-cap'
---

# Cap the images in every chat request before it is sent to the model

## Problem

The production upstream accepts at most 32 images per request. Every chat request replays every earlier image: user uploads are re-sent each turn, and the images returned by OCU's `view` tool are stored in the message `output` and re-sent as one trailing user message ("Here are the images from the tool results above"). Within a turn, each tool-loop round re-sends all images so far. Once a chat passes 32 images, every request in it fails. The chat cannot be compacted on demand either, because compaction is off by default and only token-triggered. A single turn with more than 32 `view` calls fails partway through even with an empty history.

Source: [image request cap defect](https://github.com/DankerMu/open-webui/issues/936).

## Decision

[`utils/image_budget.py`](../../../../backend/open_webui/utils/image_budget.py) `cap_images` keeps the newest `CHAT_MAX_IMAGES_PER_REQUEST` image parts across the outgoing `messages`. It replaces each older one, at the same position, with a text part saying an earlier image was omitted to stay within the per-request image limit and that the model can open the file again with a tool.

- An image part is detected by `type` alone: `image_url` (dict or string value) and `input_image`, inside list `content`. An `image_url` becomes a `text` part, an `input_image` becomes an `input_text` part, and a `cache_control` key on the replaced part is kept.
- Newest means from the last message backwards and, within a message, from the last part backwards.
- The function never mutates its input. It copies a message and its `content` list only when it replaces a part in that message, because message dicts are shared across tool-loop rounds and stored history must not change. A payload within the limit is returned as the same list.
- `normalize_messages_for_model` in `utils/middleware.py` calls it after `strip_empty_content_blocks` and `merge_system_messages` and still assigns `form_data['messages']` on the dict it was passed. Its four callers are every send in the chat flow, after the `request` filters run, so images a filter adds are capped too.
- `CHAT_MAX_IMAGES_PER_REQUEST` is read once at import of `image_budget`, which `middleware` imports at server startup. Unset means 30, which leaves headroom under the upstream's 32. Any other value must be a positive decimal integer; otherwise startup raises `ValueError` naming the variable, rather than silently running uncapped.

The spine diff is line-neutral (+2 −2), because `middleware.py` is at its upstream line count and `make lint-scoped` rejects any growth of a modified upstream file that is already over 800 lines. One import line is added, and the two existing assignments are folded into one statement that wraps them in `cap_images`. The [precedent](2026-10-27-messages-unsigned-thinking.md) for a line-neutral form over a line-ceiling override is the same.

For the same reason, the variable is defined in `image_budget.py` and not in `config.py`, which has no line budget either. This is a deviation from the OpenSpec change. Behaviour and failure mode are the ones the change specifies; only the defining module differs.

The placeholder does not name the omitted image's sandbox path, which #936 asked for. `flatten_tool_images` puts all images of a batch of tool outputs into one trailing user message, so an image no longer maps to its `view` call. The placeholder tells the model to open the file again instead.

[The image budget tests](../../../../backend/open_webui/test/utils/test_image_budget.py) pin selection, placeholder shapes, copy-on-write, configuration parsing, the startup failure and the `normalize_messages_for_model` seam.

## Alternatives considered

- **Cap in the OCU filter's `request` hook** — the cap would then depend on which filters a model has installed and on the order they run in, and it would live in another repository than the payload it bounds. `normalize_messages_for_model` is the one function that all four sends share, and it runs after every `request` filter. The owner decided on a WebUI cap before every send (#936).
- **Enable context compaction** — it is token-triggered, not image-triggered, so a chat can pass 32 images well under the token threshold. A single turn with more than 32 `view` calls fails before any compaction could run. Compaction is unchanged by this fix.
- **Define `CHAT_MAX_IMAGES_PER_REQUEST` in `config.py`** — it needs either a user-approved line-ceiling override for `config.py` or deleting upstream blank lines to stay line-neutral. Both cost more than defining it in the fork module that uses it, which the OCU client also does with its environment variables.
- **Drop the oldest images instead of replacing them** — the model would lose the signal that an image existed and could be reopened. Removing parts could also empty a message or a tool result.
- **Name the sandbox path in the placeholder** — not recoverable after flattening (see above).

## Consequences

Chats with at most 30 images per request send exactly what they sent before. Above that, the model sees placeholders for the oldest images and must reopen a file with a tool to see it again. External callers of `/api/chat/completions` and the converted `/api/v1/messages` branch see the same placeholders above the limit, which is intended. Stored chat history (`output`, `files`) is unchanged.

Not covered:

- **`/api/v1/messages` passthrough branch** (an `api.anthropic.com` URL or a connection with `provider == 'litellm'`): it never calls `normalize_messages_for_model`. Production's upstream is an OpenAI-compatible URL, which rules out the Anthropic-URL case. Whether production's connection config sets `provider: litellm` was not checked from this repo.
- **Stateful Responses branch** (`previous_response_id`): the cap bounds this turn's payload, but not the images the upstream keeps from earlier turns. `ENABLE_RESPONSES_API_STATEFUL` defaults to off and production does not set it.
- **Converted `/api/v1/messages` branch**: `tool_result` images become `image_url` parts in `tool` messages, which the OpenAI router later drops on Chat Completions. They still count against the budget, so the cap can be conservative there but never over-sends.
- **Task-model calls** (title, tags) build their own short payloads and are not capped.

Rollback reverts the two `middleware.py` lines, the new module, its tests and this record together. No migration is involved. Removing `CHAT_MAX_IMAGES_PER_REQUEST` from a deployment restores the default of 30.
