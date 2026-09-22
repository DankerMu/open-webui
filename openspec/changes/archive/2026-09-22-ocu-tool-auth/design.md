# Design

## Context

The standalone Open WebUI tool has an MCP client, synchronous health/MCP probes and a requests-based upload helper. Tool wrappers call upload synchronization before \_run_tool; validating only inside \_run_tool is too late. Existing tests/test_tools.py covers Valve schema only. OCU guard requires REST Bearer internal credentials and MCP X-OCU-Internal-Token plus optional MCP_API_KEY Bearer (decision 2026-09-21-ocu-mcp-service-credentials).

## Goals / Non-Goals

Governing invariant: every outgoing OCU request uses the configured service credential and only server-derived user identity; absent chat identity produces an error without any outgoing work or default fallback.
Must preserve: ORCHESTRATOR_URL Valve, MCP_API_KEY semantics, tool signatures/results/progress, successful file deduplication/upload/temp cleanup, client timeout behavior and protocol negotiation.
Sibling surfaces: all five tool wrappers, \_run_tool, lazy client cache, health GET, MCP initialize probe, SDK transport, upload manifest GET and multipart POST.
Non-goals: filter migration, server guard changes, invalid-ID policy duplication, network retries, new event behavior, proxy and Docker execution.

## Decisions

- Read OCU_INTERNAL_TOKEN from the WebUI process environment on each call; never expose it as a Valve or model-visible argument. Unlike ORCHESTRATOR_URL, this credential must not be persisted or returned through browser-facing Valve APIs (`backend/open_webui/routers/tools.py` GET/POST valves routes). Missing/blank or HTTP-unsafe configuration produces a named configuration error before networking without revealing the value.
- MCP transport and initialize probe carry X-OCU-Internal-Token; MCP_API_KEY stays Bearer. REST health/manifest/upload requests use internal-token Bearer. Request identity comes from `__user__`; copied browser request headers or model-supplied metadata cannot override it.
- Thread the token through the existing client and upload helper rather than adding a second client implementation. Client cache identity includes URL and both configured secrets so changes take effect on the next call. No global per-user headers or context cache.
- Remove every `or "default"` chat fallback. Missing/None/empty/whitespace-only chat metadata returns the existing recognizable error form before upload synchronization; non-empty IDs remain the guard's validation responsibility. Preserve final error-status emission when an emitter is present.
- Preserve the existing health/MCP probe behavior, but authorize its requests too. Probes must not substitute their identity for the subsequent tool request. Every consumer of changed private signatures migrates atomically; exported tool argument signatures remain stable.

## Evidence and Risks

Tests call public Tools methods and exercise the actual HTTP/MCP/upload construction, intercepting only network/storage dependencies. At least one produced MCP request and one upload/manifest request pass the real in-process OCU guard; stripping the credential yields 401 without Docker. Verify all five wrappers reject missing chat metadata before any outgoing operation, including file-bearing wrappers. Prove per-call identity and credential rotation with successive calls and distinct secrets; do not merely assert a header dictionary helper.

Capture semantic red before implementation, then focused green and configured non-Docker suite. New behavior tests must fail on missing headers or default fallback, not missing constructor symbols. Docker checks run once after all development under the user's instruction and epic task 19.0. Rollback pairs caller configuration with the compatible OCU image; no unauthenticated fallback.
