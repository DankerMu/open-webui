## Context

Change surface: `OcuClient._request` never-created branch (only reached for `launch`, `never_created=True`). Producer: OCU `_lifecycle_http_error` → FastAPI `HTTPException(detail=body)` → JSON `{"detail": {"detail": str, "reason": str}}`. Consumer: `routers/ocu_workspaces.py` `launch_workspace` maps `OcuNeverCreated` → 409 `{"reason": "never_created"}`, `OcuUpstreamError` → 502.

## Decisions

- Recognize: parsed JSON is a dict, `payload.get('detail')` is a dict, and its `reason` is exactly the string `never_created`. Everything else at 409 → `OcuUpstreamError(409)`.
- Flat `{"reason": "never_created"}` is no longer accepted (issue's recommended single contract; accepting both would hide future drift). Safe against real OCU: `/internal/launch` and `_lifecycle_http_error` were added together in OCU commit `3135c36`, the helper is unchanged since, and no OCU tag contains the endpoint — every OCU build with the endpoint emits the nested envelope.
- The repository's own OCU stub (`scripts/ocu-stub.py` `_launch`) still emits the flat shape; it moves to the same envelope in this change, with `scripts/smoke-stub.sh` asserting `detail.reason` and a MODIFIED `ocu-stub` spec, so stub-backed WebUI runs keep returning 409.
- Keep: exact status gate (409 + `never_created=True` only), decode-error handling, no retention/logging of upstream bodies.

Must preserve: describe/refresh never yield `OcuNeverCreated`; non-409 statuses unchanged; `OcuUnreachable` for transport errors; route's own flat 409 response and the 502 mappings; frontend contract.

Governing invariant: `OcuNeverCreated` is produced only for a launch HTTP 409 whose JSON body carries `detail.reason == "never_created"`.

Sibling surfaces: no other WebUI parser of OCU 409 reasons (issue search); real OCU producer unchanged; repository stub producer `scripts/ocu-stub.py` + its smoke check `scripts/smoke-stub.sh` + `openspec/specs/ocu-stub` (moved to the envelope here); route consumer covered by the end-to-end regression; frontend parser `src/lib/apis/ocu/index.ts` unchanged (reads the route's flat response).

## Seams and Evidence

- Stub transport: move `_StubResponse`, `_StubCM`, `_StubSession` from `test_ocu_client.py` into `backend/open_webui/test/ocu_harness.py` and import them in both test modules (no duplicate helpers).
- Client (`test_ocu_client.py`): positive fixture `{"detail": {"detail": "<marker>", "reason": "never_created"}}` → `OcuNeverCreated` exposing only `reason`, bearer POST to `/internal/launch/{id}`, and the marker in no captured log record. Negative 409 bodies → `OcuUpstreamError(409)`, marker absent from error and logs, each nested case carrying the marker: flat `{"reason": "never_created"}`, `{"detail": "<marker> never_created"}`, `{"detail": {"detail": "<marker>", "reason": "other"}}`, `{"detail": {"detail": "<marker>", "reason": "never_created later"}}`, `{"detail": {"detail": "<marker>", "reason": null}}`, `{"detail": ["never_created"]}`, non-JSON text, existing malformed cases; describe/refresh 409 with the nested envelope still `OcuUpstreamError`.
- Route (`test_ocu_workspaces.py`): set `OCU_INTERNAL_URL`/`OCU_INTERNAL_TOKEN`, install via `_install_client` a real `OcuClient(session=<harness stub session>)` returning the 409 envelope; owner launch → HTTP 409 `{"reason": "never_created"}` (red before: 502 `ocu_upstream_error`), and the stub saw exactly one bearer POST to `/internal/launch/{chat.id}`; unrelated nested 409 body → 502 `ocu_upstream_error`.
- Stub: `make smoke-stub` passes with `scripts/smoke-stub.sh` asserting `detail.reason == never_created` on the never_created launch (red before the stub change).
- Commands: `cd backend && uv run --no-sync pytest -q open_webui/test/utils/test_ocu_client.py open_webui/test/routers/test_ocu_workspaces.py`, `make lint-scoped`, `make coverage-gate`, `make dev-bg` + `make smoke` + `make dev-stop`, `make smoke-stub`, `make decisions-verify`, `make doc-gate`.

Non-goals: changing OCU's envelope, #306, the route's response, frontend handling.

Review focus: only nested `detail.reason` exact match qualifies; flat shape rejected; route end-to-end 409; no upstream content leak.
