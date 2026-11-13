# Tasks

## 1. Round-trip fix in `setText`

- [x] 1.1 Backport upstream `14956af03f` and escape the attribute values in `setText` (`src/lib/components/common/RichTextInput.svelte`), with a jsdom round-trip test and one browser case.
  - **Fix.** In the `setText` replacement callback, write `data-id="{id}|{label}"` when the marker had a label (design.md Decision 1) and replace `"` with `&quot;` in the `data-id` and `data-label` values (Decision 2). Both go inline in the existing `return` template line, so the file does not grow (`make lint-scoped` size ratchet); no other line of the file changes.
  - **Unit test.** New `src/lib/components/common/RichTextInput.test.ts` (`@vitest-environment jsdom`). Mount the component as design.md § Seams under test requires (`suggestions` with a `$` entry, `i18n` context, editor ready), call `setText`, and assert the `md` of the last `onChange` call for each input in design.md Required evidence, including the closing form. Run it against the unchanged source first and record that it fails.
  - **Browser case.** Add one test to `e2e/ocu-skill-display-name.e2e.ts` per design.md Required evidence (wait for the debounced draft in sessionStorage, reload, chip, then the request body). Save a screenshot `ocu-skill-draft-label.png` under the evidence directory.

  Verify with: `make test-frontend` (or the vitest file directly), `make typecheck`, `make lint-scoped`, `make coverage-gate PART=frontend`, `make verify-ui-ocu-repeat SPEC=e2e/ocu-skill-display-name.e2e.ts REPEAT=1` or `make verify-ui-ocu`.

  Task 1.1 required evidence (issue #808; input → expected output):
  - **Fixture level and risk packs.**
    - Level: expanded (design.md: shared reader of the chat-input format, six callers).
    - Selected packs:
      - Schema / format: the marker round trip; the jsdom inputs in design.md Required evidence, each `setText(t)` → `md === t`;
      - Legacy compatibility: native `<$native-skill|Native skill>`, unlabelled `<$plain-id>` and plain text `a < b & c` round-trip unchanged; existing `SlashCommands.test.ts`, `MentionToken.test.ts` and the display-name e2e cases stay green; the diff is the upstream line plus escaping, for rebase;
      - Error handling: the defect is a silent loss; the browser case proves the restored draft sends `<$ocu--invoice-builder|发票生成>`, and the jsdom test is red before the fix.
    - Not selected:
      - Auth / permissions: no request or authorization path changes;
      - File IO, concurrency, resource limits: none touched (sessionStorage drafts keep their format);
      - Public API: the marker format and every backend/OCU consumer are unchanged;
      - Documentation: `docs/uploaded-skills.md` describes the `/` flow, which already works; no user-visible rule changes;
      - Config / project setup, Release / packaging: no config, dependency or build change.
    - Governing invariant: design.md § Governing invariant.
    - Sibling surfaces: design.md § Sibling surfaces; the queued-edit path is covered by the component test (design.md Non-goals).
  - **Red run.** The implementer reports the jsdom test failing on the unchanged `RichTextInput.svelte` for the labelled inputs (`<$ocu--invoice-builder>` serialized instead of `<$ocu--invoice-builder|发票生成>`), and passing after.
  - **Browser evidence.** The new case passes, its screenshot shows the restored chip `$发票生成` or the sent bubble, and the collected console errors are zero.
