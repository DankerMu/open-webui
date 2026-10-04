# Proposal

## Why

Issue #180 supplies the display model consumed by the sidebar tree and selected-file bar. Loaded broker files need deterministic directory groups and icon kinds without modifying listing order, file identity or workspace state.

## What Changes

One pure module and paired tests under chat components: build folder/file rows and classify display kinds. No component caller yet; #181 and #182 consume the exported shapes. No size formatter, DOM, Svelte or store import.

## Capabilities

### Modified Capabilities

- `ocu-workspace-files`: add deterministic loaded-file display grouping and kind rules.

## Impact

No network, selection, preview eligibility, server listing or persistence change. The upstream FileNav filename-to-icon resolver is a different contract: this slice consumes broker type/MIME and returns seven display kinds, not icon names or filename overrides. Do not copy or modify that resolver.

## Fixture Contract

Issue type: feature. Fixture level: compact, agreeing with isolated pure-module scope; design.md omitted. Blast radius: display row identity/order/counts and downstream icon selection. Selected risks: exported shape, field semantics, partial-page ordering, compatibility, empty/unknown inputs and documentation. Evidence floor: literal expected rows across every issue case, per-file coverage, scoped static checks, direct module smoke and clean exact-head full frontend/coverage CI. No filesystem/path authorization, config, secrets, concurrency, quotas or packaging behavior is introduced.
