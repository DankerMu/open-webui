# Design

## Context

The recovery fixture updates process-global `os.environ`, while its teardown only removes temporary files. Later integration commands inherit that environment. See proposal.md for the failure boundary.

## Goals / Non-Goals

- Governing invariant: after a recovery test lifecycle, the complete environment equals its entry snapshot, including previously absent keys.
- Fake Docker remains active throughout successful setup and the test body.
- Preserve recovery database behavior, fake command semantics and all five workspace integration consumers.
- Non-goals: production changes, consumer executable overrides, fake parser expansion, skips, filtering the canonical acceptance run, or repairing the separate sweep-lock issue #445.

## Decisions

- Use the existing unittest environment-patch and cleanup convention. Register restoration immediately when mutation begins, before fallible setup work.
- Prefer standard `patch.dict` plus unittest cleanup over a bespoke snapshot/restore helper; both added and overwritten keys must be restored.
- Exercise the fixture through unittest's runner, rather than manually calling teardown: unittest skips teardown on setup failure but always runs registered cleanups.
- Regression coverage belongs beside the existing recovery fixture; avoid a duplicate fixture implementation.
- Parent owns semantic RED/GREEN and acceptance execution. This is process-level custody, not an OS-enforced verifier enclave.

## Required Evidence

- Normal completion: fake executable active in body; complete entry environment restored afterward.
- Body exception: expected test error remains visible; complete environment restored.
- Setup failure after mutation: injected setup error remains visible; complete environment restored without relying on teardown.
- Sequential smoke: run the recovery fixture, then bare `docker ps --format` against the real local engine; no fake executable resolution or parser error.
- Canonical `python -m pytest tests/ -q --import-mode=importlib`: all five unchanged real-Docker cases execute without fake-parser failures. Record every result, skip and remaining failure; #445 is not a green full-suite result.

## Risks / Trade-offs

- Global patching is not thread isolation → retain serial unittest semantics; do not add parallel fixture execution.
- Setup failure can bypass temporary-directory teardown → register existing owned resources with cleanup if needed; no unrelated resource refactor.
- Full-root execution requires an isolated real server and full sandbox image → use owned resources and exact cleanup, never global prune or LAN access.
- Sibling surfaces: fake_env producer, recovery fixture, subsequent integration subprocess consumers, unittest failure cleanup. Audit these without changing consumer contracts.

## Migration

No runtime migration. Revert the paired test-infrastructure change if required; retain the regression evidence and separately track unresolved root-suite failures.
