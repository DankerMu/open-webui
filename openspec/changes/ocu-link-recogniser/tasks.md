# Tasks

Issue #31 / Plan 1 group 17, first slice of 17.2 + 17.3 Vitest.

Selected: Public API / CLI / script entry — the recogniser is the public function the click handler will call.

Not selected: Auth (no network); Config; Schema; File IO; Concurrency; Resource limits; Legacy; Release; Error handling; Documentation.

- [ ] 17.2a Add `src/lib/utils/ocu-links.ts` exporting `recogniseOcuLink(href: string, base: string, chatId: string): string | null`. Match only URLs whose origin+prefix equals `base` (PUBLIC_BASE_URL, no trailing slash) and whose path is `/files/{chatId}/<rest>`. Return `<rest>` (the file path). Otherwise null. Do not touch Chat.svelte.
- [ ] 17.3a `src/lib/utils/ocu-links.test.ts`: `https://evil.example/ocu/files/C/x.html` with base `/ocu` or `http://webui/ocu` → null; same host/base but other chat id → null; `{base}/files/{chatId}/report.html` → `report.html`. `make test-frontend`.

Non-goals: click handler (#32); Playwright A-T06/A-T11 (#32/#36).
