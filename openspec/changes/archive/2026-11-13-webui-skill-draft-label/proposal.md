## Why

Issue (#808). When the chat input's text is put back into the editor (draft restore from sessionStorage, editing a queued message, and the other `setText` callers), a skill mention loses its `|label`. `<$ocu--invoice-builder|发票生成>` comes back as `<$ocu--invoice-builder>`. The OCU filter requires the `|label` (`computer_link_filter.py` `_SKILL_MARKER_RE`), so it does not add the "read this skill" sentence. The native fallback then strips the marker to an empty string. The user still sees the `$发票生成` chip, gets no error, and the model never learns which skill was picked.

The defect is inherited from upstream v0.11.3 (`RichTextInput.svelte` `setText`). Upstream fixed it in `open-webui/open-webui` commit `14956af03f2ba50a154b13ff77166139fdcc0315` (upstream PR 32690): `setText` writes `{id}|{label}` back into `data-id` when the marker has a label. This change backports that edit, written inline in the existing `return` line because the file may not grow (design.md Decision 1), and adds attribute escaping, because a display name may contain `"` (`routers/ocu_skills.py` display-name rules allow it), which would cut both attributes short.

Triage:

```text
Issue type: bug
Fixture level: expanded
Upstream suggested level: absent (issue estimates size S)
Blast radius: every caller that puts serialized chat text back into the editor; a wrong rebuild changes what the next send carries, silently
Selected risk packs: Schema / format (marker round trip), Legacy compatibility (native, unlabelled and closing-form mentions; upstream rebase), Error handling (silent loss is the defect)
Evidence floor: red-then-green jsdom round-trip test through the component; one browser case for draft restore; existing slash/mention tests green
```

Expanded rather than compact: `setText` is the reader half of the chat-input serializer, shared by six callers (`Chat.svelte` draft restore, URL/postMessage text, queued-message edit, `Messages` `setInputText`, and `MessageInput.svelte`).

## What Changes

- `setText` in `src/lib/components/common/RichTextInput.svelte` rebuilds a labelled mention with `data-id="{id}|{label}"`, as upstream `14956af03f` does, so serializing the rebuilt editor yields the original marker.
- The `data-id` and `data-label` values that `setText` writes are escaped for an HTML attribute, so a label containing `"` survives the round trip in full.
- Nothing else changes: the turndown `mentions` rule, the marker format `<$ocu--{name}|{label}>`, the OCU filter, the backend regexes and the slash-menu insertion stay as they are.

`design.md` records the invariant, sibling surfaces and evidence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `chat-skill-mention-parsing`: adds the requirement that text put back into the chat input keeps every skill mention's label.

## Impact

- `src/lib/components/common/RichTextInput.svelte` (upstream file; minimal diff, backport reference in the PR).
- New jsdom test next to it, and one browser case in `e2e/ocu-skill-display-name.e2e.ts`.
- No backend, OCU, migration, i18n or documentation change. The user guide describes the `/` flow, not drafts, so it stays accurate.
