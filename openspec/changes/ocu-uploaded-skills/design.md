# Design

## Context

See `proposal.md` (Why) and the source plan `docs/plans/2026-11-07-ocu-uploaded-skills.md`, whose What Already Exists section holds the code citations. Constraints that shape the approach:

- **OCU is fixed.** `computer-use-server/skill_manager.py` already consumes an external registry.
  - It calls `GET {MCP_TOKENS_URL}/api/internal/user-config/{email}` and `GET …/api/internal/skills/{name}/download`, both with `X-Internal-Api-Key`.
  - It caches ZIPs by `zip_sha256` and mounts them read-only at `/mnt/skills/user/{name}`.
  - The download is triggered by the system-prompt render (`system_prompt.py:728-733` calls `ensure_skill_cached`). A changed `zip_sha256` is re-downloaded and extracted in place over the cached directory (`skill_manager.py:443-453`). Sandbox creation only reads the cache (`docker_manager.py:1312`).
  - A failed `user-config` fetch falls back to the disk-cached user-config (`:552-557`), and a failed download keeps the stale extracted directory (`:401-407`).
  - `NATIVE_PROMPT_DESCRIPTIONS` (`:75`) overrides descriptions by name whatever the skill's category (`:616-618`).
  - It re-adds a built-in only when the response does not already carry that name (`:509-517`), so an uploaded name equal to a built-in replaces the built-in.
- **Server-to-server reachability already exists.** OCU reaches WebUI at `http://open-webui:8080` on the private network. The proxy's catch-all `location /` forwards every other path to WebUI (`deploy/proxy/nginx.conf.in:156`).
- **Existing toggle pattern.** The fork gates OCU routes with `ENABLE_OCU_WORKSPACE`: the router is always included and routes are added conditionally inside the `if ENABLE_OCU_WORKSPACE:` block (`routers/ocu_workspaces.py:290`). `ocu_workspaces.py` (fork-added, prefix `/api/v1/ocu`) mounts the new router by calling `router.include_router(ocu_skills.router, prefix='/skills')` inside that same block, so `main.py` is not changed. `ocu_skills` registers its routes unconditionally on its own router and imports nothing from `ocu_workspaces`, so there is no circular import; with the flag off the router is never mounted and every `ocu_skills` route returns 404. The flag already reaches the frontend as `features.enable_ocu_workspace` through the unchanged `main.py:2311`.
- **Line ceilings.** `main.py` (3043 lines, therefore not changed) and `chat/SettingsModal.svelte` (1325 lines) exceed the 800-line limit, and `scripts/lint-scoped.sh` blocks their growth. Both settings tabs (admin and personal) register in `SettingsModal.svelte`; the user approved a `constraints.yaml` `bounded_overrides` entry for it (ceiling about 1350, raised to 1365 by user approval on 2026-11-08 because each personal tab needs a hand-written sidebar button), following the existing user-approved entries.
- **Inlet filters run first.** Inlet filters run at `middleware.py:2635`, before native skill mentions are parsed (`:2732`) and stripped (`:2807`).
- **Pinned OCU checkout in CI.** CI checks out OCU at `constraints.yaml ocu_checkout.sha` into `.run/open-computer-use` and exports `OCU_CHECKOUT` (`.github/workflows/ci.yml:111-133`).
- **OCU work is tracked here.** OCU has GitHub issues disabled, so its tasks are tracked in this repository with an `[ocu]` / `[deploy]` prefix.

Change surface:

- `backend/open_webui/models/ocu_skills.py` (new);
- `backend/open_webui/routers/ocu_skills.py` (new);
- a migration (new);
- the `include_router` line inside the existing `if ENABLE_OCU_WORKSPACE:` block of `routers/ocu_workspaces.py` (`main.py` is not changed);
- `src/lib/apis/ocu/skills.ts` (new);
- two settings tab components (new), registration and render branches in `SettingsModal.svelte` under the bounded override, and slash-menu minimal diffs;
- OCU `openwebui/functions/computer_link_filter.py`, `deploy/production-like-test/`, `deploy/proxy/nginx.conf.in`.

Must preserve:

