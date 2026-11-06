---
id: 2026-11-06-wallpaper-skins
title: Wallpaper skins paint the app from html[data-skin] rules
kind: feature
status: implemented
date: 2026-11-06
supersedes: none
references: openspec/changes/webui-wallpaper-skins, DankerMu/open-webui#732
---

# Wallpaper skins paint the app from html[data-skin] rules

## Problem

Users asked for nine wallpaper styles on top of light/dark, switchable from the main screen (#732). Upstream's only background is the per-user or per-folder chat background. It is visible only in the chat pane because the shell and sidebar are opaque utilities, so a wallpaper cannot show behind the whole app.

## Decision

`src/lib/skins.ts` owns the catalogue and sets `data-skin`, `--skin-image` (`url(/skins/<id>.webp)`) and `--skin-overlay` (one `rgba()` string) on `<html>`. `selectSkin` applies the skin, switches to its suggested mode through `setTheme` in `src/lib/utils/theme.ts`, saves the `skin` user setting with the whole `ui` object and returns whether the save succeeded. The `(app)` layout applies a per-user `localStorage` mirror early, lets loaded settings win and clears the skin in `onDestroy`.

`SkinNavButton.svelte` sits beside the workspace entry in the chat navbar. It is a palette icon in the existing `Dropdown`, with None plus nine thumbnail tiles. A tile is a button with `aria-pressed`. A click applies the skin and leaves the popover open, and Escape or an outside click closes it. The picker owns the display strings, so the names are literal `$i18n.t()` calls for the parser. It also shows `Failed to update settings` when `selectSkin` resolves `false`.

`src/lib/skins.css` holds the rules. `src/app.css` pulls it in with one `@import` as its first statement, before `@reference`: Vite inlines an `@import` only when it precedes every other statement and otherwise drops it with a log line. The import has no `layer()`, so the rules stay unlayered and beat Tailwind's layered utilities. Every rule is under `html[data-skin]`, so None matches nothing. The rules use existing ids plus one new hook class, `skin-shell`, on the shell div. They do the following:

- The body draws the overlay over the wallpaper, and the shell is transparent.
- The sidebar, the top bar and the chat pane (`#chat-container`) are translucent panels: 72% light and 55% dark. The sidebar and the top bar also get `blur(16px)`, and the mobile drawer is 95%.
- The sidebar fade gradients fade from the panel colour.
- The top bar is visible on the new-chat page too, because otherwise its icons sit on bare wallpaper. A mask fades its blur.
- The message column adds 29% light or 45% dark on top of the pane, so it reaches about 80% light and 75% dark. The input box and non-chat pages (`#main-content > :not(#chat-container)`) have the same 80%/75% backing.
- In light mode the sidebar's `--color-gray-400`/`-500` shift two steps darker and the message list bullets use gray-500. Upstream's section labels (Folders, Chats) and gray-300 bullets assume a white page, and over the dark skins (olive-ops, terrain-grid) they vanished. A higher panel alpha did not fix them.
- ChatControls, modals and dropdowns stay opaque.

Accepted deviations from the design:

- **`#chat-container` panel rule.** The design listed `#chat-container` as a hook but gave it no rule. The pane panel comes from proposal decision 1 ("sidebar, top bar and chat pane become translucent panels"). Without it the new-chat page has no backing and the message column ends in a hard edge.
- **Top bar `visibility: visible` on `/`.** Upstream hides `#navbar-bg-gradient-to-b` without a chat. Under a skin it stays visible so the navbar icons keep a panel.
- **None comparison: light mode, plus a dark mode baseline after one round trip.** Re-applying dark inlines upstream's dark gray variables (`theme.ts`), so the computed colours of a freshly loaded dark page differ from those after any dark skin, whether or not skins exist. In light mode, picking a light skin re-applies light, which inlines nothing, so the unskinned page is the baseline. In dark mode the baseline is taken after one dark skin and None, so the grays are already inlined, and a second round trip must reproduce it exactly.
- **Injected `<a>` for the `/s/` check.** No in-app link to `/s/{id}` is reachable: `SharedChatsModal` passes `shareUrl={false}`. The spec appends a link inside `#chat-container` and checks a same-document marker, which proves the navigation was client-side.

## Alternatives considered

- **Apply the mirror in `src/app.html` before first paint** — `app.html` carries an uncommitted branding change in the working checkout, so it is not touched. A hard reload shows None until the layout mounts.
- **Store the skin per device, like light/dark** — the requester wanted the choice to follow the user. It is a user setting, so two devices are last-write-wins, the same as every other setting saved with the whole `ui` object.
- **Hide upstream's chat background under a skin, or contain it to the chat pane** — an explicit per-user or per-folder background is a more specific choice than a global skin, so it takes precedence app-wide. Its layers (`Chat.svelte:4270-4290`) are absolutely positioned against `.app`, not the chat pane. When one is set it covers the whole app above the skin wallpaper and shows through the translucent sidebar and top bar. Containing the layers to the pane would be a new layout change to an upstream component, so they are left as they are.
- **Also route the desktop `theme:update` handler in `src/routes/+layout.svelte:941-960` through `setTheme`** — that copy of the theme logic is upstream's (present in `2a960a5`) and skins do not need it. It stays as a known duplicate.
- **Put the backing on the message column only** — this left the new-chat greeting and suggestions on raw wallpaper.

## Consequences

Evidence is `e2e/skins.e2e.ts` under `make verify-ui`, with screenshots in `.run/ui-evidence/skins/`:

- three screenshots per skin;
- two `/workspace` pages and `/admin/users`, each taken once its content is visible at full opacity, with the route root's background alpha asserted to be at least 0.75;
- `/admin/settings`, which upstream redirects to the chat page with the admin Settings modal open;
- a light-mode override through Settings › General;
- two mobile drawers.

It also asserts None's computed styles, reload, a second context with its own mode, keyboard operation, sign-out and a client-side `/s/` link. Readability is judged on those screenshots.

Escape closes the picker. Upstream's `MessageInput` window handler then moves focus to the chat input, so focus does not return to the palette button.

Upstream files change by one hook class, the two-line navbar wiring and two lines at the top of `src/app.css` (the import and its comment). `Chat.svelte`, `MessageInput.svelte` and `Sidebar.svelte` are unchanged.
