---
id: 2026-10-12-isolated-browser-optimizer-cache
title: Isolate browser verification optimizer generations
kind: testing
status: implemented
date: 2026-10-12
supersedes: none
references: issue-251, 2026-09-25-ocu-cookie-gateway-and-paired-smoke
---

# Isolate browser verification optimizer generations

## Problem

A live Vite frontend can retain optimizer metadata and transformed modules while another frontend replaces shared dependency files. Relative chunk imports absent from retained metadata can inherit different importer URL queries, evaluating selection registration code twice against one registry. Separate optimizer ownership prevents this demonstrated shared-generation failure.

## Decision

`vite.config.ts` selects `OCU_UI_VITE_CACHE_DIR` only when `OCU_UI_PROXY_HARNESS === 'true'`; a missing or empty value fails configuration loading. `scripts/verify-ui-ocu.py` supplies `vite-cache` beneath its existing private run scratch. The same run owner closes its services before removing scratch, including the cache; no additional cleanup lifecycle is introduced.

Non-harness callers retain Vite's existing cache policy even when the cache environment variable is populated. The harness does not clear, delete or migrate the default frontend's cache. Gateway authentication and paired acceptance remain independent decisions.

## Alternatives considered

- **Force default-frontend restarts** — discards the retained state instead of separating mutable optimizer ownership.
- **Suppress registration guards or deduplicate packages** — changes library behavior or dependency identity rather than the shared-cache boundary.
- **Clear the global cache** — destroys optimizer state owned by another running frontend.

## Consequences

Each owned browser run builds a private optimizer generation. `e2e/vite-cache.e2e.ts` loads the actual repository configuration and evaluates installed Tiptap/ProseMirror dependencies in real disposable Vite servers. Cold default/owned and cached-default controls precede a fresh page after invalidating the retained default server's module graph; every stage requires visible completion and no page errors. Missing and empty cache prerequisites are checked at configuration loading with a valid SvelteKit output prerequisite.

The browser fixture proves the generation-replacement mechanism, not the exact original timing or universal reproduction. It does not fix independent watcher behavior or certify LAN deployment. Shared-runtime structure in revisions predating #153 does not identify the commit introducing the exact failure.
