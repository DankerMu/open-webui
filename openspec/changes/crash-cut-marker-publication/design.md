# Design

## Context

The four cut workers create their final marker before text is ready. Consumers deliberately wait on existence and then assert exact cut text before SIGKILL. The worker scripts also monkeypatch filesystem operations to identify production crash boundaries.

## Goals / Non-Goals

- Governing invariant: the final cut-marker path implies complete exact cut text; marker bookkeeping cannot trigger a production fault hook or advance the tested operation beyond its selected cut.
- Must preserve: all cut names, stop placement, exact read assertions, SIGKILL/returncode checks, subsequent recovery/refusal, inode/revision/bytes conservation and existing child cleanup.
- Non-goals: production changes, dependency/image/CI changes, contention-only markers, test selection changes, sleeps/retries/skips, or the independent pause/read observation tracked in #513.

## Decisions

- Change surface: shared child-protocol code in `tests/orchestrator/_office_store.py`; all four worker strings in the three owning modules; focused behavioral regression and existing README.
- Reuse the existing embedded-child-script convention: one shared source prefix supplies the marker writer to each worker before it installs fault hooks. Avoid importing pytest-heavy helpers inside children or broadening child PYTHONPATH solely for this repair.
- Write the complete text to an owned sibling staging file, close it, then publish atomically on the same filesystem. Preserve the resolution marker's private mode and saved-fsync behavior; use saved primitives so marker work does not enter patched replacement/sync hooks.
- Marker paths are fixture-owned and absent at the cut. Staging files remain within the owning temporary directory; successful publication leaves no staging path. Interrupted staging must not expose a ready marker.
- Keep producers responsible for readiness. Making readers retry empty text would hide the broken contract and change the consumer oracle.
- Sibling surfaces: `_CRASH_WORKER`/`_crash`; `_COPY_WORKER`/killed-final-copy loop; `_RETIREMENT_WORKER`/`_kill_worker_at`; `_RESOLVE_WORKER`/`_kill_resolve`. All migrate atomically; contention-only `_wait_marker` consumers remain unchanged.

## Evidence and Review Focus

- Before repair, execute each actual stop function at a controlled open-before-write seam: final marker exists with empty text for all four; local qualified Linux probe exits1. This supplements the retained complete #446 failures without rerunning them merely to confirm.
- Regression must execute real filesystem publication, hold incomplete staging and observe final-path absence, then release and verify exact text. It must fail against the old direct-publication behavior, not merely because a new helper import is missing.
- Exercise captured uninstrumented publication under armed fault hooks; verify marker contents without incrementing production hook observations or changing the requested cut.
- Run complete publication-recovery, save-as, resolution, shared-store and new-regression modules in the retained Node-qualified Ubuntu/Python3.13 image. Reconcile exact node IDs; all original cut cases remain selected. Preserve/report any #513 failure separately rather than weakening or excluding it.
- Review stage-file ownership, short/partial write handling, publication ordering, captured primitives, resolution mode/sync preservation and all unchanged parent kill/recovery assertions.

## Risks / Trade-offs

Atomic rename visibility is local-filesystem evidence, not power-loss or remote-filesystem certification. Existing child holds and parent readiness deadlines are unchanged. Rollback is a test-only commit revert; no data migration.
