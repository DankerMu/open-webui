---
id: 2026-09-20-ocu-cross-repo-home
title: Workspace integration epic lives in the WebUI repo
kind: architecture
status: implemented
date: 2026-09-20
supersedes: none
references: docs/plans/2026-09-20-workspace-artifact-integration.md; openspec/changes/ocu-workspace-integration design D2; DankerMu/open-webui#3
---

# Workspace integration epic lives in the WebUI repo

## Problem

Plan 1 work packages span the WebUI fork, the OCU server, and the OCU deploy overlay. Authorization through the reverse proxy and generated-content isolation are observable only when both codebases and the overlay run together, so a home for the OpenSpec change and epic has to be chosen.

## Decision

The OpenSpec change and epic live in `DankerMu/open-webui`. Every task and issue title carries `[webui]`, `[ocu]` or `[deploy]`. `[ocu]` and `[deploy]` work lands in the sibling `DankerMu/open-computer-use` checkout (branch `codex/plan1-<slug>` off OCU `main`); OCU tests live in that repo's root `tests/`. Existing untracked `deploy/` and `docs/decisions/` in OCU stay there.

## Alternatives considered

- **A second OpenSpec change in the OCU repo** — splits one acceptance matrix into two halves that each cannot go green.
- **Copying the overlay proxy config into this repo** — duplicates the overlay and breaks ownership of deploy artifacts.

## Consequences

Cross-repo verification (proxy smoke, iframe isolation) needs the sibling checkout. CI that depends on overlay config pins that repo's SHA in this repo's `constraints.yaml`; overlay changes that the smoke depends on cost a pin bump here. `[ocu]` / `[deploy]` issue bodies name the sibling checkout and branch.
