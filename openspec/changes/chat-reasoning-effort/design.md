## Context

- `Chat.svelte` owns `let params = {}` (`:440`); it is reset for a new chat (`:918`, `:2181`), loaded from the chat (`:2369`, `:3342`), saved 400 ms after any change (`:822`), and sent as `params: { ...$settings?.params, ...params, stop }` (`:3609`). It is bound two-way into `ChatControls` (`:4651` `bind:params`), which binds it into `Controls` → `AdvancedParams` (the Reasoning Effort text field).
- Backend `apply_params_to_form_data` (`payload.py:85-120`) copies every non-`None` param key not already in the request onto the request top level, so a `null` cancels a key inherited from `$settings.params` (spread in the frontend at `Chat.svelte:3610-3611`). It does not cancel model-level params or `models.default_params` (`main.py:1152-1154` drops `None` before merging over them) or admin `custom_params` (merged afterwards, `payload.py:107-113`). Precondition, checked on the acceptance instance for model-level params (none on these ids) and assumed for `models.default_params` / `custom_params`: they hold neither key. All measured ids are on the OpenAI-compatible connection (for `owned_by == 'ollama'` params go to `options`, `payload.py:109`).
- Composer instances: `Chat.svelte:4442`, `Chat.svelte:4534`, `Placeholder.svelte:233`; all except the note-embedded one sit under a mounted `ChatControls`. `MessageInput.svelte` renders `ModelSelector` inside `div.flex.min-w-0.max-w-[10rem].items-center.sm:max-w-[13rem]` (`:2523-2532`). `ModelSelector.svelte` (91 lines) is imported only there and receives `selectedModels`.
- Size rules: `MessageInput.svelte` is over 800 lines and may not grow (`scripts/lint-scoped.sh` ratchet, baseline 2733); `Chat.svelte` is at its bounded ceiling 4688.

## Decisions

### D1. Vocabularies and pure helpers (`src/lib/utils/reasoning-effort.ts`)

```ts
export type EffortChoice = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Vocabulary = { levels: EffortChoice[]; default?: EffortChoice };
const DEEPSEEK_V4: Vocabulary = { levels: ['off', 'high', 'max'], default: 'high' };
const QWEN38: Vocabulary = { levels: ['off', 'low', 'medium', 'high', 'xhigh'], default: 'medium' };
const QWEN38_ALWAYS_THINKING: Vocabulary = {
	levels: ['low', 'medium', 'high', 'xhigh'],
	default: 'medium'
};
export const GENERIC: Vocabulary = { levels: ['low', 'medium', 'high', 'xhigh'] }; // no default: nothing sent until picked
```

`effortVocabulary(selectedModels: string[]): Vocabulary | null | undefined` — `undefined` when no non-empty model id is selected (still loading or the saved model is unavailable); `null` when several are selected; otherwise, on the lower-cased id, first match wins:

1. ends with `-cc` → `GENERIC` (unmeasured channel variants);
2. `qwen3.8-2.4t-a95b` → `QWEN38_ALWAYS_THINKING` (HTTP 400 on the disabled switch);
3. starts with `qwen3.8-` → `QWEN38`;
4. `deepseek-flash-guan`, or contains `deepseek-v4` → `DEEPSEEK_V4`;
5. anything else → `GENERIC` (the same object for every such id).

Helpers (each returns the same reference when nothing changes):

- `currentChoice(params): EffortChoice | undefined` — when `params.reasoning_effort` is a non-empty string: that value if it is one of `low|medium|high|xhigh|max`, else `undefined` (free text wins, even over a disabled switch); otherwise `'off'` when `params.thinking?.type === 'disabled'`; otherwise `undefined`.
- `isEmpty(params)` — `reasoning_effort` null/missing/empty and no disabled switch.
- `withChoice(params, choice)` — `'off'` → `{ ...params, reasoning_effort: null, thinking: { type: 'disabled' } }`; a level → `{ ...params, reasoning_effort: level, thinking: null }`; same reference if already in that exact shape. `null`, not deletion, so a value inherited from `$settings.params` is cancelled.
- `withoutChoice(params)` — deletes both keys (so `$settings.params` applies again, as before this change); same reference if neither is present.
- `reconciledParams(params, current, previous)` with `current`/`previous` = `{ chatId, vocabulary }` (`previous` undefined on the first run). Rules, in order:
  1. `current.vocabulary === undefined` (no model) → `params`.
  2. `previous` undefined or `previous.chatId !== current.chatId` (first run, chat load, chat switch) → family vocabulary and `isEmpty(params)` → `withChoice(params, default)`; otherwise `params`.
  3. Same chat, `current.vocabulary !== previous.vocabulary` (a model switch that changes vocabulary):
     - to `null` (several models) → `withoutChoice(params)`;
     - to `GENERIC` → `withoutChoice(params)` (a carried value was chosen for another vocabulary);
     - to a family → `withChoice(params, choice)` when `currentChoice` is in its levels, else `withChoice(params, default)`; free text (`currentChoice` undefined but `reasoning_effort` non-empty) is left unchanged.
  4. Same chat, same vocabulary (including a switch between two generic models, or a Controls edit) → family vocabulary and (`isEmpty(params)` or `currentChoice` is a known choice outside its levels) → `withChoice(params, default)`; otherwise `params` (generic and multi-model leave typed values alone).

Rejected: a stateless resolver (cannot tell a carried family default from a user pick, so a generic model would keep sending it); admin-editable vocabularies in model meta (needs an admin UI in the upstream model editor; a vocabulary is only trustworthy after measuring the provider, which is code-review material); sending a generic default to unmeasured models (some providers reject unknown values — `qwen3.8-2.4t-a95b` shows a single unsupported value fails the whole request).

### D2. Store binding (`src/lib/stores/chat-effort.ts`)

