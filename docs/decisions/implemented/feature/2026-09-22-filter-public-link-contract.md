---
id: 2026-09-22-filter-public-link-contract
title: Strict public base and concrete file previews
kind: feature
status: implemented
date: 2026-09-22
supersedes: none
references: Plan 1 D15, DankerMu/open-webui#11, 2026-09-21-ocu-mcp-service-credentials
---

# Strict public base and concrete file previews

## Problem

The filter consumes the public base from OCU, while OCU configuration silently removes trailing slashes. Preview-shell buttons do not identify the concrete artifact required by the sidebar file-link contract.

## Decision

OCU rejects a configured PUBLIC_BASE_URL ending in `/` before serving, including before the multi-worker supervisor. The server owns this check; the filter does not introduce another public-base configuration. Internal ORCHESTRATOR_URL remains trailing-slash tolerant.

Filter preview decoration points to the first concrete current-chat file URL under the public base. Browser-tool results without a concrete file receive no preview/archive decoration; workspace controls and refresh events own that flow. Archive links retain their separate toggle and cookie path.

The user selected both behaviors explicitly. Internal credentials remain process-env-only; authenticated responses supply public link metadata, and redirects cannot forward the credential.

## Alternatives considered

- **Keep public-base normalization** — hides a configuration error rather than satisfying the user-selected startup rejection.
- **Validate by contacting OCU during filter startup** — adds a startup network dependency at the wrong configuration owner.
- **Keep preview-shell links** — preserves no-file buttons but fails the selected concrete-file target contract.

## Consequences

Remove a trailing slash from deployment PUBLIC_BASE_URL before rollout and configure the proxied `/ocu` base. No hard `/ocu` suffix rule is added for development URLs. Old no-file preview decoration is intentionally removed, not replaced by an invented artifact. Docker evidence remains deferred to consolidated epic acceptance by user instruction.
