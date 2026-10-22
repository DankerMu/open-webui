## Why

#595, found in #173 rows B-T07 and B-T13 on WebUI `1b4ad1f61`: in the non-maximized workspace sidebar, when the Office status bar also shows "Workspace file changed" and the Save / Version history / Maximize / Close editor buttons, the status word "Conflict" wraps one letter per line (C / o / n / fl / i / c / t). That makes the row very tall.

Cause, from two rules together:

- `src/app.css:21` sets `html { word-break: break-word; }`, and nothing between `html` and the status bar resets it. In this legacy mode browsers wrap text as if `overflow-wrap: anywhere` were set, so a break may fall between any two letters, and those breaks count toward the element's min-content width. The observed `C / o / n / fl / i / c / t` (the `fl` ligature kept whole) is that per-letter breaking.
- `src/lib/components/chat/OfficeEditorStatus.svelte:79`: `<p class="min-w-0 flex-1" role="status">` sits in a `flex flex-wrap` row (`:76`). `min-w-0` with a zero flex basis (`flex-1`) lets the paragraph shrink to whatever space is left on its line, so it narrows instead of the row wrapping.

Removing `min-w-0` alone would not fix it. Under the inherited `word-break: break-word`, the automatic minimum (min-content) is one letter wide.

## What Changes

- **Status row `<div>` at `OfficeEditorStatus.svelte:76`:** add `[word-break:normal]`. Words inside the bar then break only at spaces, and min-content becomes the longest word again. This covers both the status paragraph and the "Workspace file changed" notice paragraph at `:80`, which can also shrink (`flex: 0 1 auto`). The buttons are all `shrink-0` and need no change. The arbitrary-property form is used because in Tailwind v4 `break-normal` resets both `overflow-wrap` and `word-break`.
- **Status paragraph at `:79`:** change `min-w-0 flex-1` to `min-w-0 flex-auto break-words`.
  - `flex-auto` sizes the paragraph from its full text, its max-content width. The wrapping row therefore moves the paragraph, or the controls after it, to a new line instead of squeezing it.
  - `min-w-0` remains so that the paragraph never grows wider than the bar when its text alone is longer than one line. In that case the text wraps at spaces.
  - `break-words` (`overflow-wrap: break-word`) lets a single token wider than the whole bar, such as a long `Failed: <reason>`, break inside the bar instead of overflowing.
- **`OfficeEditorStatus.test.ts`:** a component test asserts these classes. jsdom has no layout, so the visual result is proven in a real browser with the app's real stylesheet (task 2.3).

`design.md` is omitted (compact fixture).

## Capabilities

### New Capabilities

- `ocu-office-workspace-ui` (in flight: defined by the unarchived `ocu-office-editing` change and absent from `openspec/specs/`; same path reused, following `archive/2026-10-15-ocu-office-native-delivery/proposal.md:19`): new requirement "Status word never breaks between letters". ADDED is safe whichever change archives first because the requirement name is unique.

## Impact

- The status bar in the default-width sidebar shows "Conflict", "Unsaved", "Saved" and the "Failed: …" texts on one line, and its controls move to the next line when space runs out. The maximized editor is unaffected; it was already wide enough.

## Triage

```text
Issue type: bugfix (cosmetic)
Fixture level: compact
Upstream suggested level: absent (issue says XS)
Blast radius: two class attributes in one component
Selected risk packs: UI layout (the status bar at the sidebar's default width)
Evidence floor: component test; real-browser layout check at the default sidebar width; make test-frontend; make lint-scoped
```
