## 1. Line-scoped vulture gate

- [ ] 1.1 Add the guardrail cases (a)-(g) from design.md to `scripts/test-guardrails.sh`, with a stand-in `uv`. Cases (a)-(d) must fail on `main` @ `e5da5be3b`; (e)-(g) pass both before and after.
- [ ] 1.2 In `scripts/anti-drift.sh`, apply the vulture exit-code and parsing rules and the A/M line policy, sharing the M-file line-set code with the knip step.
- [ ] 1.3 Add or update the vulture row in `docs/agents/enforcement-baseline.md` so it states the same target as the knip row.
- [ ] 1.4 Run `make test-guardrails`, `make anti-drift`, `make lint-scoped`, `make doc-gate`, and `make anti-drift` on #772's branch rebased onto this one. Every one passes.

Risk packs:

- Error handling / fail-closed — selected: a gate that misreads vulture's exit or output would pass silently. Cases (b)-(d).
- Legacy compatibility — selected: A files and fork-touched M lines still block; knip and jscpd are unchanged. Cases (e)-(g) and the unchanged knip cases.
- Public API / CLI, Config, Schema, Auth/secrets, Concurrency, File IO, Resource limits, Release — not selected: the script's interface and exit codes are unchanged, and nothing touches product code.
- Documentation — selected: the baseline doc states the gate's target. Covered by task 1.3 and `make doc-gate`.

Suggested fixture level: expanded
Minimal mergeable slice: atomic
