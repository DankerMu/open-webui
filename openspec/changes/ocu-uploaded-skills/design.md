# Design

## Context

See `proposal.md` (Why) and the source plan `docs/plans/2026-11-07-ocu-uploaded-skills.md`, whose What Already Exists section holds the code citations. Constraints that shape the approach:

- **OCU is fixed.** `computer-use-server/skill_manager.py` already consumes an external registry.
  - It calls `GET {MCP_TOKENS_URL}/api/internal/user-config/{email}` and `GET …/api/internal/skills/{name}/download`, both with `X-Internal-Api-Key`.
  - It caches ZIPs by `zip_sha256` and mounts them read-only at `/mnt/skills/user/{name}`.
  - It re-adds a built-in only when the response does not already carry that name (`:509-517`), so an uploaded name equal to a built-in replaces the built-in.
- **Server-to-server reachability already exists.** OCU reaches WebUI at `http://open-webui:8080` on the private network. The proxy's catch-all `location /` forwards every other path to WebUI (`deploy/proxy/nginx.conf.in:156`).
- **Existing toggle pattern.** The fork gates OCU routes with `ENABLE_OCU_WORKSPACE`: the router is always included and routes are added conditionally (`routers/ocu_workspaces.py:290`). The flag already reaches the frontend as `features.enable_ocu_workspace` (`main.py:2311`).
- **Inlet filters run first.** Inlet filters run at `middleware.py:2635`, before native skill mentions are parsed (`:2732`) and stripped (`:2807`).
- **Pinned OCU checkout in CI.** CI checks out OCU at `constraints.yaml ocu_checkout.sha` into `.run/open-computer-use` and exports `OCU_CHECKOUT` (`.github/workflows/ci.yml:111-133`).
- **OCU work is tracked here.** OCU has GitHub issues disabled, so its tasks are tracked in this repository with an `[ocu]` / `[deploy]` prefix.

Change surface:
- `backend/open_webui/models/ocu_skills.py` (new);
- `backend/open_webui/routers/ocu_skills.py` (new);
- a migration (new);
- the `main.py` include line;
- `src/lib/apis/ocu/skills.ts` (new);
- two settings tab components (new), plus tab-list and slash-menu minimal diffs;
- OCU `openwebui/functions/computer_link_filter.py`, `deploy/production-like-test/`, `deploy/proxy/nginx.conf.in`.

Must preserve:
- native Skills behaviour (table, routes, `view_skill`, mentions);
- OCU built-in skills and their prompt;
- every existing proxy row;
- `ocu-filter-auth` behaviour;
- deployments with `ENABLE_OCU_WORKSPACE=false` see no new route or UI.

Governing invariant: a user's sandbox mounts an uploaded skill only if that skill exists, the user holds read access, and the user has not disabled it. Only an administrator can create, replace or delete that skill.

Sibling surfaces that share the invariant:
- `GET /api/v1/ocu/skills/` (per-user list);
- the `/` menu;
- the internal `user-config`;
- the internal `download`;
- `sub_agent` skill text (OCU builds it from the same user-config).

## Goals / Non-Goals

**Goals:**
- Upload, replace and hard-delete ZIP skills by administrators, with validation stricter than OCU's extractor.
- Default visibility to everyone (`user:*:read`) that administrators can narrow with the existing access-control UI.
- Persistent per-user disable, and a `/` group of the user's enabled uploaded skills.
- Serve OCU's existing registry contract so that `computer-use-server/` needs no change.

