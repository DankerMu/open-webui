---
id: 2026-10-27-messages-unsigned-thinking
title: Drop unsigned thinking when converting Messages requests to Chat Completions
kind: bug-fix
status: implemented
date: 2026-10-27
supersedes: none
references: 'https://github.com/DankerMu/open-webui/issues/653; openspec/specs/anthropic-messages-conversion'
---

# Drop unsigned thinking when converting Messages requests to Chat Completions

## Problem

Anthropic SDK clients such as Claude Code send the assistant's earlier `thinking` blocks back on every follow-up request to `POST /api/v1/messages`. When the target model is not a native Anthropic or LiteLLM passthrough, [the converter](../../../../backend/open_webui/utils/anthropic.py) (`convert_anthropic_to_openai_payload`) copied those blocks into the Chat Completions assistant message as content parts of type `thinking`. Chat Completions defines no such part type. Open WebUI builds these blocks itself from `reasoning_content`, so they carry no signature. Strict OpenAI-compatible providers reject the whole request, and a Claude Code tool loop fails on its second turn.

Measured on the acceptance VPS (WebUI `0638d62`, 2026-10-27) with a direct tool round trip through `/api/chat/completions`, varying only the assistant turn:

| assistant turn shape               | deepseek-flash-guan | deepseek-v4.1-flash-1017 | qwen3.8-27b                   |
| ---------------------------------- | ------------------- | ------------------------ | ----------------------------- |
| content part `{"type":"thinking"}` | 400                 | 200                      | 400 `Invalid value: thinking` |
| thinking dropped                   | 200                 | 200                      | 200                           |

Claude Code 2.1.112 against `deepseek-flash-guan` through `/api/v1/messages` returned 200 on turn 1 and 400 "rejected by an internal MaaS component" on turn 2.

Source: [unsigned thinking replay defect](https://github.com/DankerMu/open-webui/issues/653).

## Decision

The fork carries the behaviour of upstream commit `75b183632294106d0f45be49918677ae6835c126` (open-webui#29849) in `convert_anthropic_to_openai_payload`, in a line-neutral form (+2 −2). The commit is first released in upstream v0.11.4 and is present in every later release.

`anthropic.py` is 981 lines, over the 800-line ceiling that `make lint-scoped` enforces, so a modified upstream file may not grow; upstream's form adds two lines. Hunk 2 is verbatim. Hunk 1 folds upstream's comment, nested `if` and indented append into the `elif` condition, leaving the append line unchanged:

```python
elif block_type == 'redacted_thinking' or (block_type == 'thinking' and block.get('signature')):
    openai_content.append(_copy_cache_control(block, dict(block)))
```

The behaviour is identical to upstream: the block-type chain has no `else`, so an unsigned `thinking` block matches no branch and contributes nothing, exactly as upstream's nested `if` skips it.

- A `thinking` block without a truthy `signature` is dropped. Signed `thinking` blocks and `redacted_thinking` blocks stay as content parts unchanged, including `cache_control`: a gateway forwarding to Anthropic needs the previous turn's signed block when extended thinking continues with tool use.
- An assistant message whose blocks convert to no content and no tool calls is emitted as `{'role': 'assistant', 'content': ''}`, so the assistant/user turn order of the request survives. An assistant turn with `content: []` or with only blocks the converter ignores is emitted the same way. A user message that converts to nothing is omitted, including a user turn holding only unsigned thinking.

Tool use, tool results, text and image parts, the system prompt and the response direction are unchanged. [The conversion tests](../../../../backend/open_webui/test/utils/test_anthropic_conversion.py) pin each rule on the converter's returned messages.

## Alternatives considered

- **Drop every thinking block, signed or not** — upstream's first cut of the same fix; it removes the signed blocks an Anthropic-forwarding gateway requires for extended thinking with tool use.
- **Forward unsigned thinking as `reasoning_content`** — not a standard Chat Completions request field; providers accept it inconsistently, and it is a separate change.
- **Route these models through native passthrough** — they are OpenAI-compatible connections; passthrough sends Anthropic-format bodies they cannot parse.
- **Keep omitting assistant turns that convert to nothing** — consecutive user messages lose the turn structure the client sent.
- **Apply upstream's form verbatim with a `constraints.yaml` line-ceiling override for `anthropic.py`** — relaxes a size gate for a two-line convenience; the line-neutral form costs one trivial rebase conflict instead.
- **Write a different fork-specific rule** — any behaviour divergence from upstream would have to be re-justified on every rebase; the line-neutral form keeps upstream's behaviour and differs only in layout.

## Consequences

Requests whose assistant turns each yield a content part or a tool call convert exactly as before. Requests with an assistant turn that converts to nothing gain an empty assistant message; providers measured above accept that shape.

When the fork rebases onto upstream v0.11.4 or later, hunk 2 resolves as identical and hunk 1 conflicts on one line: resolve it by taking upstream's form, then archive this record. The conversion tests stay as fork coverage of upstream behavior unless upstream ships equivalent tests.

Rollback reverts the two hunks, the test module and this record together. No configuration, migration or deployment change is involved.
