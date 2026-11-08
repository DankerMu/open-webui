## Why

`scripts/anti-drift.sh:43-49` runs vulture over every scoped Python file and blocks on any finding (#773). The knip step (#735) distinguishes two kinds of file:

- in A files (fork-added), every finding blocks;
- in M files (modified upstream), only findings on lines the fork added or changed block, and the rest print as advisory.

The vulture step does not make this distinction. So the first fork change to an upstream Python file fails the required check because of upstream's own dead code. #772 (#769) changes two characters in `backend/open_webui/utils/middleware.py` and gets four upstream unused imports reported as blocking (CI run 42464874940). That contradicts the stated baseline policy: modified upstream files are held to "no worse", and the dead-code target is "0 in fork-added files and on fork-touched lines" (`docs/agents/enforcement-baseline.md`).

## What Changes

- The vulture step in `scripts/anti-drift.sh` follows the knip step's policy:
  - a finding in an A file blocks;
  - a finding in an M file blocks only when its line is one the fork added or changed against the change-scope base;
  - the rest print under an advisory header and do not block.
- vulture's own failure still blocks: exit 1, exit 2, or any non-zero exit other than 3 (findings), and output that does not parse when the exit is 3.
- `scripts/test-guardrails.sh` gets cases proving that the gate still rejects and that the advisory path accepts. They use a stand-in `uv` on `PATH`, because a real `uv run` in the self-test's temp worktree would sync a fresh `.venv`.
- The vulture row in `docs/agents/enforcement-baseline.md` states the same target as knip.

## Triage

```text
Issue type: bugfix (harness gate)
Fixture level: expanded
Upstream suggested level: absent (follow-up issue)
Blast radius: required CI check `All checks passed`; a gate that wrongly passes hides fork dead code, one that wrongly fails blocks every first touch of an upstream Python file
Selected risk packs: Error handling / fail-closed; Legacy compatibility
Evidence floor: guardrail cases red before and green after; make test-guardrails; make anti-drift on this branch and on #772 rebased onto it
```
