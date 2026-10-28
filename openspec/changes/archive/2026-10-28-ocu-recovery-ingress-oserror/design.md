## Design

Change surface:

- `deploy/recovery_resources.py`:
  - `deployment_identity`;
  - `_require_stack_matches_runtime`;
  - `_quiesce_and_discover`;
  - `_stop_after_office_failure`.
- `deploy/recovery.py`: `FIXED_CONTAINER_NAMES`, and the four `cmd_*` handlers.
- `deploy/check-ports.sh`: the critical list and the sandbox branch.
- `deploy/BACKUP-RESTORE.md`.

Must preserve:

- **Backup:**
  - the stop order otherwise: proxy first, the DocumentServer shutdown command while OCU runs, then the writers;
  - no automatic restart;
  - the `required` set (OCU, WebUI, PostgreSQL, DocumentServer);
  - every existing refusal message.
- **A deployment without an ingress container,** for example one stopped by hand: backup proceeds as today.
- **`check-ports.sh`:** every existing failure, including all `test_messages_ingress_is_the_only_sandbox_member` defects and `test_other_services_on_the_sandbox_network_still_fail`.
- **Recovery CLI:**
  - success stdout: `verify` JSON, `restore` `{"owned_resources": …}`, empty for `backup` and `activate`;
  - exit codes;
  - `cmd_retarget`.
- **Restore after allocation:** a failure still prints `recovery: owned partial resources remain: …` (`recovery_resources.py:1435-1443`) before the refusal.
- **Offline-release missing-image case** (`tests/deploy/test_offline_release.py:2121-2138`): it still expects `image` in stderr, because `verify_service_images` (`deploy/up.sh:240`) runs before `check-ports.sh` (`:272`).

Must add/change: see proposal "What Changes".

Governing invariant: every Compose service that can admit traffic into WebUI is stopped and identity-checked before a backup captures anything, and the preflight refuses a stack that lacks one.

Sibling surfaces:

- **Admission containers:**
  - the proxy: the existing pattern;
  - the ingress: new, with the same handling at each of the five call sites (identity, stack check, stop, stopped-check, failure-path stop) and in `FIXED_CONTAINER_NAMES`.
- **Restore occupancy:** `colliding_resources` reads `FIXED_CONTAINER_NAMES`. No other reader of that tuple exists (grep).
- **Preflight:**
  - `check-ports.sh` is called by `up.sh` before any service starts;
  - `intended_docs()` (`tests/deploy/support.py:273`), used by `tests/deploy/test_check_ports.py`, already includes the ingress.
- **CLI handlers:** the four commands; `cmd_retarget` is the model.

Seams under test:

- `tests/deploy/test_recovery.py` runs `recovery.py` as a subprocess against `tests/deploy/fakebin/docker`, with `ops.log` and `containers.json`.
  - The stack fixture (`:359-397`) gains `ocu-test-messages-ingress` (proxy image, service `messages-ingress`).
  - The Office ordering test (`:716-761`) is the stop-order model.
- `tests/deploy/test_check_ports.py`: `run_checker` / `intended_docs` (`tests/deploy/support.py`).
- `_seed_restore_target` (`tests/deploy/test_recovery.py`) seeds the restore target's `containers.json`; evidence d appends the ingress there.
- The launcher-prelude injection of `test_restore_epoch_io_failures_never_publish_readiness` (`tests/deploy/test_recovery.py:1621-1692`) replaces a function before `recovery.py` runs. Each `cmd_*` imports its handler inside the function, so the prelude can replace `recovery_resources.backup_deployment`, `verify_recovery_set`, `restore_deployment` and `activate_release` with one that raises (evidence f).
- The fake docker's `unstoppable` container flag makes a `docker stop` fail (evidence g).

Required evidence:

- a. **Stop order.** A successful backup stops `ocu-test-proxy`, then `ocu-test-messages-ingress`, both before the DocumentServer shutdown command, which comes before the writers (`ops.log`). The ingress is stopped at capture, and there is no `docker start`.
- b. **Foreign ingress.** An ingress container with an image not accepted for the `proxy` role, or with another Compose project, or with another service label, refuses before any `docker stop`. The message names the container.
- c. **Missing ingress.** A stack without the ingress container backs up as today.
- d. **Restore occupancy.** `restore` onto a target where `ocu-test-messages-ingress` exists lists it among the colliding resources and refuses before writing anything.
- e. **Preflight.**
  - `intended_docs()` without `messages-ingress` fails, naming it.
  - With `messages-ingress` but its `sandbox` network removed, the check fails naming it.
  - Existing cases stay green.
- f. **OS errors.** `backup`, `verify`, `restore` and `activate`, each driven by a stubbed resource call that raises `PermissionError` (or `OSError(ENOSPC)`):
  - exit code 1;
  - stderr is one `recovery: …` line containing the error text, and no `Traceback`;
  - stdout is empty.

  Use one table-driven test. The stub replaces the entry function itself, so restore never allocates and prints no partial-resources line.

- g. **Failure-path stop.** Mark `ocu-test-proxy` `unstoppable` in `containers.json`, so the admission stop fails before the ingress stop is reached. `_stop_after_office_failure` then runs. Expect:
  - exit 1;
  - no destination directory;
  - `docker stop --time 30 ocu-test-messages-ingress` in `ops.log`;
  - the ingress not running afterwards.

  This test fails on `main`. The stopped-check at `recovery_resources.py:599` cannot be isolated with this fake, because `_stop_container` already verifies the stop, so it stays review-only.

Non-goals: see proposal Impact.

Review focus:

- All five ingress call sites plus `FIXED_CONTAINER_NAMES`, and none missed.
- The proxy-then-ingress order, before the Office shutdown.
- Missing ingress is accepted and a foreign one is refused.
- The preflight refuses both a missing ingress and an ingress off the sandbox network, without weakening any existing case.
- The success output of the four commands is unchanged.
