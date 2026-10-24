## Why

#631. After #617 (OCU `ec5698c`, fork #630), OCU lists a file whose name holds a backslash or a byte that is not UTF-8 with `unsupported_name: true`, `url: null` and a display `path` (a backslash name keeps its real path, `a\b.html`). `workspaceFileUrl` returns `''` for such an entry (`src/lib/apis/ocu/index.ts:62`).

Link resolution (`resolvePath`, `src/lib/components/chat/workspace-reconciliation.ts:577-597`) matches only by URL equality with `encodedFileUrl('/ocu', id, encodedPath)`, so a chat link `/ocu/files/<chat>/a%5Cb.html` never matches the listed entry. The page reader's stop condition (`windowReady`, `:257-272`) checks the same URL in a set built from `file.url` (`appendPage`, `:292`), which is `null` for the entry, so the click reads every page; the result is `absent` and the notice "Selected file was removed" (`:654-659`), while the row is listed with its "Unsupported name" marker.

## What Changes

In the fork, `workspace-reconciliation.ts` only:

- When no URL match exists, a listed entry marked `unsupported_name` matches a link when its display `path` equals the link path decoded once (`decodeURIComponent` per segment). Such a match resolves as `found`, so the existing selection path selects the entry and shows its no-action fallback and reason.
- The page reader's "wanted path seen" condition uses the same match: one predicate over the read `files`, not an extended URL set, so all three places that build the seen set (`:292`, `:316`, `:336` on the 304 path) are covered and a link to a marked entry stops paging on the page that holds it.
- A link whose path does not decode (`URIError`, e.g. percent-encoded bytes that are not UTF-8) keeps today's URL-only behaviour; it cannot match a marked entry.

Must preserve: URL-equality matching for every entry with a URL; double-decoding is still rejected (the decoded link path is compared only with marked entries' display paths and is never used to build a URL); "Selected file was removed" for a path that is truly absent; `recogniseOcuLink`, `workspaceFileUrl` and the OCU display-form format unchanged.

Accepted side effects: per-segment decoding lets `dir%2Fa%5Cb.html` match `dir/a\b.html`; display forms can collide between marked entries (decision record `2026-10-23-ocu-unsupported-output-name`), in which case the first match is selected. Both are harmless: the entry is listed and authorized, nothing is fetched and no URL is built.

Non-goals: links whose non-UTF-8 bytes would need mapping to the `\xNN` display form (a model rarely writes them; the row still explains itself when selected); an unencoded backslash link, which the URL parser turns into `/` (`a/b.html`) and which could collide with a real `a/b.html`; the notice lifetime (#615).

## Capabilities

### Modified Capabilities

- `ocu-link-recogniser`: ADDED requirement "A link to a listed unsupported-name entry selects it".

## Impact

The link click selects the listed entry and shows why it cannot be opened, instead of claiming the file was removed, and stops paging once the entry is seen.

## Triage

```text
Issue type: bugfix
Fixture level: compact
Upstream suggested level: absent (issue says S); compact: one module's link matching, no API, schema or file IO change
Blast radius: chat-link selection in the workspace panel
Selected risk packs: Legacy compatibility (URL matching and absent notice unchanged), Error handling (URIError on decode)
Evidence floor: Vitest in workspace-reconciliation tests: (a) backslash link selects the marked entry and (b) three-page stop are red on 72121901d; (c) absent-with-other-marked-entry and (d) undecodable link through clickFileLink are guards green before and after; make test-frontend, make typecheck, make lint-scoped, make anti-drift, make verify-ui-ocu
design.md: omitted at compact level
```
