## Design

Change surface (OCU): `deploy/up.sh` (`start_stack` call sequence), `tests/deploy/test_deploy_entry.py`, the fake docker `tests/deploy/fakebin/docker` (its compose dispatcher, `:2021-2029`, handles only `config`, `up`, `ps`, `version` and must learn `restart`), `deploy/production-like-test/NETWORK-HARDENING.md`.

Must preserve:

- Start order core → WebUI → proxy, `COMPOSE_REMOVE_ORPHANS=false`, `COMPOSE_PROFILES=` and `--no-build --pull never` on every `up` (asserted by `test_successful_entry_starts_applications_before_proxy`).
- A failed core or WebUI start never starts or restarts the proxy (`test_application_start_failure_preserves_earlier_stack`).
- Signal handling and temp-config cleanup for every child, including the new restart (run through `run_owned`).
- Other consumers that run the real `up.sh` through the same fake and assert on `executed.json` rows: `tests/deploy/test_bootstrap_runtime.py:495-501` (stacks `["core","webui","proxy"]`), `tests/deploy/test_recovery.py:2098-2101` (recovery activation) and `tests/deploy/test_offline_release.py:3144-3148`. The fake records the restart in `ops.log` and in its own `restarts.log`, never as an `executed.json` or `starts.log` row, so those assertions stay unchanged.
- No `down`, volume removal, `--force-recreate` of backends, or other destructive operation (`assert_no_destructive`).

Must add:

- After the proxy `up -d` succeeds: `docker compose -p "$PROJECT" --project-directory "$OVERLAY" --env-file "$CONFIG_DIR/empty.env" -f "$CONFIG_DIR/proxy.up.json" restart proxy`, through `run_owned`, then exactly `deploy: proxy restarted for <snapshot>` on stderr (where `up.sh` writes its other diagnostics).
- Restart failure: message `deploy: proxy restart failed for <snapshot>`, non-zero exit, temp configs removed.

Governing invariant: when `up.sh` exits 0, the proxy container was (re)started after every backend container that the same run started or recreated. `compose restart` returns once the container starts; a render or `nginx -t` failure inside it surfaces as today (container exit), and the live nginx proof is task 3.1.

Sibling surfaces:

- `deploy/recovery_resources.py` activation runs the selected `up.sh`, so it inherits the restart; no separate change.
- Backup stops the proxy with the writers, and the next `up.sh` starts it last; already correct, no change.
- `deploy/smoke.sh`: checks the proxy is running after `up.sh`; unaffected.
- Backends recreated outside `up.sh` (manual `docker compose up`): out of scope, documented.
- Recovery activation of an older retained release runs that release's own `up.sh`, which has no restart, so a rollback to such a release brings the stale-upstream behaviour back; the NETWORK-HARDENING note covers it.

Seams under test: the `up.sh` process boundary through the fake docker harness (`tests/deploy/test_deploy_entry.py`).

Required evidence:

- (a) Successful run: the recorded docker operations show the proxy `restart` after the proxy `up`, with the same project, project directory, env file and snapshot, and the restart is the last compose operation; stderr contains exactly `deploy: proxy restarted for <CONFIG_DIR>/proxy.up.json`. Red on `bff4f29`.
- (b) Restart failure injected in the fake docker: exit non-zero, message `deploy: proxy restart failed for …proxy.up.json`, no leftover temp files, no destructive operation. Red on `bff4f29`.
- (c) WebUI start failure: no proxy `up` and no proxy `restart` (extend the existing test's assertion). Proxy `up` failure (`up-fail-proxy`): no proxy `restart`, non-zero exit.
- (d) Existing `test_deploy_entry.py` cases stay green, and so do the `up.sh`-running cases in `test_bootstrap_runtime.py`, `test_recovery.py` (activation) and `test_offline_release.py`.
- (e) Signals during the restart: the fake holds `compose restart`; TERM, INT and HUP each remove the temp configs, leave no child running and use no destructive verb (following `_signal_during_held_up`).

Non-goals: runtime DNS in nginx (direction 2); detecting which backends were recreated; recreation outside `up.sh`; the Office editor's handling of a proxy blip (#592).

Review focus: restart runs only after a successful proxy `up`; restart goes through `run_owned` (signals and cleanup); the doc keeps the "upstreams must exist first" rule and names the outside-`up.sh` gap; no test weakened.
