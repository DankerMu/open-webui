# Proposal

Issue type: feature
Fixture level: compact
Upstream suggested level: compact (agree)
Blast radius: a missing `X-Requested-With` header lets a same-site form post hit launch/refresh/prefs; a late describe applied to the wrong chat paints B with A's files; writing into `artifactContents` rebuilds the iframe on every token.
Selected risk packs: Public API / CLI / script entry; Auth / permissions / secrets; Concurrency / shared state / ordering
Evidence floor: Vitest cases in task 15.2; `make test-frontend`, `make typecheck`, `make lint-scoped`.

`design.md` omitted (compact).

## Why

Issue #7 landed the four workspace routes. The sidebar (#29) needs a chat-keyed store and a client that always sends `X-Requested-With: ocu-workspace`. Nothing exists yet; `artifactContents` is the forbidden place (AGENTS.md note 2, CONTEXT.md).

## What Changes

- `src/lib/apis/ocu/index.ts`: `getWorkspace`, `launchWorkspace`, `refreshWorkspace`, `putWorkspacePrefs` against `/api/v1/ocu/workspaces/{chat_id}` (+ `/launch`, `/refresh`, `/prefs`). Every request includes `X-Requested-With: ocu-workspace` and the session token the same way other `src/lib/apis/*` clients do.
- `src/lib/stores/ocu.ts`: chat-keyed map `{status, revision, dirty, selected view/file, generation}`. Helpers: bump generation and drop late responses; set dirty per chat; apply a describe revision only if it is ≥ the stored one. Never imports or writes `artifactContents`.
- Vitest next to the modules covering the 15.2 cases.

No `ChatControls` / `WorkspaceArtifact` (#29/#30). No `Chat.svelte` event handler (#32).

## Capabilities

### New Capabilities

- `ocu-workspace-store`: chat-keyed workspace client and store with header, generation, dirty, and monotonic revision contracts.

### Modified Capabilities

None.

## Impact

- Frontend: `src/lib/apis/ocu/index.ts`, `src/lib/stores/ocu.ts`, paired tests.
- Downstream: #29 mounts the store; #32 sets dirty from events.
