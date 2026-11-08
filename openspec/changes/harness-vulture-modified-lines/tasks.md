## 1. Line-scoped vulture gate

- [ ] 1.1 Add `expect_accept_with` and the guardrail cases (a)-(k) from design.md to `scripts/test-guardrails.sh`, with a stand-in `uv` and `--only vulture`. Cases (a)-(d), (i) and (j) must fail on `main` @ `e5da5be3b`. (e), (f), (g) and (h) reject or accept as stated both before and after. `--only vulture` does not exist on `main`. The red proof therefore runs on `main` plus only the `--only vulture` parsing and step gating: under `--only vulture`, jscpd and knip are skipped. The old vulture step runs when `$only` is empty or `vulture`, with its old invocation and verdict unchanged. On that tree (a)-(d), (i) and (j) fail, and (e)-(h) and (k) behave as stated.
- [ ] 1.2 In `scripts/anti-drift.sh`, add `--only vulture`, hoist the shared preamble (temp dir and trap, base, scope, `fork_lines`), and apply the vulture outcome, alias-line and classification rules.
- [ ] 1.3 Add a vulture row to `docs/agents/enforcement-baseline.md` with the same target as the knip row, and state the deleted-use blind spot.
- [ ] 1.4 Run `make test-guardrails`, `make anti-drift`, `make lint-scoped`, `make doc-gate`, and `make anti-drift` on #772's branch rebased onto this one. Every one passes.

Risk packs:

- Error handling / fail-closed — selected: a gate that misreads vulture's exit or output would pass silently. Cases (b)-(d) and (i).
- Legacy compatibility — selected: A files and fork-touched M lines still block; knip and jscpd are unchanged. Cases (e)-(h), (j) and the unchanged knip cases.
- Public API / CLI, Config, Schema, Auth/secrets, Concurrency, File IO, Resource limits, Release — not selected: the script's interface and exit codes are unchanged, and nothing touches product code.
- Documentation — selected: the baseline doc states the gate's target. Covered by task 1.3 and `make doc-gate`.

Suggested fixture level: expanded
Minimal mergeable slice: atomic