**Non-Goals:**
- Changes to native Open WebUI Skills.
- Built-in OCU skills in the `/` menu, or disabling them.
- Any `computer-use-server/` change, including OCU extractor hardening (#740).
- Immediate effect or revocation in running sandboxes; re-mounting.
- Uploads by non-administrators; version history; a global "disable for all" switch; a new feature flag.
- Checking the script content of uploaded skills.

## Not yet specified

无。

## Decisions

1. **WebUI serves OCU's registry contract.** It does not add a new OCU API. The two internal routes sit under the router prefix `/api/v1/ocu/skills`, so `MCP_TOKENS_URL=http://open-webui:8080/api/v1/ocu/skills` yields OCU's literal paths `…/api/internal/user-config/{email}` and `…/api/internal/skills/{name}/download`. Alternatives considered: keep `settings-wrapper` and add a UI to it (a second service and a second user store); or change OCU to call a new WebUI API (the user ruled out `computer-use-server/` changes).
2. **Reuse `OCU_INTERNAL_TOKEN` as the inbound key.** The comparison uses `hmac.compare_digest`. An empty token rejects every internal request (401). The internal routes ignore cookies and bearer sessions. The deploy overlay sets OCU's `MCP_TOKENS_API_KEY` to the same value. Alternative considered: a separate key (rejected by the user; both ends share one private trust domain).
3. **Data model.**
   - Two tables:
     - `ocu_skill(name PK, description, zip_sha256, size, storage_path, created_by, created_at, updated_at)`;
     - `ocu_skill_user_disable(user_id, skill_name; PK both)`.
   - Grants use the existing `access_grant` table with `resource_type='ocu_skill'` and `resource_id=name`. Delete removes the row, the stored ZIP, all grants and all disable rows in one transaction; the ZIP file is removed after commit.
   - One additive migration with down_revision `e6f7a8b9c0d1`; downgrade drops both tables and deletes `ocu_skill` grants.
   - Alternative considered: store disables in `user.settings` JSON. Rejected: the frontend rewrites that blob wholesale, so concurrent writes would clobber each other.
4. **Name and identity.**
   - `name` comes from the `SKILL.md` frontmatter. It must match `^[a-z0-9][a-z0-9-]{0,63}$`; it is the mount directory and the primary key.
   - Re-uploading an existing name replaces ZIP, sha256, size and description in place and keeps grants and disables. A first upload writes the `user:*:read` grant.
   - Names in the reserved list (OCU `skills/public/` directory names plus `remotion`) return 400. A drift test asserts that the list covers `$OCU_CHECKOUT/skills/public/*` plus `remotion`. `OCU_CHECKOUT` defaults to `../open-computer-use`. A missing checkout fails the test with a message; there is no skip.
5. **Validation before any write.**
   - The whole request body is read up to 50 MB plus one byte; anything larger returns 413.
   - Each entry is checked:
     - absolute paths, any `..` component, backslashes, symlink mode bits in `external_attr` and the encryption flag are all rejected;
     - at most 2000 entries;
     - uncompressed bytes are counted while reading and capped at 200 MB, so a forged `file_size` does not help.
   - The single top-level directory is stripped exactly as OCU does. `SKILL.md` must then sit at the root with YAML frontmatter containing a valid `name` and a non-empty `description`.
   - Any failure returns 400 with a reason and writes nothing.
   - Storage write happens after validation. The DB commit happens after the storage write. On DB failure the stored file is removed, and on replace the old file is removed only after commit.
6. **Authorization semantics.** Read access follows the existing `AccessGrants` filter, including `BYPASS_ADMIN_ACCESS_CONTROL` for administrators, as native resources do (`routers/skills.py:46`). The enabled set for a user is: read access AND no disable row. The per-user list, the `/` menu and `user-config` all use this one query; a user's toggle on a skill without read access returns 404. The admin endpoints require `role == 'admin'`.
7. **`user-config` response.** It returns `{"email", "enabled_skills": [{"name", "description", "category": "user", "zip_sha256"}]}`. An unknown email returns an empty list with 200, because OCU then falls back to its built-ins. Email lookup uses the existing normalized unique email index (`f0bd01a18a3d`). `download` returns `application/zip` for an existing skill and 404 otherwise, whoever asks; the key is the authority, so no per-user check is applied.
8. **Frontend placement.**
   - Admin Settings gets a 「工作区 Skills」 tab. It provides upload, a list, access editing through `AccessControl.svelte`, and delete with a confirmation dialog. The tab states that revocation reaches running sandboxes only after they are rebuilt.
   - Personal Settings gets a 「工作区 Skills」 tab with one persistent switch per granted skill.
   - The `/` menu shows a 「工作区 Skills」 group whenever `features.enable_ocu_workspace` is true, whatever the sandbox state or the model's filters. Its data is the user's enabled list, and selecting an entry inserts the mention node `</ocu--{name}|{name}>`.
   - Everything is hidden when the flag is false.
9. **Marker rewrite in the OCU filter inlet.**
   - In the last user message, each `</ocu--{name}|{label}>` becomes `{label}`. One sentence per distinct name is appended to the system message: "用户通过 / 指定使用 skill `{name}`，先阅读 `<available_skills>` 中它的 `SKILL.md` 再动手".
   - Without the filter, native `strip_skill_mentions` turns the marker into `{name}`, because the marker charset matches `SKILL_MENTION_RE`.
   - A marker for a skill the user cannot use only adds the sentence; the skill is not mounted.
10. **Proxy second line.** `location ^~ /api/v1/ocu/skills/api/internal/ { return 404; }` sits ahead of the catch-all row, so browser traffic never reaches the internal routes, even with a leaked key.

Seams under test:
- WebUI HTTP API of the `ocu_skills` router through FastAPI `TestClient` against the harness DB. It is the highest seam that covers validation, grants, disables, the internal contract and the 401/403/404 matrix in one place.
- OCU filter `Filter.inlet()` called with a real body. It is the only seam where marker rewrite and prompt append are observable.
- Browser through Playwright under `make verify-ui-ocu`, for the three UI entry points. These are user-visible flows with no lower seam that proves rendering.
- Proxy through `make smoke-proxy` hurl with the pinned OCU SHA, because the deny row only exists in rendered nginx.

Required evidence:
- valid ZIP → 200 and listed for every user; replace → grants and disables unchanged; delete → absent everywhere;
- each rejection class → 400, with storage and DB unchanged;
- internal routes:
  - no key, wrong key, cookie only, or an empty configured token → 401;
  - unknown email → 200 with an empty list;
- user toggle on an ungranted skill → 404;
- `ENABLE_OCU_WORKSPACE=false` → 404 for all new routes;
- the internal path through the proxy → 404.

Review focus:
- the ZIP validator against zip-slip and zip bombs;
- one enabled-set query shared by all four consumers;
- the internal key never accepts empty and never accepts a cookie;
- the replace and delete ordering between storage and DB;
- the minimal diff on upstream settings, slash-menu and `main.py` files.

## Risks / Trade-offs

- [A revoked or deleted skill stays readable in running sandboxes until they are rebuilt] → accepted by the user; stated in the admin tab; no re-mount.
- [OCU falls back to its disk-cached user-config when WebUI is unreachable, so revocations lag] → accepted; bounded by the next successful fetch.
- [A shared token means a leak compromises both directions] → accepted by the user; same private network; the proxy deny row removes browser reachability.
- [The reserved list drifts when OCU adds a built-in] → the drift test runs in CI against the pinned OCU checkout; a pin bump that adds a built-in fails until the list is updated.
- [Admin-uploaded scripts run in every granted sandbox] → the trust boundary is the administrator; no content review.
- [Large uploads are held in memory, at most 50 MB] → bounded by the size cap; administrators only.

## Migration Plan

- Deploy the WebUI image with the migration. It is additive; with no rows the feature is inert.
- Then deploy the OCU overlay with `MCP_TOKENS_URL` and `MCP_TOKENS_API_KEY` and the proxy row.
- Ordering: WebUI first. If OCU starts first, its user-config fetch gets 404 and falls back to built-ins, which matches today's behaviour.
- Rollback: unset `MCP_TOKENS_URL` on OCU (built-ins only again), then roll back WebUI. The migration downgrade drops both tables and the `ocu_skill` grants.
