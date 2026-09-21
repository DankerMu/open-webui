# Tasks

Issue #6 / Plan 1 group 3, task 3.1.

Selected: Public API; Auth/permissions/secrets; Error handling; Config.

Not selected: Schema; File IO; Concurrency; Resource limits; Legacy; Release; Documentation.

- [x] 3.1a Add `backend/open_webui/utils/ocu_client.py`: `OcuUnreachable` exception; `OcuClient` constructed from `OCU_INTERNAL_URL` and `OCU_INTERNAL_TOKEN` via `os.getenv` (empty URL or token fails loud on construct or first call, never silent skip). Methods: `describe(chat_id)` GET `{base}/internal/describe/{chat_id}`; `launch(chat_id)` POST `{base}/internal/launch/{chat_id}` — HTTP 409 with reason/body `never_created` is a typed result, not `OcuUnreachable`; `refresh(chat_id)` GET `{base}/api/outputs/{chat_id}`. Every request: `Authorization: Bearer {token}`. `aiohttp` (existing WebUI outbound pattern) with an injectable session/transport. Connection errors and timeouts → `OcuUnreachable`. Token never passed to `log.*`. Verify: module imports.
- [x] 3.1b Add `backend/open_webui/test/utils/test_ocu_client.py` with a stubbed transport (no network): describe/launch/refresh success assert method, path, and Bearer header; launch 409 `never_created` is the typed result; connection refused and timeout raise `OcuUnreachable`; a log-capture test issues a request while the token is a distinctive string and asserts that string is absent from captured records. Tests red against missing module, then green. Verify: `cd backend && uv run pytest -q -p no:cacheprovider open_webui/test/utils/test_ocu_client.py`; `make lint-scoped`; `make coverage-gate`.

Non-goals: route wiring (#7); env.py; live OCU.
