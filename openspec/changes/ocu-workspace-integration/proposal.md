# Proposal

Source design: `docs/plans/2026-09-20-workspace-artifact-integration.md` (Plan 1, revised 2026-09-20 against source). This change covers Plan 1 only; Plan 2 (Office manual editing) is a later change that depends on this one's per-chat lock and revision contract.

## Why

Open WebUI 0.11.3 has no workspace concept: an OCU sandbox's Files/Browser/Terminal live in a separate, unauthenticated OCU app (`computer-use-server/app.py`), every OCU endpoint except `/mcp` and `/api/skill-stats` is reachable without a session, CORS is `*`, sandboxes share the orchestrator's L2 network, and `/files/{chat_id}/*` serves model-generated HTML as a top-level document on the OCU origin. For a LAN deployment with ~20 trusted employees this is the wrong trust shape in three ways that do not depend on employee goodwill: prompt-injected sandboxes can reach the control plane, model-generated pages can execute with a real origin, and nothing binds a workspace to the chat owner. The fork must expose the OCU workspace inside the chat UI with those three properties fixed, without forking OCU's preview app or breaking rebase-ability onto upstream Open WebUI.

## What Changes

- **WebUI backend**: new router `backend/open_webui/routers/ocu_workspaces.py` with `GET /api/v1/ocu/workspaces/{chat_id}`, `POST …/launch`, `POST …/refresh`, `PUT …/prefs`, and the internal `GET /api/v1/ocu/auth` used by the reverse proxy's `auth_request`. Authorization is `Chats.is_chat_owner` only; status semantics fixed: 401/403 (auth endpoint, 403 mapped to 404 by the proxy) and 401/403/404/409/422 (workspace routes; 403 only for a mutating request without the `X-Requested-With: ocu-workspace` header). One additive Alembic migration for `ocu_chat_state` (per-chat last-seen revision cursor and UI preferences), the migration Plan 1 § 1 / A1 names conditionally ("含迁移，若采用新表") and design D1 resolves.
- **Access gateway**: an external reverse proxy (nginx or Caddy, in the OCU deploy overlay) is the only path from a browser to OCU: default-deny allowlist for `/ocu/*` (chat-bound endpoints plus the SPA's static assets under `/ocu/static/`), `auth_request` on every request including WebSocket handshakes, 403→404 mapping, internal token header on forwarding, forced `Content-Security-Policy: sandbox allow-scripts allow-forms` + `nosniff` on HTML/SVG/XML file responses (generated documents are served single-file; relative sub-resources are a recorded limitation, design D19), `Origin`/`Sec-Fetch-Site` checks on every mutating request including the three mutating GETs (`heartbeat`, `sessions`, `processes`). The identity endpoints `/system-prompt`, `/skill-list`, `/skill-mounts` are not proxied; they stay server-to-server with the internal token. OCU generates every SPA URL under a configured public prefix, verifies the internal token (fail-closed at startup when unset), rejects non-saved chat_ids, rejects requests from the sandbox subnet, re-checks ownership periodically on open WebSockets (logout is not revoked without Redis, design D18), exposes a token-protected internal describe/launch pair, mirrors the CSP headers, and drops `allow_origins=["*"]`. Server-side callers (`computer_use_tools.py`, `computer_link_filter.py`, `mcp_tools.py` header trust) carry or require the internal token.
- **Sandbox lifecycle**: one `threading.Lock` per chat_id around container get/create/start; "start a stopped sandbox" leaves `_get_or_create_container` and becomes an explicit authorized `launch` that also absorbs `restart-container`/`resurrect-container`; any non-running container state raises `SandboxStopped` on the tool path; credentials enter only the owning chat's sandbox; retention stops at 168 h and never deletes data.
- **Sandbox network isolation**: sandboxes join a dedicated bridge only; `_get_compose_network_name` and every call site that attaches or re-attaches a sandbox to the compose network (create, dead-network repair, restart endpoint, address resolution) are removed; `DOCKER-USER` DROP rules make the control plane unreachable at L3; CDP/ttyd ports publish only on that bridge's gateway.
- **Workspace sidebar**: new `WorkspaceArtifact.svelte`, `src/lib/apis/ocu/`, and a chat-keyed store; mounted through the four existing `ChatControls.svelte` hooks; unavailable/loading/ready/empty/error plus stopped/disconnected states; history restore from the backend description; fixed sandbox attributes for the trusted OCU SPA iframe and opaque-origin iframes for generated content.
- **Outputs reconciliation**: stable `file_id` + a per-chat monotonic `revision` counter (the OCU outputs broker is its only authority) + content hash replace mtime as identity; `ocu:workspace_changed` notification from `_run_tool` as a refresh hint only; chat-keyed dirty flag; `preview.js` change detection moves to `path + file revision`; in-message preview-link recognition reimplemented as source (not the historical minified patch).
- **LAN deployment overlay** (OCU repo `deploy/`): proxy config, sandbox bridge + firewall rules, pinned image digests, offline build materials, backup including `ocu_chat_state`, retention guard that never implicitly restarts.

## Capabilities

### New Capabilities

- `ocu-workspace-authorization`: WebUI-side workspace routes, owner-only authorization predicate, chat_id validity, status-code matrix, per-chat state persistence.
- `ocu-access-gateway`: reverse-proxy allowlist, `auth_request` contract, internal token, generated-content response headers, Origin checks, OCU-side fail-closed verification and CORS.
- `sandbox-lifecycle`: per-chat lock, explicit launch, stop semantics, retention behaviour.
- `sandbox-network-isolation`: dedicated bridge, L3 control-plane isolation, application-layer subnet check as defense in depth.
- `workspace-sidebar`: sidebar component, chat-keyed store, mount/unmount lifecycle, state machine, history restore, iframe sandboxing.
- `outputs-reconciliation`: 产物 identity and revision, change notification, dirty-flag reconciliation, polling, preview-link recognition.
- `lan-deployment-overlay`: deployment topology, pinned versions, offline materials, backup/rollback, feature flag semantics.

### Modified Capabilities

None. `openspec/specs/` is empty at this change; upstream Open WebUI REST/socket behaviour is not changed by this change (CONTEXT.md § Public Interfaces).

## Impact

- **This repo (`DankerMu/open-webui`)**: new modules under `backend/open_webui/routers/`, `backend/open_webui/models/`, `backend/open_webui/utils/` (OCU client), `backend/open_webui/migrations/versions/`, `src/lib/components/chat/`, `src/lib/apis/ocu/`, `src/lib/stores/`, `src/lib/utils/` (link recogniser); minimal-diff touches to the upstream spine: `main.py` (one `include_router`), `env.py` (two env flags), `ChatControls.svelte` (hook sites), `Chat.svelte` (event handler beside `chat:reload` and one delegated click handler on the messages container), `Artifacts.svelte` (coexistence only). `models/chats.py` is not touched: chat deletion does not cascade to `ocu_chat_state` (design D14). Critical Paths rows in AGENTS.md apply to every one of these.
- **Sibling OCU checkout (`/Users/danker/Documents/31308/open-computer-use`, fork `DankerMu/open-computer-use`)**: `computer-use-server/app.py`, `docker_manager.py`, `mcp_tools.py`, `static/preview.js`, `openwebui/tools/computer_use_tools.py`, `openwebui/functions/computer_link_filter.py`, and `deploy/`. Tasks touching it are prefixed `[ocu]` / `[deploy]` and are tracked in this change and its epic (see design.md decision D2). OCU tests live in the OCU repo root `tests/` directory.
- **Runtime**: a reverse proxy becomes mandatory in front of WebUI and OCU; only the proxy publishes a LAN port; direct OCU exposure is removed and is not a rollback path. OCU refuses to start without `OCU_INTERNAL_TOKEN`.
- **Dependencies**: none added. No upgrades.
- **Verification surface**: `smoke/api.hurl` gains the pending OCU rows; AGENTS.md Verification Matrix "Pending" row is implemented (never before the routes exist).
