# Owned cleanup failure isolation

## Context

The data-cleanup phase uses fail-fast deletion and exact-email lookup helpers.
The outer lifecycle already preserves nonzero status and continues sentinel and scratch cleanup.

## Goals / Non-Goals

Change surface: `Smoke.cleanup_data` and its deletion/lookup helpers in `scripts/smoke-proxy.py`.
Must preserve: only this-run IDs or exact owner/foreign email matches may be deleted; 200/204/404 deletion success; no-admin no-op; process, sentinel and scratch cleanup ordering; preexisting nonzero exit codes.
Must add/change: per-operation failure isolation and one sanitized aggregate after every eligible attempt.
Governing invariant: a failed owned-data operation neither expands ownership nor suppresses later owned cleanup or the failing verdict.
Sibling surfaces: chat deletion (including Office chat), known user IDs, email fallback lookup, every exact-email result, and `_finish_owned_cleanup` status/sentinel/scratch handling.
Seams under test: the actual cleanup entrypoint and outer lifecycle using injected HTTP outcomes; a loopback HTTP server exercises the real HTTP client.
Non-goals: retries, broad prefix matching, production routes, lifecycle framework changes, process-order changes or dependency upgrades.

## Decisions

Keep collection inside the existing cleanup owner; retain the outer lifecycle unchanged.
Capture only operation kind plus status or exception class; never interpolate URLs, IDs, email, response bodies or exception messages.
Each email lookup and each eligible result deletion is independently attempted so one result cannot suppress another.
The existing issue-approved repair is local; it does not introduce a new architectural decision.

## Required Evidence

HTTP 500 and transport failure on the first delete -> all later owned targets attempted, one redacted aggregate and nonzero verdict.
Failed email lookup or first exact-match result delete -> remaining emails/results attempted; partial matches and sentinel untouched.
Successful DELETE 200/204/404 -> no cleanup failure; no admin cookie -> no HTTP requests.
Lifecycle codes 0, 1 and 130 with cleanup failure -> 1, 1 and 130 respectively; owned process and scratch cleanup still observed.
Real loopback request log -> all expected owned attempts despite a failed first delete, no unowned deletion.

## Risks / Trade-offs

Catching per-operation exceptions could hide programming errors -> retain exception class and fail the aggregate, never report success.
Best-effort cleanup does not guarantee removal when a remote operation fails; the failed run remains visible.
Review focus: ownership, redaction, complete fallback iteration, unchanged lifecycle verdict.
