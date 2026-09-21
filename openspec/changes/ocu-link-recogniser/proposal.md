# Proposal

Issue type: feature
Fixture level: compact
Upstream suggested level: expanded (override: this slice is the declared Minimal mergeable slice — pure `recogniseOcuLink` + Vitest, no Chat.svelte. The expanded trigger is the click-handler half, deferred to #32.)
Blast radius: a foreign-host match opens the sidebar on attacker-controlled HTML; a missed matching link leaves the filter-generated preview as a plain navigation.
Selected risk packs: Public API / CLI / script entry
Evidence floor: Vitest foreign host / other chat id / matching filter-generated link; `make test-frontend`.

`design.md` omitted (compact).

## Why

Filter-generated preview links (`{PUBLIC_BASE_URL}/files/{chat_id}/{path}`) must open the sidebar on that file. Recognition is a pure function so Chat.svelte (#32) only delegates clicks.

## What Changes

- `src/lib/utils/ocu-links.ts`: `recogniseOcuLink(href, base, chatId) -> path | null`. Accept only when the URL is under `base` (the configured `/ocu` PUBLIC_BASE_URL, no trailing slash) and the path is `/files/{chatId}/…`. Return the file path relative to that chat. Foreign hosts, other chat ids, missing chat segment → `null`.
- `src/lib/utils/ocu-links.test.ts`: foreign host; other chat id; matching `{base}/files/{chatId}/report.html`.

No Chat.svelte click handler (#32). No Playwright (#32/#36).

## Capabilities

### New Capabilities

- `ocu-link-recogniser`: pure URL → file-path recognition for in-message OCU preview links.

### Modified Capabilities

None.

## Impact

- Frontend: `src/lib/utils/ocu-links.ts` + test.
- Downstream: #32 click handler.
