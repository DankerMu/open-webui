# Design

## Context

Parent: `openspec/changes/ocu-workspace-integration/` D4, D7, D11. Issue #6 is task 3.1 only.

## Goals / Non-Goals

**Goals:**

- Typed client: describe / launch / refresh against `OCU_INTERNAL_URL` with `OCU_INTERNAL_TOKEN`.
- Connection refused and timeout → `OcuUnreachable`.
- Launch 409 `never_created` is a typed result.
- Token never appears in logs.

**Non-Goals:**

- Route wiring (#7).
- Rate limiting (route-side).
- D7 status mapping to WebUI `stopped`/`running` (route-side).
- env.py growth.

## Decisions

Change surface: `backend/open_webui/utils/ocu_client.py`, `backend/open_webui/test/utils/test_ocu_client.py`.

Must preserve: no import of this module from the auth route; existing routers unchanged.

Must add/change: `OcuClient` + `OcuUnreachable` + typed launch 409.

Governing invariant: every request to OCU carries `Authorization: Bearer {OCU_INTERNAL_TOKEN}`; the token string never appears in a log record; transport failure is `OcuUnreachable`, never a generic exception the route could mis-map as `never_created`.

Sibling surfaces: producers (none this PR); validators (token header); storage (none); entrypoints (the three methods); consumers (#7 describe/launch/refresh); failure paths (`OcuUnreachable`, launch 409). Reviewers check the header name is the one #7 and the proxy will reuse, and that describe never calls launch.

Seams under test: unit tests with a stubbed aiohttp/httpx transport (no live OCU, no TestClient app).

Required evidence:

- describe success: GET `/internal/describe/{chat_id}` with Bearer token; parsed body returned.
- launch success: POST `/internal/launch/{chat_id}` with Bearer token.
- launch 409 `never_created`: typed result, not `OcuUnreachable`.
- refresh success: GET `/api/outputs/{chat_id}` with Bearer token.
- connection refused / timeout → `OcuUnreachable`.
- log-capture: a logger on the client module (and root if the client uses it) never contains the token string when a request is made.
- Missing `OCU_INTERNAL_URL` or empty token fails loud on first call (or at construct), never silent skip.

Non-goals: listed above.

Review focus:

1. Token only in the Authorization header, never in URL/query/body/log.
2. 409 is not folded into `OcuUnreachable`.
3. Transport is injected/stubbed; tests do not hit the network.
4. Flags via `os.getenv` in this module (env.py ratchet).
5. Header is `Authorization: Bearer …` (matches other WebUI server-side callers).

Risk packs:

- Public API / CLI / script entry — selected: the three methods are #7's only OCU I/O. Evidence: stubbed-transport tests.
- Auth / permissions / secrets — selected: token header + never logged. Evidence: log-capture + header assertion on the stub.
- Error handling / rollback / partial outputs — selected: `OcuUnreachable` vs 409. Evidence: those two tests.
- Config / project setup — selected: URL/token from env. Evidence: missing URL/token fails loud.
- Schema — not selected: no table.
- File IO — not selected.
- Concurrency — not selected: no shared mutable client state required this PR.
- Resource limits — not selected.
- Legacy — not selected.
- Release — not selected.
- Documentation — not selected: D4 already in parent.

## Risks / Trade-offs

- [header name not yet in OCU] → `Authorization: Bearer` matches existing WebUI outbound calls; #9 OCU guard must accept the same. Recorded so #9 does not invent `X-Internal-Api-Key` for this path without a fixture change.
- [env.py unused] → same 偏离 as #4; second consumer still does not grow env.py.

## Migration Plan

None. Additive module, unreferenced until #7.
