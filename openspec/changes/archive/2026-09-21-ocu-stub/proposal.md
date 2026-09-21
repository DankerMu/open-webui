# Proposal

Issue type: feature
Fixture level: expanded
Upstream suggested level: expanded (agree — shared harness entry that later CI `make smoke-proxy` and A-T01 e2e will call; fail-loud missing-prereq is production-config-adjacent)
Blast radius: a stub that starts a sandbox or forwards to a real OCU leaks the LAN; a launcher that skips when nginx/config is absent makes #23 CI skip look green.
Selected risk packs: Public API / CLI / script entry; Config / project setup; Auth / permissions / secrets; Error handling / rollback / partial outputs
Evidence floor: stub own smoke (describe/launch/files/outputs/headers); `scripts/proxy-dev.sh` exits non-zero naming the missing prerequisite when `OCU_CHECKOUT` or `deploy/proxy/` is absent.

## Why

Issue #21 / task 13.2. `make smoke` has no OCU. #23 and #29 e2e need a deterministic stub and a launcher that fails loud instead of skipping.

## What Changes

- `scripts/ocu-stub.py`: HTTP stub. Fixed `/api/outputs/{chat_id}`, `/files/{chat_id}/*` (HTML/SVG/XML/binary fixtures), `/preview/{chat_id}`, `/terminal/{chat_id}/heartbeat`, static under `{prefix}/static/`, `/internal/describe/{chat_id}` and `/internal/launch/{chat_id}` with per-chat fixture states `running` / `stopped` / `never_created`; launch flips stopped → running. Echo received headers (e.g. `X-Echo-Authorization`) for assertions. No Docker, no real OCU.
- `scripts/proxy-dev.sh`: start overlay proxy config from `$OCU_CHECKOUT/deploy/proxy/` (default sibling `../open-computer-use`) against harness + stub. Exit non-zero **naming** the missing prerequisite (checkout, config path, proxy binary). Does not start the proxy when 13.1 config is absent.
- Stub smoke: a script or hurl file **not** on the `smoke/*.hurl` glob (`make smoke` stays unchanged). Hits stub directly.

No nginx config (#22). No `make smoke-proxy` / CI pin (#23).

## Capabilities

### New Capabilities

- `ocu-stub`: deterministic OCU HTTP fixture and fail-loud proxy-dev launcher.

### Modified Capabilities

None.

## Impact

- Harness: `scripts/ocu-stub.py`, `scripts/proxy-dev.sh`, stub smoke.
- Downstream: #23 `make smoke-proxy`; #29 Playwright.
