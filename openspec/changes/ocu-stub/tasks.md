# Tasks

Issue #21 / Plan 1 group 13, task 13.2.

Selected: Public API / CLI / script entry — stub listen + launcher. Config / project setup — `OCU_CHECKOUT`. Auth / permissions / secrets — header echo, no real token in fixtures. Error handling — missing prereq named, not skipped.

Not selected: Schema; File IO overwrite; Concurrency; Resource limits; Legacy; Release; Documentation (Verification Matrix row is #23).

- [ ] 13.2a `scripts/ocu-stub.py`: bind 127.0.0.1 (port from env `OCU_STUB_PORT`, default 8090). Fixture chats: `running`, `stopped`, `never_created`. Routes: `GET /internal/describe/{chat_id}` (state from fixture; unknown id → never_created), `POST /internal/launch/{chat_id}` (stopped → running; never_created → 409 `{reason: never_created}`; running no-op), `GET /api/outputs/{chat_id}` (fixed listing with prefixed `url` when `OCU_PUBLIC_PREFIX` set), `GET /files/{chat_id}/{name}` (html/svg/xml/bin fixtures; `?download=1` attachment), `GET /preview/{chat_id}` (minimal HTML shell), `GET /terminal/{chat_id}/heartbeat` (200), `{prefix}/static/*` (one js fixture). Echo `Authorization` and `X-Requested-With` as `X-Echo-*`. Stdlib only.
- [ ] 13.2b Stub smoke (not `smoke/*.hurl`): start stub, assert describe/launch flip/files/outputs/echo, stop stub. `make` target `smoke-stub` or a script invoked from tests — must not run under `make smoke`.
- [ ] 13.2c `scripts/proxy-dev.sh`: `OCU_CHECKOUT` default `../open-computer-use`. Require `deploy/proxy/` config file and a proxy binary (`nginx` or `caddy`). On any miss, exit non-zero and print the missing path/binary name. Do not start a proxy in this issue's tests (config does not exist yet); the missing-prereq case is the acceptance test.

Non-goals: overlay config (#22); `make smoke-proxy` (#23).
