## Why

When a native skill is picked from the chat input's `/` menu, the mention is serialized as `<@{id}|{name}>` instead of `<${id}|{name}>` (#771). The chat input's `/` suggestion `command` inserts the node with `attrs: props` (`src/lib/components/chat/MessageInput.svelte:1418-1428`). That replaces the `mentionSuggestionChar` TipTap's default command adds, so the turndown rule falls back to `@` (`RichTextInput.svelte:116-125`). The backend patterns match only `$` and `/` (`middleware.py:2271`, `:2293`). As a result:

- the skill is not in `mentioned_skill_ids` (`:2732`);
- the `/` `onSelect` does not add it to `skill_ids` either, so it is not loaded;
- the raw `<@…>` marker reaches the model.

The user sees the skill as selected while the reply ignores it. Upstream fixed this in `open-webui/open-webui` `c402acb404` (upstream #31429), a single changed line.

## What Changes

- Backport `c402acb404`: the `/` `command` inserts `attrs: { ...props, mentionSuggestionChar: '/' }`.
- The OCU stub model's reply also names every `<skill name="…">` block it sees in the system message. This lets a browser case prove the skill content was injected. A reply with no such block is unchanged.
- A Playwright case in `e2e/ocu-skills.e2e.ts` selects a native skill from `/` and sends it to the stub model.
- The `ocu-uploaded-skills` task 7.1 note that recorded this behaviour as out of scope is updated.

## Triage

```text
Issue type: bugfix (upstream backport)
Fixture level: standard
Upstream suggested level: absent (follow-up issue)
Blast radius: native skills picked from the chat `/` menu silently not loaded; raw markup sent to the model
Selected risk packs: Legacy compatibility
Evidence floor: Playwright case red before and green after; stub reply pytest red before and green after; make test-frontend; make verify-ui-ocu
```
