## Context

`Navbar.svelte` and `ChatControls.svelte` are siblings in `Chat.svelte` (both only when not `embedded`, `Chat.svelte:4321`, `:4647`). All workspace entry logic lives in `ChatControls.svelte`: `workspaceActionAvailable` (`:91-94`), `showWorkspace` (`:97-106`), `workspaceChanged` (`:107-108`), `workspaceActionPending`, the `firstSendPending` prop, `openWorkspace` (`:267-289`) and `closeWorkspace` (`:305-311`, `guardOfficeAction`). The navbar `Controls` button (`Navbar.svelte:233-245`) is `size-6` with classes `flex size-6 cursor-pointer items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-50/40 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/40 dark:hover:text-gray-200` and `Knobs className="size-5" strokeWidth="1"`; it is shown only with the controls permission.

## Decisions

### D1. Entry state store

`src/lib/stores/ocu.ts` exports `ocuWorkspaceEntry: Writable<OcuWorkspaceEntry | null>` (initial `null`), with

```ts
type OcuWorkspaceEntry = {
	shown: boolean; // showWorkspace
	changed: boolean; // workspaceChanged
	waiting: boolean; // firstSendPending
	disabled: boolean; // firstSendPending || workspaceActionPending
	toggle: () => void; // shown ? closeWorkspace() : openWorkspace()
};
```

`ChatControls.svelte` sets it reactively to the object while `workspaceActionAvailable`, else `null`, and sets `null` in `onDestroy`. `toggle` reads the current `showWorkspace` when called, not when published. No other writer.

Rejected: positioning a fixed button next to `Controls` (breaks when the navbar shows Temporary Chat / Save Chat / New Chat icons or the controls permission hides `Controls`); moving the logic into the navbar (duplicates `ChatControls` state, touches the upstream file more).

### D2. `WorkspaceNavButton.svelte`

Reads `$ocuWorkspaceEntry`; renders nothing when `null`. Otherwise a `Tooltip` (content `Waiting for chat to save` when `waiting`, else `Workspace Files`) around a `button type="button"` with the `Controls` button's classes, `aria-label` `Workspace Files`, `aria-pressed` = `shown`, `disabled` = `disabled` (plus `disabled:cursor-not-allowed disabled:opacity-50`), `on:click` = `toggle`. Content: `Folder` icon (`src/lib/components/icons/Folder.svelte`, already `aria-hidden`) with `className="size-5" strokeWidth="1"`; when `changed` a `relative`-anchored dot (`absolute right-0.5 top-0.5 size-1.5 rounded-full bg-blue-500`) plus `<span class="sr-only" role="status">Workspace changed</span>`; when `waiting` `<span class="sr-only" role="status">Waiting for chat to save</span>`.

### D3. Navbar placement

`Navbar.svelte`: import and render `<WorkspaceNavButton />` immediately before the controls-permission `{#if}` block (`:233`), outside it, so the entry exists even without the controls permission. No other navbar change.

### D4. Removals in `ChatControls.svelte`

Delete the floating card block (`:319-333`) and both header text-button blocks (`:413-427` mobile drawer, `:557-571` desktop). Keep the `workspaceError` alert (`:334-339`) as is. `openWorkspace`, `closeWorkspace`, `closeHandler`, latches and persistence stay unchanged.

## Risks / Trade-offs

- Toggle while shown closes the panel; before, the entry was not visible while shown. The `Close workspace` header button stays.
- The entry is now visible in more states (panel shown, controls panel shown); tests that asserted its absence while shown are updated to assert `aria-pressed="true"` instead.
- `Navbar.svelte` is upstream: two added lines.
- Mobile: the Controls drawer (`Drawer.svelte`, `fixed z-999` backdrop over the `z-30` navbar) covers the navbar entry, and its header text button is removed, so with the native Controls drawer open the workspace is reached by closing the drawer first. The mobile workspace is drawn in the same drawer, so on mobile it is closed through `Close workspace` or by closing the drawer, not by the entry. A second entry in the drawer is rejected: `Drawer.svelte` has no `aria-modal`/`inert`, so two buttons named `Workspace Files` would both stay in the accessibility tree.

## Evidence plan

a. `WorkspaceNavButton.test.ts`: `null` renders nothing; name `Workspace Files`, `aria-pressed` false/true, click calls `toggle`; `changed` shows dot and visually hidden `Workspace changed`; `waiting` disables, tooltip and visually hidden status; decorative icon has no name.
b. `ChatControls.test.ts`: store published only when `workspaceActionAvailable` (temporary / unsaveable → `null`), cleared on destroy; `toggle` while closed opens and acknowledges the change (existing `:229-247` case rewritten to call the store's `toggle` or render the button), while shown closes through the guard (Office editor open → guard departs before closing); no `Workspace Files` text button remains in the ChatControls DOM; error alert unchanged.
c. Browser, `e2e/ocu-controls.e2e.ts`: rewrite the bounding-box case `:561-590` (desktop and mobile drawer) so it checks the entry's vertical centre within 1 px of the `Controls` button's (once; theme does not change geometry), click opens (`aria-pressed="true"`), click closes; toggle-to-close is checked at desktop size only; at 390 px the case closes the Controls drawer, clicks the entry, asserts the panel opens and closes it through `Close workspace`. Call sites that change: `e2e/ocu-office-fixtures.ts:20-29` (`panel.or(entry)` would match both while the panel is shown; check the panel first and touch `entry` only when the panel is not visible) and `e2e/ocu-office-fixtures.ts:283` (`[aria-label="Workspace Files"]` → `section[aria-label="Workspace Files"]`, else it returns the navbar button and `ocu-office.e2e.ts:347-348` stop testing the overlay). and `e2e/ocu-tree.e2e.ts:47-59` (drop the `Controls` pre-click: on mobile it opens the drawer that covers the entry; the entry is always in the navbar and opens the panel itself). Every other listed call site that clicks `Workspace Files` stays unchanged and green; `ocu-workspace.e2e.ts:228` (count 0 in temporary/unsaveable) stays green.
d. Screenshots: navbar right edge closed and open, light and dark.
