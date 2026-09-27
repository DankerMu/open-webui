# Design

## Context

Only ocu_workspaces consumes OcuClient. Frontend helper exports have test callers but no production UI callers yet. Existing backend tests use stub transports and real FastAPI routes; no new abstraction is needed.

## Decisions

- Introduce OcuUpstreamError as an exception containing only upstream HTTP status and fixed reason `ocu_upstream_error`; never retain or log upstream error text. Classify non-2xx before domain parsing. Launch409 is OcuNeverCreated only for a parsed object with reason exactly `never_created`, not a substring in arbitrary text. Existing successful body handling remains unchanged.
- Describe upstream HTTP failure returns502 `{reason: "ocu_upstream_error"}`; it does not synthesize stopped/launch capability or advance the cursor. Describe transport failure retains200 unavailable/ocu_unreachable with stored cursor and empty views.
- Launch/refresh upstream failure returns502 `{reason: "ocu_upstream_error"}`; transport failure returns502 `{reason: "ocu_unreachable"}`. Both are dependency failures;503 remains unused rather than implying a disabled local service. Launch never_created retains409 `{reason: "never_created"}`. Auth/header/ownership/flag decisions occur before any dependency call and remain unchanged.
- Failed operations do not mutate cursor or prefs. Public errors contain only the fixed reason; no upstream status, body, URL, container details or exception representation is exposed.
- Frontend exports reject with WorkspaceRequestError extending Error, numeric status and stable reason. Fetch rejection is exactly status0/reason request_failed. A successful response with malformed JSON retains its HTTP status (200 for malformed200) and rejects invalid_response. For HTTP failures,401/403/404 map to unauthorized/forbidden/not_found before inspecting the body; otherwise recognize only fixed reasons never_created/ocu_upstream_error/ocu_unreachable, falling back to request_failed. Non-JSON, empty, unrecognized reason/detail bodies cannot resolve null or echo raw text. No frontend console logging of raw failed responses.

## Alternatives

Passthrough upstream status/body confuses OCU authorization with the WebUI gate and can reveal internal detail. Mapping every refusal to409 collapses never_created with infrastructure failure. Component-side null handling would preserve the broken boundary rather than fix it.

## Non-Goals

Successful domain schema validation, retries, timeout redesign, proxy behavior, UI implementation, prefs semantics and authorization refactors. No new route or dependency. Existing redirects retain their behavior in this narrow change unless a required status test proves classification needs adjustment.

## Verification

Observe typed client failures, real-route statuses and unchanged stored state, then frontend rejected Error objects. Distinctive upstream text must be absent from public responses and logs. Qualify failure classifiers against pre-fix or semantic-mutant code; parent executes all checks and smoke, leaves skip execution.