- native Skills behaviour (table, routes, `view_skill`, mentions);
- OCU built-in skills and their prompt;
- every existing proxy row;
- `ocu-filter-auth` behaviour;
- deployments with `ENABLE_OCU_WORKSPACE=false` see no new route or UI.

Governing invariant: a user's sandbox mounts an uploaded skill only if that skill is in the user's enabled set (Decision 6). Only an administrator can create, replace or delete that skill.

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
2. **Reuse `OCU_INTERNAL_TOKEN` as the inbound key.** `ocu_skills` reads it from `os.environ` at request time, as `utils/ocu_client.py:41` does, not from the import-time copy at `routers/ocu_workspaces.py:30`, so it imports nothing from `ocu_workspaces`. The comparison uses `hmac.compare_digest`. An empty token rejects every internal request (401). The internal routes ignore cookies and bearer sessions. The deploy overlay sets OCU's `MCP_TOKENS_API_KEY` to the same value. Alternative considered: a separate key (rejected by the user; both ends share one private trust domain).
3. **Data model.**
   - Two tables:
     - `ocu_skill(name PK, description, zip_sha256, size, data LargeBinary, created_by, created_at, updated_at)`;
     - `ocu_skill_user_disable(user_id, skill_name; PK both)`.
   - The ZIP bytes live in `ocu_skill.data`, not in `Storage`/`UPLOAD_DIR`. The existing admin "reset uploads" and "delete all files" actions empty that directory (`routers/retrieval.py:3204-3220`, `routers/files.py:562-569`); in the DB the skill survives them, DB backups carry it, and no file can be orphaned.
   - `data` is a deferred column. List and enabled-set queries never load it; only the download route reads it.
   - Grants use the existing `access_grant` table with `resource_type='ocu_skill'` and `resource_id=name`. Upload, replace and delete are each one DB transaction: delete removes the row (with its bytes), all grants and all disable rows together.
   - One additive migration with down_revision `e6f7a8b9c0d1`; downgrade drops both tables and deletes `ocu_skill` grants.
   - Alternative considered: store disables in `user.settings` JSON. Rejected: the frontend rewrites that blob wholesale, so concurrent writes would clobber each other.
4. **Name and identity.**
   - `name` comes from the `SKILL.md` frontmatter. It must match `^[a-z0-9][a-z0-9-]{0,63}$`; it is the mount directory and the primary key.
   - Re-uploading an existing name replaces ZIP, sha256, size and description in place and keeps grants and disables. A first upload writes the `user:*:read` grant.
   - The reserved list is hardcoded in `ocu_skills.py`: every OCU `skills/public/` directory name, `remotion`, and every key of `NATIVE_PROMPT_DESCRIPTIONS`. The last set is reserved because OCU overrides a description by name whatever the skill's category (`skill_manager.py:616-618`), so an upload named, for example, `internal-comms` would show OCU's own description. A reserved name returns 400; the check ships in the same slice as the upload route (task 2.1), so no revision of `main` accepts a reserved name.
   - A drift test asserts that the list covers `$OCU_CHECKOUT/skills/public/*`, `remotion`, and the `NATIVE_PROMPT_DESCRIPTIONS` keys parsed from the pinned `computer-use-server/skill_manager.py`. `OCU_CHECKOUT` defaults to `<repo root>/../open-computer-use`, resolved from the repository root (as `scripts/proxy-dev.sh:10` does), not from the pytest working directory (`backend/`); CI sets it explicitly. A missing checkout fails the test with a message; there is no skip.
