# Legacy violation baseline

Detail for [AGENTS.md § Enforcement Index](../../AGENTS.md#enforcement-index).
The removal trigger and precondition of the baseline stay in `AGENTS.md § Legacy violation baseline (temporary)`; the numbers below are the frozen counts that trigger refers to.

## Frozen counts

| Gate                                       | Baseline (upstream, advisory)            | Next milestone target                                       | Owner            |
| ------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------- | ---------------- |
| Files > 800 lines                          | 75                                       | no fork-touched file grows while over the limit             | fork maintainers |
| Functions with complexity > 15 (ruff C901) | 110                                      | 0 in fork-added files; no increase in touched files         | fork maintainers |
| ruff errors (current config)               | 2594                                     | 0 in fork-added files; no increase in touched files         | fork maintainers |
| Backend line coverage                      | 0% (gap 80)                              | ≥ 80% per fork-added file; modified upstream files advisory | fork maintainers |
| svelte-check errors (repo-wide ceiling)    | 7789                                     | never rises; lower the ceiling in the same PR when it drops | fork maintainers |
| Repo-wide eslint                           | crashes on upstream `AskUserCard.svelte` | eslint runs per file on the change scope only               | fork maintainers |
| knip dead exports (scoped) | advisory list printed by anti-drift | 0 in fork-added files and on fork-touched lines | fork maintainers |
