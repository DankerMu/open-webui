# Proposal

Issue type: feature
Fixture level: expanded
Upstream suggested level: expanded (agree — public API of a server-side client, auth/secrets, error mapping)
Blast radius: a logged token leaks the internal credential; a swallowed timeout looks like `never_created` and the sidebar would offer launch; a missing 409 map makes #7 invent a second error model.
Selected risk packs: Public API / CLI / script entry; Auth / permissions / secrets; Error handling / rollback / partial outputs; Config / project setup
Evidence floor: unit tests with a stubbed transport covering describe/launch/refresh success, launch 409 `never_created`, connection/timeout → `OcuUnreachable`, and a log-capture proving the token never appears; `make lint-scoped` + `make coverage-gate`

`design.md` is required at expanded.

## Why

WebUI has no server-side client for OCU's internal endpoints. Task 3.1 / issue #6 lands the module so #7 can wire routes without inventing HTTP.

## What Changes

- New `backend/open_webui/utils/ocu_client.py`: `OcuClient` reads `OCU_INTERNAL_URL` and `OCU_INTERNAL_TOKEN` via `os.getenv` (same home as the router flags; `env.py` stays untouched — over-800 ratchet). `describe(chat_id)` → `GET {base}/internal/describe/{chat_id}`; `launch(chat_id)` → `POST {base}/internal/launch/{chat_id}`; `refresh(chat_id)` → `GET {base}/api/outputs/{chat_id}`. Every request sends `Authorization: Bearer {token}`. Connection errors and timeouts map to typed `OcuUnreachable`. Launch HTTP 409 with `never_created` maps to a typed result, not an exception that looks like unreachable. Token never logged.
- New `backend/open_webui/test/utils/test_ocu_client.py` with a stubbed transport (no live OCU).

No route wiring (#7). No env.py. No proxy.

## Capabilities

### New Capabilities

- `ocu-client`: typed internal HTTP client for describe / launch / refresh with token header, 409 mapping, and `OcuUnreachable`.

### Modified Capabilities

None. Parent epic already names the client in task 3.1.

## Impact

- New files only. Downstream: #7 routes.
