# CONTEXT.md

> Project identity, bounded contexts, and business invariants for this repository.
> `AGENTS.md` is the operating contract; `openspec/glossary.md` defines the domain vocabulary; this file defines the domain boundaries and invariants that agents must respect when applying both.

## Project Identity

Open WebUI 0.11.3 fork，为局域网部署集成 Open Computer Use 工作区侧栏与 ONLYOFFICE 编辑，面向约 20 名受信员工。

- **Primary users / consumers**: ~20 trusted employees on a company LAN; no anonymous entry, no public exposure
- **Business goal**: give every chat its own OCU sandbox with a Files/Browser/Terminal sidebar (Plan 1) and in-place Office editing with versioning (Plan 2), while staying rebase-able onto upstream Open WebUI
- **Lifecycle**: production, multi-year; upstream sync expected

## Domain Language

Canonical terms and their prohibited aliases live in `openspec/glossary.md`. Read it before naming a domain concept; never define a term here.

## Bounded Contexts

| Context                                  | Owns                                                      | Key terms (defined in `openspec/glossary.md`) | Forbidden logic                                                                                              | Integration boundary                                                                                                |
| ---------------------------------------- | --------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| WebUI core (upstream)                    | chats, users, models, RAG, native Artifacts               | —                                             | fork-specific behavior inside upstream modules; drive-by refactors                                           | keep diffs minimal; new code in new modules                                                                         |
| OCU workspace (Plan 1)                   | `/api/v1/ocu/*` routes, workspace sidebar, per-chat state | 工作区, 沙箱, 产物, revision, file_id         | any authorization predicate other than `Chats.is_chat_owner`; reusing `artifactContents` for workspace state | external reverse proxy `auth_request` → OCU with internal token; sandbox network L3-isolated from the control plane |
| Office editing (Plan 2, OCU-side broker) | edit sessions, revisions, persist/publish, fence          | persist / publish, fence                      | last-writer-wins; editing outside `outputs`; new `document.key` per save                                     | ONLYOFFICE callback → broker; broker shares the per-chat lock with container start                                  |

## Core Invariants

- A workspace is keyed by `chat_id` only; there is no second identifier to keep in sync.
- Workspace authorization is owner-only: `Chats.is_chat_owner(chat_id, user.id)`. Shared chats, shared folders, public links and admin access all read as 404 on the workspace surface.
- `chat_id ∈ {"", "default"}` and `temporary:`/`local:`/`channel:` ids never reach OCU; the shared `default` container is never created or reused by the fork.
- A stopped sandbox is restarted only by an explicit, authorized `launch`; no tool call (including read-only `view`) restarts it implicitly; retention stops at 168 h and never deletes data or volumes.
- Model-generated HTML/SVG never executes on the WebUI origin: sandboxed iframe (opaque origin) when embedded, `Content-Security-Policy: sandbox allow-scripts allow-forms` when opened top-level.
- Sandbox network cannot reach the OCU/WebUI control plane at L3; the application-layer subnet check is defense in depth, never the only control.
- `revision` is monotonic per content change and is the only version authority; mtime is display-only.
- Every publish is an atomic replace inside a fence window under the per-chat lock; a conflicting concurrent write yields a visible conflict version, never a silent overwrite.
- Model API keys, MCP keys and the internal token reach only the owning chat's sandbox, never the browser and never a different chat's sandbox.

## Public Interfaces and Contracts

| Interface                                                                                                        | Contract source                                              | Backward compatibility rule                                       | Test seam                                          |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------- |
| `GET /api/v1/ocu/workspaces/{chat_id}`, `POST …/launch`, `POST …/refresh`, `PUT …/prefs`, `GET /api/v1/ocu/auth` | `docs/plans/2026-09-20-workspace-artifact-integration.md` §1 | additive fields only; 401/403/404/409/422 semantics fixed         | `smoke/api.hurl` (pending rows) + backend `pytest` |
| Reverse-proxy allowlist for `/ocu/*`                                                                             | plan §2 endpoint allowlist                                   | default-deny; adding a path is a reviewed change                  | A-T08 authorization smoke                          |
| Office broker `/office/*`                                                                                        | `docs/plans/2026-09-20-office-manual-editing.md` §2          | callback protocol fixed by ONLYOFFICE; `save_seq` never regresses | broker unit + fixture callbacks (B-T04, B-T08)     |
| Upstream Open WebUI REST/socket API                                                                              | upstream code at tag v0.11.3                                 | never changed by the fork                                         | `smoke/*.hurl`, `e2e/smoke.spec.ts`                |

## Forbidden Logic & Irreversible Operations

Captured verbatim from grilling (Q6.6); agents check this before writing code that deletes data, mutates schemas, or crosses a listed boundary.

| Rule                                                     | Scope                                                                          | Why                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 禁止生产部署、force-push、`--no-verify`、删除/重建数据库 | all environments; harness DB under `.run/data` is the only resettable database | irreversible; the LAN instance holds employee data                                                                                              |
| 禁止改动上游未触及的文件做「顺手重构」                   | every upstream file                                                            | destroys rebase-ability onto upstream Open WebUI                                                                                                |
| 禁止未经确认的依赖升级                                   | `package.json`, `pyproject.toml`, lockfiles                                    | offline LAN deployment; every version is pinned by digest                                                                                       |
| 禁止新增无计划的 Alembic 迁移                            | `backend/open_webui/migrations/versions/`                                      | schema changes must be named in a plan and be backward-compatible for rollback                                                                  |
| 人工不审代码，只审最终功能呈现                           | review policy                                                                  | humans gate on functional acceptance; code-level assurance is mechanical evidence + reviewer-subagent cross-review (AGENTS.md § Critical Paths) |

## Open Terminology Questions

| Question                                                                          | Why it matters                                                                                                                                | Candidate terms                                                    | Owner                 |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------- |
| WebUI's native "Artifacts" panel vs OCU 产物 — both are called "artifact" in code | agents conflate the sandboxed HTML panel with workspace files                                                                                 | 产物 (outputs) for OCU files; Artifact only for `Artifacts.svelte` | plan author           |
| "launch" vs "start" vs "resurrect" for bringing a stopped sandbox back            | three code paths in OCU (`launch` route, `_get_or_create_container`, `/terminal/*/resurrect-container`) must converge on one authorized entry | launch (authorized), start (internal), resurrect (retire)          | Plan 1 A1 implementer |
