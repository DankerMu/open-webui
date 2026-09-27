---
id: 2026-09-27-ocu-consumer-failures
title: Preserve dependency failures without exposing upstream details
kind: architecture
status: implemented
date: 2026-09-27
supersedes: none
references: 2026-09-22-ocu-lifecycle-lock-and-launch-semantics, issue-64, issue-29
---

# Preserve dependency failures without exposing upstream details

## Problem

Discarding OCU HTTP status makes failed launch look successful and failed refresh look like revision0. Frontend detail-only error handling loses reason-only409 and non-JSON failures. Passing raw upstream errors instead would reveal unbounded internal detail and confuse dependency authorization with WebUI ownership decisions.

## Decision

The internal client raises OcuUpstreamError with numeric upstream status and fixed reason ocu_upstream_error for non-2xx responses. Only launch409 with parsed JSON reason exactly never_created yields OcuNeverCreated. Transport errors retain OcuUnreachable. Failed upstream bodies are not retained or logged.

Describe HTTP failure returns502 ocu_upstream_error without cursor/prefs mutation or fabricated stopped state. Describe transport failure retains200 unavailable/ocu_unreachable with stored cursor. Launch/refresh return502 with ocu_upstream_error or ocu_unreachable; never_created retains409. WebUI authentication, mutating-header, ownership and flag gates retain precedence.

Frontend consumers receive WorkspaceRequestError with numeric status and a fixed reason. Network failure is0/request_failed; malformed successful JSON retains HTTP status with invalid_response. HTTP401/403/404 determines unauthorized/forbidden/not_found before body inspection. Otherwise only recognized dependency reasons survive; arbitrary response text/detail is not logged or exposed.

## Alternatives considered

- **Passthrough upstream statuses and bodies** — leaks detail and mislabels OCU401 as WebUI session failure.
- **Map every refusal to409** — loses the literal never_created distinction.
- **Return null and let the component infer failure** — perpetuates ambiguous success at the API boundary.
- **Use503 for upstream transport failure** —502 consistently identifies the failed upstream dependency; local service availability semantics need not change.

## Consequences

Components can switch on stable reasons without parsing server text. Failed operations preserve stored cursor/preferences. Successful payload validation, redirects, retry policy and timeouts remain separate concerns; this change does not broaden authorization or start a sandbox implicitly.
