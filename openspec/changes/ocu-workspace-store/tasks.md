# Tasks

Issue #28 / Plan 1 group 15, tasks 15.1–15.2.

Selected: Public API / CLI / script entry — client hits the four workspace routes. Auth / permissions / secrets — every call sends `X-Requested-With: ocu-workspace`. Concurrency / shared state / ordering — generation drop, per-chat dirty, monotonic revision.

Not selected: Config; Schema; File IO; Resource limits; Legacy; Release; Error handling (HTTP mapping stays with the routes); Documentation (Verification Matrix is #8/#36).

- [ ] 15.1 Add `src/lib/apis/ocu/index.ts` (`getWorkspace` GET describe, `launchWorkspace` POST launch, `refreshWorkspace` POST refresh, `putWorkspacePrefs` PUT prefs) using `WEBUI_API_BASE_URL` like other clients. Every request MUST send `X-Requested-With: ocu-workspace`. Add `src/lib/stores/ocu.ts` as a chat-keyed writable (pattern `chatRequestQueues`): per chat `status`, `revision`, `dirty`, selected view/file, `generation`. Helpers: `beginGeneration(chatId)` returns the generation used for an in-flight request; `applyDescribe(chatId, generation, body)` no-ops when generation is stale; `markDirty(chatId)`; `applyRevision(chatId, revision)` keeps the higher value. Do not import `artifactContents`.
- [ ] 15.2 Vitest (`src/lib/apis/ocu/index.test.ts` and/or `src/lib/stores/ocu.test.ts`): each of the four client functions includes the header; a late `applyDescribe` with an older generation leaves the other chat's state unchanged; `markDirty` is per chat; out-of-order `applyRevision` keeps the highest; the store does not write `artifactContents`. `make test-frontend`, `make typecheck`, `make lint-scoped`.

Non-goals: components (#29/#30); Chat.svelte (#32); link recogniser (#31).
