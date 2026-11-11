---
id: 2026-11-07-ocu-uploaded-skills
title: WebUI is OCU's skill registry, storing uploaded skill ZIPs in its own database
kind: architecture
status: implemented
date: 2026-11-07
supersedes: none
references: docs/plans/2026-11-07-ocu-uploaded-skills.md, ocu-uploaded-skills, DankerMu/open-webui#741, DankerMu/open-webui#742, 2026-09-21-ocu-mcp-service-credentials, 2026-09-20-ocu-chat-state-table, 2026-11-11-ocu-skill-display-name
---

# WebUI is OCU's skill registry, storing uploaded skill ZIPs in its own database

## Problem

OCU skills can only be added by rebuilding the OCU image. Administrators need to upload, narrow and delete skills from WebUI, and the user ruled out any `computer-use-server/` change. OCU's `skill_manager.py` already consumes an external registry (`MCP_TOKENS_URL`): it fetches a per-user config and downloads ZIPs by name with `X-Internal-Api-Key`. The choices were where the registry lives, which key guards it, where the bytes are stored, how a skill is named and who may use it. The source plan is [管理员上传的 OCU Skills](../../../plans/2026-11-07-ocu-uploaded-skills.md); the OpenSpec change is `ocu-uploaded-skills` (design Decisions 1-4, 6 and 10).

## Decision

- **Registry contract.** WebUI serves OCU's existing contract and adds no OCU API. Router `routers/ocu_skills.py` registers its routes unconditionally on its own router and imports nothing from the OCU workspaces router. That router mounts it with `prefix='/skills'` inside its `ENABLE_OCU_WORKSPACE` branch, so every route lives under `/api/v1/ocu/skills`, `main.py` is unchanged, and a disabled workspace leaves every route at 404. The internal routes sit at `…/api/internal/user-config/{email}` and `…/api/internal/skills/{name}/download`, so `MCP_TOKENS_URL=http://open-webui:8080/api/v1/ocu/skills` yields OCU's literal paths.
- **Inbound key.** The internal routes accept `X-Internal-Api-Key` equal to `OCU_INTERNAL_TOKEN`, read from `os.environ` at request time and compared with `hmac.compare_digest`. An empty token rejects every request with 401, and cookies and bearer sessions are ignored. OCU's `MCP_TOKENS_API_KEY` carries the same value. The REST/MCP credential split of the 2026-09-21 service-credentials decision is unchanged; this adds the OCU → WebUI direction only.
- **Data model.** One additive migration (`f7a8b9c0d1e2`, down_revision `e6f7a8b9c0d1`) creates `ocu_skill(name PK, description, zip_sha256, size, data, created_by, created_at, updated_at)` and `ocu_skill_user_disable(user_id, skill_name)`, both columns forming the primary key. The ZIP bytes live in the deferred `LargeBinary` column `data`, never in `Storage` or `UPLOAD_DIR`. List and enabled-set queries never load `data`. Grants reuse `access_grant` with `resource_type='ocu_skill'` and `resource_id=<name>`. Upload, replace and delete are each one DB transaction. The downgrade drops both tables and deletes every `ocu_skill` grant. A later migration adds the nullable `display_name` column; see [2026-11-11-ocu-skill-display-name](2026-11-11-ocu-skill-display-name.md).
- **Name and identity.** The `SKILL.md` frontmatter `name` must match `^[a-z0-9][a-z0-9-]{0,63}$`; it is both the primary key and the mount directory. Re-uploading a name replaces ZIP, SHA-256, size and description in place and keeps grants and disables. A first upload writes the `user:*` read grant. A hardcoded reserved list (OCU `skills/public/` names, `remotion`, and every `NATIVE_PROMPT_DESCRIPTIONS` key) is rejected with 400, and a drift test checks it against the pinned OCU checkout.
- **Enabled set.** A skill is in a user's enabled set exactly when it exists, the user holds a read grant through the existing `AccessGrants` filter (or is an administrator with `BYPASS_ADMIN_ACCESS_CONTROL` on), and the user has no disable row for it. The per-user list, the `/` menu and the internal `user-config` use the same query. A toggle on a skill without read access returns 404. Admin routes require `role == 'admin'`; `GET /admin` lists every skill with its current read grants as `{principal_type, principal_id, permission}`.
- **Proxy second line.** The gateway answers `location ^~ /api/v1/ocu/skills/api/internal/ { return 404; }` ahead of its catch-all row, so browser traffic never reaches the internal routes, even with a leaked key.

## Alternatives considered

- **Keep OCU's `settings-wrapper` and add a UI to it** — a second service with a second user store; WebUI already owns users, groups and grants.
- **Change OCU to call a new WebUI API** — the user ruled out `computer-use-server/` changes; serving the existing contract needs none.
- **A separate inbound key** — rejected by the user; both ends share one private trust domain, and the proxy row removes browser reachability.
- **ZIPs in `Storage`/`UPLOAD_DIR`** — the existing admin "reset uploads" and "delete all files" actions empty that directory, a file and a row cannot be replaced or deleted in one transaction, and orphan files become possible.
- **Disables in the `user.settings` JSON** — the frontend rewrites that blob wholesale, so concurrent writes would clobber each other.
- **Mount the router in `main.py`** — `main.py` is above the line ceiling and on the upstream spine; the fork-owned OCU router already holds the workspace gate.

## Consequences

- The database grows by up to 50 MB per skill, and DB backups carry the skills.
- The workspace gate is decided at import, so monkeypatching the flag after import does not remove routes. Every "workspace disabled" test runs in a fresh process through `test/ocu_office_flag_process.py`.
- A revoked or deleted skill stays readable in running sandboxes until they are rebuilt, and OCU falls back to its cached user-config while WebUI is unreachable. A replaced ZIP reaches running sandboxes that already mount it within minutes.
- The routes land across the change's tasks: task 1.1 (#742) ships the tables, the migration, the mount and `GET /admin`; access, delete, upload, per-user, internal and proxy rows follow in their own tasks.
