## Why

(#664.) Follow-up from (#655), confirmed by reading OCU `main` `058dd36`. Three gaps remain.

**Backup does not quiesce or check `messages-ingress`.**

- `messages-ingress` (`deploy/production-like-test/compose.proxy.yml:30-46`, container `ocu-test-messages-ingress`, proxy image) is the only Compose service on the sandbox network. It forwards sandbox Claude Code requests to `open-webui:8080`.
- In `deploy/recovery_resources.py`, none of the following mentions it:
  - `establish_quiescence`'s writer list (`:500-506`);
  - the admission stop in `_quiesce_and_discover` (`:548-549`);
  - the stopped-check loop (`:599`);
  - the failure-path stop in `_stop_after_office_failure` (`:130`);
  - `deployment_identity` (`:272-292`);
  - `expected_images` / `expected_services` in `_require_stack_matches_runtime` (`:424-441`);
  - `recovery.FIXED_CONTAINER_NAMES` (`deploy/recovery.py:44-49`), which restore's `colliding_resources` (`deploy/recovery_resources.py:945-963`) uses to refuse an occupied target.
- Effects:
  - a cold backup leaves the ingress running;
  - its image, Compose project and service are never checked;
  - restore does not see a stray `ocu-test-messages-ingress` on the target.
- Impact today is low, because `open-webui` is stopped by then and the ingress returns 502. But the recovery set's stack checks no longer describe the running stack.

**`check-ports.sh` can pass without the ingress.**

- `require_messages_ingress` runs only when `messages-ingress` is attached to the sandbox network (`deploy/check-ports.sh:119-122`).
- `MESSAGES` is not in the critical list (`:105`).
- So a resolved stack with no `messages-ingress`, or with the ingress off the sandbox network, passes. `up.sh` refuses to start without `OCU_SANDBOX_MESSAGES_ADDRESS`, so a deployment that passes the check but has no ingress cannot serve sandbox Claude Code.

**OS errors end in a traceback.**

- In `deploy/recovery.py`, `cmd_backup`, `cmd_verify`, `cmd_restore` and `cmd_activate` (`:766-827`) catch `(RecoveryError, release.ReleaseError)`. Only `cmd_retarget` (`:829-839`) also catches `OSError`.
- A disk-full or permission error that escapes the resource layer therefore prints a Python traceback instead of a one-line `recovery: …` refusal.

## What Changes

**Ingress in backup and restore identity.**

- `deployment_identity` gains `"messages_ingress_container": "ocu-test-messages-ingress"`. The name is fixed, like the proxy's, because Compose sets `container_name`.
- `_require_stack_matches_runtime` checks it like the proxy: image accepted for the inventory's `proxy` role, Compose project, service `messages-ingress`. As with the proxy, a missing container is accepted. The ingress is not added to the `required` set (`:491-492`).
- `_quiesce_and_discover` stops the proxy, then the ingress, before the DocumentServer shutdown command, so both admission paths are closed first.
- The stopped-check loop and `_stop_after_office_failure` cover the ingress.
- `FIXED_CONTAINER_NAMES` gains `ocu-test-messages-ingress`, so restore refuses a target that already has one.
- There is no automatic restart. As today, the next `up.sh` recreates and restarts both proxy and ingress (`deploy/up.sh:311`).

**Ingress required by `check-ports.sh`.**

- `MESSAGES` joins the critical services.
- A `messages-ingress` service not attached to the sandbox network fails with a message naming it. The sandbox branch then always runs `require_messages_ingress`.

**OS errors refused in one line.** `cmd_backup`, `cmd_verify`, `cmd_restore` and `cmd_activate` add `OSError` to the caught exceptions and `fail(str(exc))`, as `cmd_retarget` does. stdout on success is unchanged.

**Docs.** `deploy/BACKUP-RESTORE.md` step 1 ("Stop the proxy…") also names the ingress, and the restart note names both.

Deviation from the issue's acceptance criteria:

- The issue asked for "restarts it with them". No component restarts after backup (BACKUP-RESTORE.md: "There is no automatic restart"), so this change keeps it that way.
- The issue asked that a missing ingress be refused. A missing ingress already means no sandbox admission, which is the goal of quiescence. The proxy is treated the same way, so only a foreign ingress is refused.

## Capabilities

### Modified Capabilities

- `ocu-backup-rollback`: one added requirement, for the ingress in quiescence and restore identity, and one-line OS-error refusals.
- `ocu-compose-port-matrix`: one added requirement, for the ingress being required by the preflight.

## Impact

- OCU:
  - `deploy/recovery_resources.py`, `deploy/recovery.py`, `deploy/check-ports.sh`, `deploy/BACKUP-RESTORE.md`;
  - tests in `tests/deploy/test_recovery.py` and `tests/deploy/test_check_ports.py`.
- Non-goals:
  - changing the ingress itself;
  - the restore-time cursor guard (#640);
  - an automatic restart after backup;
  - catching `ValueError` (only `retarget` parses user values that raise it).

## Fixture

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded: CLI entry, backup quiescence and restore collision (rollback path), deployment preflight
Blast radius: a backup that leaves the ingress running or accepts a foreign one; a restore onto a target with a stray ingress; a preflight that passes a stack with no ingress; tracebacks instead of refusals
Selected risk packs: Public API / CLI / script entry; Error handling / rollback / partial outputs; Config / project setup (preflight); Legacy compatibility; Documentation
Not selected: Auth / secrets (none); Schema (recovery set unchanged); Concurrency (locks unchanged); File IO (no new paths); Resource limits (none); Release packaging (no image change)
Evidence floor: OCU unit command for tests/deploy/test_recovery.py and tests/deploy/test_check_ports.py; new tests a–g in design.md; scripts/docs-lint gates
design.md: present
```