5. **Validation before any write.**
   - The whole request body is read up to 50 MB plus one byte; anything larger returns 413.
   - Each entry is checked:
     - absolute paths, any `..` component, backslashes, symlink mode bits in `external_attr` and the encryption flag are all rejected;
     - at most 2000 entries;
     - after the top-level strip, paths must be canonical (no empty or `.` segment) and no file may lie under another file's path, so every accepted archive extracts in OCU;
     - only stored and deflated entries are accepted (CPython bounds decompressed output per read only for deflate), and only regular files and directories;
     - the declared uncompressed total is capped at 200 MB before anything is read; every entry is then read in bounded chunks and CRC-checked, and `zipfile` never returns more than the declared size, so a forged `file_size` does not help.
   - The single top-level directory is stripped exactly as OCU does. `SKILL.md` must then sit at the root with YAML frontmatter containing a valid `name` and a non-empty `description`.
   - `SKILL.md` is read as UTF-8 (one leading BOM stripped, CRLF normalized), capped at 1 MB, and its `description` must be a non-empty string.
   - Any other failure returns 400 with a reason and writes nothing.
   - The insert or replace (row with `data`, plus the `user:*` grant on a first upload) is one DB transaction after validation. A failed commit rolls back, so the previous row and its downloadable bytes stay unchanged; there is no file to order or clean up.
6. **Authorization semantics.** This is the single definition of the **enabled set**; every other artifact refers to it. A skill is in a user's enabled set exactly when:
   - the skill exists, AND
   - the user holds a read grant through the existing `AccessGrants` filter, OR the user is an administrator and `BYPASS_ADMIN_ACCESS_CONTROL` is on (as native resources do, `routers/skills.py:46`), AND
   - the user has no disable row for it.

   The per-user list `GET /` returns the readable skills (the first two conditions) with `enabled` reflecting the third; the `/` menu shows its enabled entries; `user-config` returns the enabled set. All three use the same query, so an administrator sees a group-narrowed skill in `user-config` exactly when it appears in that administrator's `GET /`. A user's toggle on a skill without read access returns 404. The admin endpoints require `role == 'admin'`.

7. **`user-config` response.** It returns `{"email", "enabled_skills": [{"name", "description", "category": "user", "zip_sha256"}]}`. An unknown email returns an empty list with 200, because OCU then falls back to its built-ins. Email lookup uses the existing normalized unique email index (`f0bd01a18a3d`). `download` returns `application/zip` for an existing skill and 404 otherwise, whoever asks; the key is the authority, so no per-user check is applied.
8. **Frontend placement.**
   - Admin Settings gets a 「工作区 Skills」 tab. It provides upload, a list, access editing through `AccessControl.svelte`, and delete with a confirmation dialog. The tab states both timings: revocation and deletion reach running sandboxes only after they are rebuilt; a replaced ZIP reaches running sandboxes that already mount it within minutes.
   - Personal Settings gets a 「工作区 Skills」 tab with one persistent switch per readable skill (Decision 6).
   - The `/` menu shows a 「工作区 Skills」 group whenever `features.enable_ocu_workspace` is true, whatever the sandbox state or the model's filters. Its data is the user's enabled set, and selecting an entry inserts a mention node with id `ocu--{name}|{name}` and label `{name}`, as the native skill branch puts the label into the id (`CommandSuggestionList.svelte:136-139`). The existing editor serializes a `/` mention as `<$id>`, writing only the node id and turning `/` into `$` (`RichTextInput.svelte:117-125`), so the sent text carries `<$ocu--{name}|{name}>`; `RichTextInput.svelte` is not changed.
   - The tab content lives in new components; `SettingsModal.svelte` only gets the two tab registrations and render branches.
   - Everything is hidden when the flag is false, and the frontend then makes no `/api/v1/ocu/skills` request.
9. **Marker rewrite in the OCU filter inlet.**
   - The filter regex keys on the `<$ocu--` prefix. In every user message, each `<$ocu--{name}|{label}>` becomes `{label}`; for the last user message only, one sentence per distinct name is appended to the system message: "用户通过 / 指定使用 skill `{name}`，先阅读 `<available_skills>` 中它的 `SKILL.md` 再动手".
   - Without the filter, native `strip_skill_mentions` turns the marker into `{label}`: `SKILL_MENTION_STRIP_RE` (`middleware.py:2293`) matches the `$` form, and the unknown id `ocu--{name}` is skipped as a native skill (`:2775-2780`).
   - A marker for a skill the user cannot use only adds the sentence; the skill is not mounted.
10. **Proxy second line.** `location ^~ /api/v1/ocu/skills/api/internal/ { return 404; }` sits ahead of the catch-all row, so browser traffic never reaches the internal routes, even with a leaked key.

Seams under test:

