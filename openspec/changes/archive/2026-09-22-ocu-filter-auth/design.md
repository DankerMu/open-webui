# Design

## Context

The filter receives PUBLIC_BASE_URL via the server's X-Public-Base-URL response header; docker_manager.py owns the environment value and silently strips `/`. The user explicitly chose startup rejection and concrete-file preview links. Existing filter urllib fetch is unauthenticated, follows redirects, falls back to the internal URL when the response header is absent, and may serve stale cache after any HTTP failure.

## Goals / Non-Goals

Governing invariant: only authenticated prompt responses supply public links; internal credentials stay server-side, and preview decoration names a concrete file in the current chat on the configured cookie path.
Must preserve: successful injected prompt bytes/insertion order/template handling, inactive-tool/missing-chat no-op, user-scoped LRU/TTL behavior, transient-unreachable fallback within the same authorized configuration, archive toggle and idempotency.
Sibling surfaces: filter inlet/outlet, prompt cache, urllib redirect/error paths, OCU raw public-base configuration, lifespan and packaged multi-worker preflight, prompt rendering and header emission, existing public-base tests/docs.
Non-goals: requiring every development URL to end in `/ocu` (deployment provisions that base), changing unset/default URL policy, SPA prefix implementation, grants, UI recognizer, Docker execution.

## Decisions

- Internal token comes from WebUI process env at call time, never a Valve. REST fetch uses Authorization Bearer; user_email comes only from injected `__user__`. Reject unusable token without network or cached prompt reuse; log only variable/status names, not credential values.
- Reject redirects before credentials leave the configured origin, applying the proven caller fix from #10. These separately uploaded tool/filter modules cannot import one another at runtime; keep only the minimal transport policy locally, no shared package dependency.
- Cache remains per chat/user but its validity is bound to ORCHESTRATOR_URL and current token. Clear/invalidate on configuration change before inlet or outlet can use cached entries. A 401/403 or missing required public-base header is not an unreachable-server stale-cache fallback. Preserve narrow exception handling and existing fallback only for real transient transport failures in the same configuration.
- PUBLIC_BASE_URL has one owner on OCU. Validate raw configured value before stripping could hide an error, including the packaged preflight before the multi-worker supervisor. Remove its silent rstrip; preserve ORCHESTRATOR_URL normalization. Valid public base without trailing slash is returned and used verbatim; document the deployed value as the WebUI proxied `/ocu` base. No network probe is needed to validate syntax at startup.
- The filter requires the server's X-Public-Base-URL; remove the internal-address compatibility fallback. Do not invent a URL if it is absent. Preserve fetched prompt content rather than locally regenerating it.
- For each assistant message containing a current-chat file URL, preview decoration targets the first matching concrete file URL under `{base}/files/{chat_id}/`. Preserve percent-encoding and query suffix; never create `/f/{grant}` or `/preview/{chat_id}` links. Append the configured preview label at most once even when the file URL already appears as ordinary content. Archive remains `{base}/files/{chat_id}/archive` and retains its toggle/idempotency.
- Remove browser-tool-only trigger helpers when no longer referenced. With no concrete file, append neither preview nor archive; the user explicitly chose the workspace button/events for that flow. Foreign-chat/foreign-base links, non-assistant and non-string content remain untouched.

## Evidence and Migration

Use existing filter tests for prompt byte/insertion baseline. Add real in-process guard-backed fetch success and stripped-token 401, wrong/missing token with warm cache, credential/origin rotation, two-origin redirect containment, and concrete-file/current-chat/no-file/idempotency cases. Capture semantic red before source changes; don't count missing imports or merely asserted warning text.
Exercise actual production startup command without Docker: configured `/ocu/` exits non-zero before listening, configured `/ocu` starts and returns that public-base header. Existing startup/auth tests must remain meaningful. Run configured non-Docker suite and structure check. All Docker verification remains in consolidated epic task 19.0.
Migration: remove trailing slash from deployment PUBLIC_BASE_URL before rollout; keep it set to the proxied `/ocu` base. Environment-token provisioning remains in #26. Rollback server and filter together; no unauthenticated or internal-URL fallback.
