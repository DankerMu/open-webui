## Why

(#648). Owner request (2026-10-26): a thinking-strength (思考强度) selector in the message composer, directly right of the model selector, offering strength levels only (no token budgets). Owner decision (2026-10-26): measured vocabularies for the DeepSeek V4 family and the Qwen3.8 family; every other model gets the generic Low / Medium / High / XHigh.

Today the only control is Controls → Advanced Params → Reasoning Effort, a free text field writing chat `params.reasoning_effort` (`src/lib/components/chat/Settings/Advanced/AdvancedParams.svelte:480-510`); the provider-specific off switch is reachable only through admin-only custom parameters. Measurements on the acceptance VPS (issue #648 and its follow-up comment) fixed the vocabularies: DeepSeek V4 models (`deepseek-flash-guan`, `deepseek-v4.1-flash-1017`, `deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-v4-pro-guan`, `deepseek-v4.1-flash`, `DMXAPI-deepseek-v4-flash`) accept `high` and `max` (`low` erratic) and `thinking: {"type":"disabled"}`; Qwen3.8 models (`qwen3.8-27b`, `-flash`, `-max`, `-omni-flash`, `-2.4t-a95b`) accept `low`, `medium`, `high`, `xhigh` (`max` not recognised) and the disabled switch, except `qwen3.8-2.4t-a95b`, which answers HTTP 400 `enable_thinking parameter is restricted to True`; Qwen with nothing set reasons without bound. None of these models has model-level params on the acceptance instance (`/api/models` info: only `arena-model`).

## What Changes

In this repo (WebUI fork):

- New pure module `src/lib/utils/reasoning-effort.ts`: the family rules (id patterns → ordered levels + default), the generic vocabulary for every other model, the current-choice reader, the params writer and the switch resolution.
- New `src/lib/components/chat/ReasoningEffortSelector.svelte`, rendered inside `src/lib/components/chat/ModelSelector.svelte` (91 lines, used only by the composer) right after the model trigger.
- New store `chatEffortParams` in `src/lib/stores/chat-effort.ts`: `ChatControls.svelte` (already `bind:params` with `Chat.svelte`) publishes the chat id, the chat params and a setter; the selector reads and writes through it. `MessageInput.svelte` (2733 lines, ratchet) and `Chat.svelte` (bounded ceiling 4688) gain no lines.
- New spec capability `chat-reasoning-effort`.

Must preserve:

- One source of truth: chat `params.reasoning_effort` stays the field the Controls Advanced Params text box edits; the selector writes `reasoning_effort` and `thinking` only.
- Request shape: params still reach the backend through the existing `params` object (`Chat.svelte:3609`) and `apply_params_to_form_data` (`backend/open_webui/utils/payload.py:85`); no backend change.
- Per-chat persistence through the existing params save (`Chat.svelte:822`); temporary chats keep params in memory as today.
- Multi-model chats: no selector and no selector-owned keys sent.
- Other models: nothing is sent until the user picks a level.
- The note-embedded composer is unchanged (no `ChatControls` there).

Out of scope: token budgets, admin UI for vocabularies, zh-CN translations, measured vocabularies for other families, the note-embedded composer, backend.

## Capabilities

### New Capabilities

- `chat-reasoning-effort`: composer thinking-strength selector with measured family vocabularies and a generic fallback.

## Impact

Users pick a strength level per chat next to the model (Off where the model supports it); Qwen3.8 no longer runs unbounded by default.

## Triage

```text
Issue type: UI feature (owner request)
Fixture level: expanded
Upstream suggested level: absent; expanded: new request parameters on every message for three models, upstream composer component touched, state shared across components through a store
Blast radius: every message sent with a DeepSeek V4 or Qwen3.8 model, and every message where a user picked a generic level; a wrong mapping silently changes reasoning cost/quality or sends a value the provider rejects
Selected risk packs: Invariant / state (params, defaults, model and chat switches); Public API (request payload keys); UI / accessibility
Evidence floor: Vitest for each spec scenario (red first); make test-frontend; make typecheck; make lint-scoped; make coverage-gate (name new files); make anti-drift; make verify-ui-ocu or make verify-ui with a browser case asserting the sent request params, screenshots light/dark and 390 px; make doc-gate; make decisions-verify
design.md: present
```
