## Context

`RichTextInput.svelte` has two halves of one format. The writer is the turndown `mentions` rule (`:117-125`), which serializes a mention span as `<{char}{data-id}>`. The reader is `setText` (`:482-509`), which turns `<$id|label>` back into a span. The writer reads only `data-id`, and the reader puts the label only into `data-label`, so a read followed by a write drops `|label`. Insertion from the `/` menu already puts `|label` into the id (`CommandSuggestionList.svelte` `selectOcuSkill` and the native branch), which is why a freshly picked skill is sent correctly and a restored one is not.

## Decisions

1. **Backport upstream `14956af03f` as is.** In the `setText` replacement callback, `data-id` becomes `` `${mentionId}|${display}` `` when the marker had a label and `mentionId` otherwise. This is the upstream line (upstream `RichTextInput.svelte` around `:578`), so a later rebase onto upstream resolves to the same text. Alternative rejected: making `|label` optional in the OCU filter. That changes the cross-repo marker contract, loses the display name (the model would see the English name), and leaves native labels stripped to empty.
2. **Escape the two attribute values `setText` writes.** The line is HTML-escaped for `&`, `<` and `>` before the mention regex runs (`:497`), but not for `"`. The label character class `[^&]*?` admits `"`, so `data-label="发票"生成"` ends the attribute early, and after Decision 1 `data-id` would end early too. Replace `"` with `&quot;` in the values written to `data-id` and `data-label`. The visible chip text needs no change: `"` is valid in element content.
3. **Leave `&` labels as they are.** A label containing `&` does not match the reader's regex (the escaped `&amp;` stops `[^&]`), so it stays literal text in the paragraph. Turndown copies that text through, the marker is sent unchanged, and the filter still matches it. The only cost is a missing chip after restore. Widening the regex would touch more upstream text for a display problem; it is a non-goal.

## Change surface

- `src/lib/components/common/RichTextInput.svelte` `setText` replacement callback only.

## Must preserve

- Turndown `mentions` rule, untouched; marker grammar `<$ocu--{name}|{label}>` and `<$id|label>`, untouched.
- Unlabelled mentions: `<$id>` and `<@id>` still rebuild with `data-id="{id}"` and serialize unchanged.
- Chip text: `{char}{label}`, or `{char}{id}` without a label, as today.
- User text around mentions: `<`, `>` and `&` in plain text are still escaped and come back verbatim.
- Slash-menu insertion and send (#751, #771, #792 tests and `e2e/ocu-skill-display-name.e2e.ts` slash case) unchanged.

## Governing invariant

For every text `t` made of plain text and recognised mention markers, setting `t` into the input and serializing again yields `t`, with two normalizations: the closing form `</id|label>` becomes `<$id|label>`, and an empty label `<$id|>` becomes `<$id>` (upstream's `dataId` falls back to the bare id when the label is empty).

## Sibling surfaces

- Writers: turndown `mentions` rule (unchanged); `CommandSuggestionList.svelte` OCU and native insertion (already put `|label` in the id; unchanged).
- Reader callers that all reach the same callback: `Chat.svelte` `restoreChatInput` (draft), the URL/`event.data.text` paths, `editQueuedMessage`, `Messages` `setInputText`, and `MessageInput.svelte`'s own `setText` call. One fix covers all; the tests target the component, not each caller.
- Consumers of the sent text: OCU filter `_SKILL_MARKER_RE` (requires `|`), backend `SKILL_MENTION_RE` / `SKILL_MENTION_STRIP_RE` (`|label` optional). Unchanged.
- Display of sent messages: `MentionToken.svelte` reads the label from the marker; unchanged.
- Channel input: `src/lib/components/channel/MessageInput/MentionList.svelte:92` also writes `|label` into the id (`<@U:id|label>`) and uses the same reader, but `channel/MessageInput.svelte` calls `setText` only with `''` (`:558`), so no channel text is ever rebuilt. Its backend (`utils/channels.py` `extract_mentions` / `replace_mentions`) already accepts `|label`. Unaffected.

## Seams under test

- The component boundary: mount `RichTextInput` in jsdom, call its exported `setText(text)`, and read the markdown the component reports through `onChange` (`{ md }`), which is what `MessageInput` stores as `prompt`. Mount requirements:
  - pass `suggestions` with at least one `{ char: '$' }` entry, as `MessageInput.svelte:1346-1533` does; the `Mention` extension is registered only when `suggestions` is non-empty (`RichTextInput.svelte:818-830`), and without it the span parses as plain text and the test is red for the wrong reason;
  - provide the `i18n` context, as `SlashCommands.test.ts` does with `createClassComponent`;
  - wait until the editor exists before calling `setText` (it returns early at `:483` otherwise);
  - assert the `md` of the last `onChange` call after `setText`.
- The browser: draft restore through a page reload, then the `/api/chat/completions` request body.

## Required evidence

- jsdom test, red on `origin/main` and green after: each input below set with `setText`, then the reported `md` equals the expected output.
  - `<$ocu--invoice-builder|发票生成> 做发票` → same text; the mention span shows `$发票生成`.
  - `<$ocu--invoice-builder|发票"生成>` → same text; the span's `data-label` is `发票"生成`.
  - `<$native-skill|Native skill> and <$plain-id>` → same text (the native and unlabelled forms; red only for the native part).
  - `</ocu--invoice-builder|发票生成>` → `<$ocu--invoice-builder|发票生成>` (closing form; before the fix it yields `<$ocu--invoice-builder>`).
  - `a < b & c` → same text (plain-text escaping kept).
- Browser case in `e2e/ocu-skill-display-name.e2e.ts`: pick the uploaded skill from `/` (display name `发票生成`), type text, poll sessionStorage `chat-input` until its `prompt` contains `<$ocu--invoice-builder|发票生成>` (the draft write is debounced 500 ms, `Chat.svelte:4047-4050`), reload the page so the draft is restored, check the chip reads `$发票生成`, send, and assert the request's `user_message.content` contains `<$ocu--invoice-builder|发票生成>`. The chip check only proves the restore went through the editor (the chip reads `$发票生成` even with the bug); the request body is the assertion that detects the defect.
- Existing `SlashCommands.test.ts`, `MentionToken.test.ts` and the display-name e2e cases green.

## Non-goals

- `&` in a label (Decision 3).
- Any change to the OCU filter, backend regexes, marker format or the turndown rule.
- A browser case for the queued-message edit path: it reaches the same callback, which the jsdom test covers.

## Review focus

- The diff in `RichTextInput.svelte` matches upstream `14956af03f` plus the escaping, and nothing else.
- Escaping applies to both attribute values and not to the chip text.
- The round-trip test asserts the reported `md`, not the HTML passed to `setContent`.
