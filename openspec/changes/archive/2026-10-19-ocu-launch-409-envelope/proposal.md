## Why

OCU answers a launch for a never-created chat with HTTP 409 and the body `{"detail": {"detail": "...", "reason": "never_created"}}` (`_lifecycle_http_error` in `computer-use-server/app.py`, asserted by OCU's `test_lifecycle.py`). WebUI's `OcuClient._request` only checks a top-level `reason`, and its fixture uses the flat `{"reason": "never_created"}`. The real response is therefore classified as `OcuUpstreamError`, and the launch route returns 502 `ocu_upstream_error` instead of 409 `never_created` (#467). Static contract drift; no runtime occurrence claimed.

## What Changes

- `OcuClient._request` recognizes `never_created` only at `detail.reason` of OCU's established envelope (parsed JSON object whose `detail` is an object with `reason` exactly `never_created`). The flat top-level shape is no longer accepted (single contract, per the issue's recommendation).
- Client fixture switches to the OCU envelope; malformed and unrelated 409 bodies (including the old flat shape) stay `OcuUpstreamError`, with no upstream content retained or logged.
- A launch-route regression drives the real `OcuClient` over a stubbed transport returning the OCU envelope and asserts 409 `{"reason": "never_created"}`.
- `scripts/ocu-stub.py` launch 409 switches to the same envelope (it still sends the flat shape, which WebUI would now reject as 502 under stub-backed runs); `scripts/smoke-stub.sh` checks `detail.reason`; `ocu-stub` spec updated.
- The stub transport helpers move from `test_ocu_client.py` into `backend/open_webui/test/ocu_harness.py` so the route test reuses them.
- The consumer-failures decision and `ocu-client` spec name the nested location.

## Capabilities

### Modified Capabilities

- `ocu-client`: launch 409 `never_created` is read from OCU's nested error envelope.

## Impact

`backend/open_webui/utils/ocu_client.py`, `backend/open_webui/test/utils/test_ocu_client.py`, `backend/open_webui/test/routers/test_ocu_workspaces.py`, `backend/open_webui/test/ocu_harness.py`, `scripts/ocu-stub.py`, `scripts/smoke-stub.sh`, one sentence in `docs/decisions/implemented/architecture/2026-09-27-ocu-consumer-failures.md`. OCU's envelope, the WebUI route's own flat 409 response, frontend handling and #306 are unchanged.

## Triage

- Issue type: bugfix
- Fixture level: expanded — response parser at the WebUI↔OCU contract boundary, on a critical-path router's outcome.
- Upstream suggested level: absent
- Blast radius: never-created chats shown as upstream failures (current bug), or, if over-broad, arbitrary 409s misclassified as never-created.
- Selected risk packs: Public API / CLI / script entry; Schema / columns / units / field names; Error handling / rollback / partial outputs; Auth / permissions / secrets (no upstream-content leak); Legacy compatibility; Documentation
- Evidence floor: `test_ocu_client.py` and `test_ocu_workspaces.py` cases red before / green after, `make lint-scoped`, `make coverage-gate`, `make smoke`, `make smoke-stub`, `make decisions-verify`, `make doc-gate`
