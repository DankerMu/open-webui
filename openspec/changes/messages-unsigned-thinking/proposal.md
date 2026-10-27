## Why

(#653, first slice of #650.) Claude Code and other Anthropic SDK clients send the assistant's earlier `thinking` blocks back on every follow-up request. `convert_anthropic_to_openai_payload` (`backend/open_webui/utils/anthropic.py:204-205`) copies them into the Chat Completions assistant message as content parts of type `thinking`, which Chat Completions does not define. Open WebUI creates these blocks itself from `reasoning_content`, so they carry no signature. Strict OpenAI-compatible providers reject the whole request: on the acceptance VPS (2026-10-27) `deepseek-flash-guan` answers 400 "rejected by an internal MaaS component" and `qwen3.8-27b` answers 400 `Invalid value: thinking`, so a Claude Code tool loop dies on its second turn. The same round trip with the thinking part dropped returns 200 on all three measured models.

Upstream fixed this in `75b183632294106d0f45be49918677ae6835c126` (open-webui#29849, first released in v0.11.4).

## What Changes

- Backport the upstream commit into `backend/open_webui/utils/anthropic.py` with identical behaviour in a line-neutral form (`anthropic.py` is 981 lines, over the 800-line ratchet, so it may not grow; upstream's form is +2). Hunk 2 is verbatim; hunk 1 becomes a single condition `elif block_type == 'redacted_thinking' or (block_type == 'thinking' and block.get('signature')):` — an unsigned thinking block matches no branch of the block chain, which has no `else`, and is dropped:
  - unsigned `thinking` blocks are dropped; signed `thinking` blocks and `redacted_thinking` blocks are kept unchanged (including `cache_control`);
  - an assistant message whose content list yields no OpenAI content and no tool calls is still emitted, as `{'role': 'assistant', 'content': ''}`, so turn order survives.
- New test module `backend/open_webui/test/utils/test_anthropic_conversion.py`.
- Decision record `docs/decisions/implemented/bug-fix/2026-10-27-messages-unsigned-thinking.md` naming the upstream commit, and the rebase rule: on a rebase onto upstream ≥ v0.11.4, resolve the one-line conflict in hunk 1 by taking upstream.
- New spec capability `anthropic-messages-conversion`.

Must preserve:

- `tool_use` → `tool_calls`, `tool_result` → `role: tool` messages, text/image parts, system prompt, `cache_control` copying: unchanged output for thinking-free requests whose assistant turns each yield at least one content part or a tool call. (Intended change from upstream hunk 2: an assistant turn that converts to nothing — `[]`, or only blocks the converter ignores such as `document` — is now emitted as an empty assistant message instead of omitted.)
- Response direction (`convert_openai_to_anthropic_response`, `openai_stream_to_anthropic_stream`) still produces thinking blocks from `reasoning_content`; untouched.
- Native Anthropic passthrough (`is_anthropic_messages_passthrough`) receives the request untouched; not on this path.
- A user message whose content list converts to nothing is still omitted (only the assistant role gains the empty-message rule); a user turn holding only unsigned thinking now converts to nothing and is therefore omitted too.

Out of scope: forwarding unsigned thinking as `reasoning_content`; the non-stream request answered as SSE (observed, separate); sandbox networking, credentials and model following (#650 later slices).

## Capabilities

### New Capabilities

- `anthropic-messages-conversion`: thinking-block handling when `/api/v1/messages` requests are converted to Chat Completions.

## Impact

Claude Code tool loops through `/api/v1/messages` work against OpenAI-compatible reasoning models.

## Triage

```text
Issue type: bugfix (upstream backport)
Fixture level: expanded
Upstream suggested level: absent; expanded: request-format converter behind a public API endpoint
Blast radius: every /api/v1/messages request carrying assistant history that is not a native Anthropic/LiteLLM passthrough (OpenAI-compatible connections, and models outside OPENAI_MODELS such as Ollama, pipelines, functions); a wrong rule either keeps 400s or drops signed blocks a native-Anthropic gateway needs
Selected risk packs: Public API / CLI / script entry; Schema / field names; Legacy compatibility
Evidence floor: new pytest module red on main and green after; make lint-scoped; make coverage-gate naming the test module; make anti-drift; make smoke; make doc-gate; make decisions-verify; post-deploy Claude Code probe (orchestrator, VPS)
design.md: present
```
