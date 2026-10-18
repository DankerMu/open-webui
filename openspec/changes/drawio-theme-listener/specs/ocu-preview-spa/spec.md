# Spec Delta

## MODIFIED Requirements

### Requirement: Drawio fullscreen belongs to its preview lifetime

Standalone Drawio fullscreen UI SHALL close when its owning preview stage retires. Explicit file selection and listing-driven auto-selection, rename, revision change or removal SHALL NOT leave the old fullscreen content covering the replacement preview or empty state. Normal close, Escape, render-failure cleanup and retirement SHALL share idempotent completion, restore the prior scrolling state and leave later fullscreen interactions usable. Deferred fullscreen attachment SHALL NOT resurrect a retired preview's UI after its cleanup settles.

Each fullscreen UI's parent-held theme subscription SHALL be removed when that child closes, including icon, Escape, backdrop and stage-retirement paths. Subsequent theme events SHALL NOT call the closed UI. Open UI and surviving parent preview theme updates SHALL continue; unrelated parent subscriptions SHALL remain intact.

#### Scenario: Explicit file selection retires fullscreen

- **WHEN** diagram A is fullscreen and the mounted file selector selects diagram B
- **THEN** A's fullscreen backdrop, diagram, toolbar and close control are removed and B is visible and usable

#### Scenario: Listing-driven transitions

- **WHEN** fullscreen A is replaced by new-file auto-selection, renamed under the same file_id, refreshed by revision, removed with a replacement, or removed leaving no files
- **THEN** each transition removes A's fullscreen UI and presents the reconciled selection or empty state

#### Scenario: Normal and repeated close paths

- **WHEN** fullscreen is closed by its close button or Escape, or repeatedly opened and retired through selection changes
- **THEN** prior scrolling state is restored, no stale fullscreen nodes remain, and another fullscreen can be opened and closed without duplicate-destroy errors

#### Scenario: Retirement overlaps fullscreen attachment

- **WHEN** the preview retires while its fullscreen body attachment is pending
- **THEN** cleanup settles without stale UI reappearing, affecting a newer preview or producing an unexpected browser error

#### Scenario: Theme changes across child close

- **WHEN** theme changes while fullscreen is open, then after icon, Escape or backdrop closes it
- **THEN** the open popup receives the change but the closed popup receives no later theme callback
- **AND** the surviving parent preview and its unrelated listeners remain responsive

#### Scenario: Repeated and retired child subscriptions

- **WHEN** fullscreen is repeatedly opened and closed or its owning preview stage retires, followed by parent theme events
- **THEN** none of the closed child callbacks remain registered or receive those events
- **AND** later fullscreen UI and existing stage-retirement behavior remain usable