- WebUI HTTP API of the `ocu_skills` router through FastAPI `TestClient` against the harness DB. It is the highest seam that covers validation, grants, disables, the internal contract and the 401/403/404 matrix in one place.
- OCU filter `Filter.inlet()` called with a real body. It is the only seam where marker rewrite and prompt append are observable.
- Browser through Playwright under `make verify-ui-ocu`, for the three UI entry points. These are user-visible flows with no lower seam that proves rendering.
- Proxy through `make smoke-proxy` hurl with the pinned OCU SHA, because the deny row only exists in rendered nginx.

Required evidence:

- valid ZIP → 200 and listed for every user; replace → grants and disables unchanged; delete → absent everywhere;
- body over 50 MB → 413; each other rejection class → 400; both with the DB unchanged;
- an injected commit failure on first upload or replace → the previous row and its downloadable bytes unchanged;
- after the admin "reset uploads" / "delete all files" actions the skill is still downloadable;
- internal routes:
  - no key, wrong key, cookie only, or an empty configured token → 401;
  - unknown email → 200 with an empty list;
- user toggle on an ungranted skill → 404;
- `ENABLE_OCU_WORKSPACE=false` → 404 for all new routes, the internal ones included;
- a user-role caller on the admin routes → 401 with listing and grants unchanged;
- the internal path through the proxy → 404.

Review focus:

- the ZIP validator against zip-slip and zip bombs;
- one enabled-set query shared by all consumers, with `data` deferred;
- the internal key never accepts empty and never accepts a cookie;
- upload, replace and delete each as one DB transaction;
- the minimal diff on `SettingsModal.svelte` (registration and render branches only, within the bounded override) and the slash-menu files; `main.py` unchanged.

## Risks / Trade-offs

- [A revoked or deleted skill stays readable in running sandboxes until they are rebuilt] → accepted by the user; stated in the admin tab; no re-mount.
- [A replaced ZIP reaches running sandboxes in place] → the next system-prompt render for any granted user re-downloads it and extracts it over the cached directory, so RUNNING sandboxes that already mount that directory see the new content within roughly 60–420 s; new sandboxes read the cache only. Stated in the admin tab.
- [OCU falls back to its disk-cached user-config when WebUI is unreachable, and keeps stale extracted directories when a download fails, so revocations lag] → accepted; bounded by the next successful fetch. Real revocation means deleting in WebUI while the registry is reachable.
- [Stored ZIPs grow the database, at most 50 MB per skill] → accepted for administrator-only uploads; DB backups carry them.
- [A shared token means a leak compromises both directions] → accepted by the user; same private network; the proxy deny row removes browser reachability.
- [The reserved list drifts when OCU adds a built-in] → the drift test runs in CI against the pinned OCU checkout; a pin bump that adds a built-in fails until the list is updated.
- [Admin-uploaded scripts run in every granted sandbox] → the trust boundary is the administrator; no content review.
- [Large uploads are held in memory: the 50 MB body plus one read chunk plus a `SKILL.md` capped at 1 MB] → bounded by the size caps; administrators only. The deferred `data` column keeps list queries from loading the bytes.

## Migration Plan

- Deploy the WebUI image with the migration. It is additive; with no rows the feature is inert.
- Then deploy the OCU overlay with `MCP_TOKENS_URL` and `MCP_TOKENS_API_KEY` and the proxy row.
- Ordering: WebUI first. If OCU starts first, its user-config fetch gets 404 and falls back to built-ins, which matches today's behaviour.
- Revoking one skill: delete it in WebUI while the registry is reachable. Unsetting `MCP_TOKENS_URL` does NOT return OCU to built-ins only: OCU keeps using its disk-cached user-config (`skill_manager.py:552-557`) and the stale extracted directories (`:401-407`).
- Full rollback: delete the uploaded skills in WebUI while OCU can still reach the registry, unset `MCP_TOKENS_URL` and `MCP_TOKENS_API_KEY` on OCU, clear OCU's `SKILLS_CACHE_DIR` including `_user_configs/`, then roll back WebUI. The migration downgrade drops both tables and the `ocu_skill` grants. The user guide (task 11.1) states these steps.