`chatEffortParams: Writable<{ chatId: string | null; params: Record<string, unknown>; setParams: (next: Record<string, unknown>) => void } | null>` (initial `null`). `ChatControls.svelte` publishes `{ chatId, params, setParams: (next) => (params = next) }` while not embedded (`chatId` is its existing prop, `ChatControls.svelte:61`) reactively and sets `null` in `onDestroy`; the assignment flows back to `Chat.svelte` through the existing `bind:params`, so the existing save and send paths carry it. No other writer.

### D3. `ReasoningEffortSelector.svelte`

Props: `selectedModels: string[]`. Reads `$chatEffortParams`; does nothing and renders nothing when the store is `null`.

- Reconciliation: the selector keeps `previous = { chatId, vocabulary }` (updated after each run unless the vocabulary is `undefined`); reactively, `next = reconciledParams(params, current, previous)`; when `next !== params`, call `setParams(next)`. One round settles because every rule returns the same reference once applied.
- Renders only when `effortVocabulary(selectedModels)` is a vocabulary (exactly one model).
- UI: the existing `Dropdown` pattern used by the composer menus (`MessageInput/IntegrationsMenu.svelte`). Trigger button `shrink-0`: `LightBulb` icon (decorative) plus the current label, same text size and colours as the model trigger (`text-[0.8125rem] text-gray-600 … dark:text-gray-300`), accessible name `Thinking strength: <label>`; the label is `Default` when no choice is set (generic models before a pick, or free text); below `sm` only the icon shows (accessible name unchanged). Menu: one `menuitemradio` per level in vocabulary order with `aria-checked` and a check icon, labels `Off`, `Low`, `Medium`, `High`, `XHigh`, `Max` via `$i18n.t`. Choosing calls `setParams(withChoice(params, choice))` and closes the menu. There is no menu item for Default; Controls → Reasoning Effort → Default still clears the field, after which a family model gets its default again and a generic model shows Default.

### D4. Placement

`ModelSelector.svelte`: render `<ReasoningEffortSelector {selectedModels} />` right after the `Selector` in the same row (the row becomes `flex items-center gap-1`; the model trigger stays `min-w-0` and truncates, the effort trigger is `shrink-0`). `MessageInput.svelte`: only the class string of the existing wrapper line `:2523` may change (wider `max-w-*`, still truncating the model name) — no added lines; nothing else in the file.

## Risks / Trade-offs

- Family chats now always send an effort (DeepSeek V4 `high` equals the provider default; Qwen3.8 `medium` replaces unbounded reasoning), overriding a global `$settings.params.reasoning_effort` for those families; generic models keep the global value until the user picks.
- Opening an older family chat without a value writes the default once (`updateChatById`, params-only, `touch=false` at `routers/chats.py:1364`, so the sidebar order stays).
- The `?q=` auto-submit path (`Chat.svelte:2271-2272`) submits after one `tick()`; the default lands only if the selector has resolved by then. Evidence d covers it.
- Patterns cover unmeasured family members (for example new `deepseek-v4*` or `qwen3.8-*` ids); a member that rejects a value needs a rule like rule 2. `DMXAPI-ds-v4-*` ids are not matched (unmeasured) and fall to the generic vocabulary.
- Labels render in English for zh-CN users (fork strings have no zh-CN catalog entries yet).
- The note-embedded composer has no selector; a Qwen3.8 note chat still reasons unbounded unless the Controls field is set.

## Evidence plan

a. `reasoning-effort.test.ts`: each vocabulary rule (`-cc`, `qwen3.8-2.4t-a95b`, `qwen3.8-27b`, `deepseek-flash-guan`, `DMXAPI-deepseek-v4-flash`, `DMXAPI-ds-v4-p-0813` → generic, an unmatched id), `undefined` for no model and `['']`, `null` for two; `currentChoice` (free text wins over disabled, valid level wins over disabled); `withChoice` / `withoutChoice` shapes and same-reference; `reconciledParams`: first run empty family → default, first run generic → unchanged, chat switch never clears a saved value, no-model → unchanged; switches DeepSeek Max → Qwen gives Medium, Qwen Medium → DeepSeek gives High, Qwen Off → `qwen3.8-2.4t-a95b` gives Medium, family → generic clears, generic → generic keeps a pick, single → several clears, typed level in a multi-model chat kept, Controls Default (null) on a family gives the default, typed `max` on a generic model kept, typed `low` on DeepSeek gives High, free text kept.
b. `ReasoningEffortSelector.test.ts`: hidden without store and for two models; generic model shows Default with four items and writes nothing until a pick; a pick on a generic model survives a switch to another generic model; a carried family default is cleared on a switch to a generic model; family model shows its levels in order with the current one checked; choosing writes the D1 shape; no write when settled; accessible names.
c. `ChatControls.test.ts`: publishes the binding; `setParams` updates the bound `params`; `null` after destroy.
d. Browser (`e2e`): stub models `qwen3.8-27b`, `deepseek-v4.1-flash-1017` and an unmatched id; the selector appears right of the model trigger; intercepted `/api/chat/completions` request `params` carry: Medium on a new Qwen chat; Off then High as the D1 shapes; after switching to the unmatched model neither key until a pick, then `reasoning_effort: <level>` and a null `thinking`; `/?q=…&models=qwen3.8-27b` carries `reasoning_effort: "medium"`; reopening the chat keeps the choice; switching from a saved Qwen chat to a saved generic chat with XHigh picked (and back) keeps each chat's saved value, which guards the order in which `chatId`, params and `selectedModels` update on chat load (if they do not land in one tick, rule 2 must key on whichever arrives last); screenshots light/dark and 390 px; `MessageInput.svelte` and `Chat.svelte` line counts unchanged (lint-scoped).
