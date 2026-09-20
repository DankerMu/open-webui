# Postmortems

An incident write-up for a bug that reached where it should not have — a real user, a merged PR, a deployed LAN instance. The point is not the one-line fix; it is _why our process let it through_. Chronology records evidence, not a teaching sequence. A postmortem is not a decision record: records capture deliberate choices and beaten alternatives, postmortems capture failures in hindsight.

## When to write one

Write a postmortem when all three hold:

1. **Subtle** — the mechanism is non-obvious; a careful engineer would re-derive it the hard way.
2. **Systemic** — it escaped because of a gap in tests, tooling, or conventions, not a one-off typo.
3. **Costly to rediscover** — real debugging time was spent and would be spent again.

Files are `NNNN-short-slug.md`, numbered sequentially; register each in the table below.

| #   | Title |
| --- | ----- |

## The three-layer landing contract

Every lesson lands in up to three layers, each **present or explicitly `not applicable` with a one-line reason**:

1. **Prose rule** — an AGENTS.md convention (dated entry in `## Important Development Notes`).
2. **Policy** — a Verification Matrix / testing-policy implication ("this class of change now requires this class of evidence").
3. **Mechanical** — the named test, gate, or config that fails on recurrence. A regression guard must be shown to go red on the reintroduced bug before it counts.

A lesson landed only in prose is not landed. `docs/danger-patterns.md` is created only once ≥2 incidents converge on the same defect class — a human call, not a gate.

## Skeleton

```markdown
# Post-mortem NNNN: <one-line incident title>

Status: resolved (<fix reference>)

## Executive summary

<!-- One 30-second paragraph: what broke, root cause in plain words, why it escaped, the durable lesson. Write it last. -->

## Impact

<!-- User-visible symptoms; data/security cost; the explicit boundary of what did NOT happen. -->

## Timeline

<!-- Evidence-driven: log lines, session ids, command outputs — verifiable anchors, not recollection. -->

## Root cause

<!-- One subsection per cause: precise mechanism with file references AND "why existing defenses missed it". -->

## Guardrails added

<!-- Each entry names a mechanism that exists and can be verified by name: a test file, a gate, an AGENTS.md rule. -->

## Lessons

<!-- Generalizable bullets — candidates for danger-patterns once a second incident converges. -->
```
