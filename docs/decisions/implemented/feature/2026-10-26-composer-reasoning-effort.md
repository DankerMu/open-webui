---
id: 2026-10-26-composer-reasoning-effort
title: The composer offers a thinking strength from measured vocabularies, keyed to the chat params object
kind: feature
status: implemented
date: 2026-10-26
supersedes: none
references: openspec/changes/chat-reasoning-effort, DankerMu/open-webui#648
---

# The composer offers a thinking strength from measured vocabularies, keyed to the chat params object

## Problem

The owner asked on 2026-10-26 for a thinking-strength selector directly right of the composer model selector (#648). Before this change, the only control was the free-text Reasoning Effort field under Controls → Advanced Params. The provider off switch was reachable only through admin custom parameters. Qwen3.8 with nothing set reasons without bound. Acceptance-VPS measurements fixed what each family accepts. DeepSeek V4 accepts `high`, `max` and `thinking: {"type":"disabled"}`. Qwen3.8 accepts `low` to `xhigh` and the disabled switch, except `qwen3.8-2.4t-a95b`, which answers HTTP 400 to the disabled switch.

## Decision

`src/lib/utils/reasoning-effort.ts` holds the vocabularies and the pure helpers. The family rules are checked in order: `-cc` → generic; `qwen3.8-2.4t-a95b` → Low to XHigh without Off; `qwen3.8-*` → Off, Low, Medium, High, XHigh with default Medium; `deepseek-flash-guan` or ids containing `deepseek-v4` → Off, High, Max with default High; everything else → generic Low, Medium, High, XHigh with no default. Off writes `reasoning_effort: null` and `thinking: {type:'disabled'}`, a level writes the level and `thinking: null`, and nulls cancel values inherited from the user's global params. The selector writes only these two keys of the chat params, the object the Controls field edits. The values reach the request and the per-chat save through the existing params paths, so the backend is unchanged.

`ChatControls.svelte` publishes `{ modelIds, params, setParams }` to `chatEffortParams` (`src/lib/stores/chat-effort.ts`) in one reactive statement and publishes `null` on destroy. `setParams` assigns its bound `params`, which flows to `Chat.svelte` through the existing `bind:params`. `ReasoningEffortSelector.svelte` is rendered inside `ModelSelector.svelte` and reconciles from that snapshot after every publication. Reconciliation stops after one round because every helper returns the same object once its result is already in place. On a family model every reconciliation rewrites a choice in its levels to its exact request shape. A Controls edit after Off can otherwise leave `reasoning_effort: 'medium'` beside `thinking: {type:'disabled'}` and send both. `MessageInput.svelte` changes only the `max-w-*` classes of the ModelSelector wrapper.

`Chat.svelte` (upstream spine, at its 4688-line ceiling) gets one line-neutral move in `initNewChat`: `params = {}`, `chatId.set('')` and `chatTitle.set('')` now run before the first await (`:2157-2159`), not after the draft restore. With the late reset, New Chat in place published the new default model with the previous chat's params. A switch to a generic model then cleared that chat's pick, and the draft restore's params write (`handleToolApprovalModeChange`, `:453-470`) saved the result under the previous chat id, which was still set. As a result, a restored draft's `tool_approval_mode` stays in the new chat's params. Saves skip while the chat id is empty, and `ChatControls` closes its panel for a missing chat id a few awaits earlier.

Two deviations from the fixture design (D1–D3):

- **Model ids come from the store, not a `selectedModels` prop.** `ChatControls` receives the params and the resolved models (`selectedModelIds`) in the same prop update. Reading both from one publication means a reconciliation never pairs one chat's params with another chat's models. If such a pair occurred, the write would go through `bind:params` and overwrite the newly loaded chat's params. An @-mention counts as a model switch: `selectedModelIds` follows the mention, so while it is active a choice can be converted to the mentioned model's vocabulary (or cleared for a generic one) and saved with the chat; ending the mention does not restore the earlier pick.
- **Rule 2 keys on the params object, not on the chat id.** The transition records `{ vocabulary, params }` and stores the object the selector returned. A first run or a params object replaced from outside counts as a chat load. A load keeps saved values, and a family chat without a value gets its default. Following the design's own rule ("key on whichever arrives last"): `loadChat` sets the chat id before awaiting the fetch and assigns models and params after it (`Chat.svelte:2290`, `:2333`, `:2369`). `initNewChat` resets `params = {}` and the chat id right after the model selection, before its first await (`:2157-2158`, see below), so its new models never meet the previous chat's params. With a chat-id key, a saved generic XHigh would reach the selector as a same-chat vocabulary change and be cleared. Because of this, `chatId` is not published. Controls edits mutate params in place (`AdvancedParams.svelte`), so they stay same-chat edits. `handleToolApprovalModeChange` (`Chat.svelte:453`) spreads a new object, so it counts as a load and changes nothing.

## Alternatives considered

- **Stateless resolver** — cannot tell a carried family default from a user pick, so a generic model would keep sending the previous family's value.
- **Admin-editable vocabularies in model meta** — needs an admin UI in the upstream model editor. A vocabulary is trustworthy only after measuring the provider, which belongs in code review.
- **Sending a generic default to unmeasured models** — `qwen3.8-2.4t-a95b` shows that one unsupported value fails the whole request.
- **Chat id as the load key (fixture D1 as written)** — wrong for the ordering above. In the browser it currently passes only because `Chat.svelte` unmounts the composer and `ChatControls` while `loading` (`:4267`, `:842`). The pure and component tests that replay the load order fail with that key.
- **Wiring through `MessageInput.svelte` / `Chat.svelte` props** — both files are at their size ceilings (2733 ratchet, 4688 bounded).

## Consequences

Chats on a family model always send an effort: DeepSeek V4 `high` (the provider default) and Qwen3.8 `medium` instead of unbounded reasoning. That overrides a global `$settings.params.reasoning_effort` for those families. Generic models keep the global value until the user picks. Opening an older family chat without a value writes the default once through the params-only save. Model-level params, `models.default_params` and admin `custom_params` are not cancelled by the nulls, so they must not hold either key. On the acceptance instance this holds for model-level params and is assumed for the other two. Patterns cover unmeasured members of each family. A member that rejects a value needs its own rule, like `qwen3.8-2.4t-a95b`. Labels render in English for zh-CN users. The note-embedded composer has no `ChatControls` and therefore no selector. Typing `ChatControls`' `models` prop lowered the svelte-check ceiling to 7772.
