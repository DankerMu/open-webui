# Tasks

Prefixes:
- `[webui]` = this repository.
- `[ocu]` = sibling checkout `open-computer-use`. Branch `<tool>/<slug>` off `main`; tests live in the OCU repo root `tests/` and run with the command in its `AGENTS.md`.
- `[deploy]` = the OCU repo `deploy/` overlay. Tests live in `tests/deploy/` and `deploy/proxy/tests/`.

Every production file ships with its test file in the same task (AGENTS.md § TDD), and each test is red before the implementation. No task may implement an item from design.md Non-Goals. "Enabled set" means: the skill exists, the user holds read access (including the administrator bypass), and the user has no disable row (design.md Decision 6).

Risk packs:
- **Selected:**
  - Public API: new routes;
  - Config: reuse of `ENABLE_OCU_WORKSPACE` and `OCU_INTERNAL_TOKEN`, overlay env;
  - File IO / path safety: ZIP validation and storage;
  - Schema: two tables and one migration;
  - Auth / secrets: admin, user and internal-key matrix;
  - Resource limits: 50 MB, 200 MB, 2000 entries;
  - Error handling / partial outputs: no residue on rejection; storage/DB ordering on replace and delete;
  - Documentation: decision record, glossary, AGENTS rows, user guide.
- **Not selected:**
  - Concurrency: last-writer-wins on admin replace is acceptable for administrator-only writes;
  - Legacy compatibility: native Skills are untouched and covered by their existing tests;
  - Release / packaging: no dependency change.

## 1. [webui] Registry data model and admin read/access/delete

- [ ] 1.1 Add `backend/open_webui/models/ocu_skills.py` with the `ocu_skill` and `ocu_skill_user_disable` tables and table methods (get, list all, insert-or-replace, delete-with-grants-and-disables). Add one additive Alembic migration (down_revision `e6f7a8b9c0d1`) whose downgrade drops both tables and deletes `resource_type='ocu_skill'` grants. Verify with model pytest and `make db-verify`.
- [ ] 1.2 Add `backend/open_webui/routers/ocu_skills.py`, registered in `main.py` with one `include_router` line under prefix `/api/v1/ocu/skills`. Routes are added only when `ocu_workspaces.ENABLE_OCU_WORKSPACE` is true. Add the admin `GET /admin`, `POST /{name}/access` and `DELETE /{name}` routes. Delete commits the DB removal first, then removes the stored file. Verify with router pytest via `TestClient`: an admin succeeds; a user gets 401; no session gets 401; an unknown name gets 404; with the workspace disabled every route gets 404; delete leaves no row, grant, disable row or file.
- [ ] 1.3 Ship the decision record `docs/decisions/implemented/architecture/2026-11-07-ocu-uploaded-skills.md`, recording design.md Decisions 1-4, 6 and 10 and linking the source plan. Add the AGENTS.md Critical Paths row for `backend/open_webui/routers/ocu_skills.py` and `models/ocu_skills.py`, requiring the auth matrix tests plus `make smoke`. Add the glossary term **上传 skill** to `openspec/glossary.md`. Verify with `make decisions-verify` and `make doc-gate`.

Suggested fixture level: expanded - schema, migration and admin authorization.
Minimal mergeable slice: atomic - the tables are dead without a route that reads them, and the routes cannot exist without the tables; the decision record must ship with the first code PR.

## 2. [webui] ZIP validation, reserved names and upload

- [ ] 2.1 Add the upload validator as `backend/open_webui/utils/ocu_skill_zip.py` with its paired test file. It implements every rule of design.md Decision 5:
  - reject absolute paths, `..` components, backslashes, symlinks and encrypted entries;
  - cap the archive at 2000 entries and the bytes actually read at 200 MB;
  - strip a single shared top-level directory;
  - require a root `SKILL.md` whose frontmatter has a valid `name` and a non-empty `description`.

  Verify with one pytest case per rejection class in spec `ocu-uploaded-skills` "ZIP validation", plus the wrapped-directory acceptance case.
- [ ] 2.2 Add the reserved built-in name list. Add a drift test that asserts the list covers every directory under `$OCU_CHECKOUT/skills/public/` plus `remotion`; `OCU_CHECKOUT` defaults to `../open-computer-use`, and a missing directory fails with a message instead of skipping. Add the pinned OCU checkout steps (as in `layer3-integration-tests`, `.github/workflows/ci.yml:111-121`) to `layer2-unit-tests` and export `OCU_CHECKOUT`; the PR must flag this CI change. Verify locally that the drift test fails after removing one name from the list and passes with the full list.
- [ ] 2.3 Add admin `POST /upload`:
  - read at most 50 MB plus one byte (413 above 50 MB), validate, then store via `Storage`;
  - commit insert-or-replace;
  - on a first upload, write the `user:*` read grant;
  - on replace, keep grants and disables and remove the old file after commit;
  - on a DB failure, remove the new file;
  - reject reserved names with 400.

  Verify with router pytest: a first upload yields a single wildcard grant and the right SHA-256 and size; replace keeps narrowed grants and disables; every rejection leaves the listing, storage directory and grants unchanged; a reserved name gets 400. Add a `smoke/` hurl case for an admin upload, then delete it.

Suggested fixture level: expanded - path safety, resource limits and file storage.
Minimal mergeable slice: tasks 2.1 + 2.3 together with their tests (validator wired by the upload route, so no dead code); task 2.2 can merge after as its own PR because the upload route accepts any valid name until the reserved check lands. Keep 2.2 separate.

## 3. [webui] Per-user list and toggle

- [ ] 3.1 Add the enabled-set query to `models/ocu_skills.py`: read access through `AccessGrants`, honoring `BYPASS_ADMIN_ACCESS_CONTROL` for administrators, minus the user's disable rows. Add the user routes `GET /` (granted skills with `enabled`) and `POST /{name}/toggle` (404 without read access or for an unknown name). Verify with router pytest: a group-narrowed skill is hidden from a non-member; the default-open skill is listed as enabled; a disable affects only the caller; an ungranted toggle gets 404 and stores nothing; no session gets 401; the workspace disabled gets 404.

Suggested fixture level: expanded - authorization and persisted per-user state.
Minimal mergeable slice: atomic - one query and the two routes that are its only callers.

## 4. [webui] Internal registry endpoints

- [ ] 4.1 Add `GET /api/internal/user-config/{email}` and `GET /api/internal/skills/{name}/download`:
  - authenticate by `X-Internal-Api-Key` equal to `OCU_INTERNAL_TOKEN` via `hmac.compare_digest`, with an empty token or missing header giving 401 with an empty body, and cookies ignored;
  - user-config returns the OCU contract shape built from the task 3.1 enabled-set query; an unknown email gives 200 with an empty list;
  - download returns `application/zip`, or 404 for an unknown name.

  Verify with router pytest: no key, wrong key, cookie only and an empty configured token each get 401; the enabled set excludes the user's disabled skill; the download SHA-256 equals the advertised `zip_sha256`; a deleted skill gets 404. Add `smoke/` hurl cases for an internal call with and without the key. Add an AGENTS.md Verification Matrix row for these endpoints.

Suggested fixture level: expanded - a server-to-server secret and a public contract consumed by OCU.
Minimal mergeable slice: atomic - the two routes form one contract that OCU calls in sequence; neither is useful alone.

## 5. [webui] Admin Settings tab

- [ ] 5.1 Add `src/lib/apis/ocu/skills.ts` (with `skills.test.ts`) covering the admin and user routes. Add the Admin Settings 「工作区 Skills」 tab component: upload with the server's rejection reason shown, a list, access editing through `workspace/common/AccessControl.svelte`, delete behind a confirmation dialog, and the stated revocation notice. Make a minimal diff to the admin settings tab list, shown only when `features.enable_ocu_workspace`. Run `npm run i18n:parse` for new strings. Verify with `make test-frontend` and a Playwright case in a new `e2e/ocu-skills.e2e.ts` under `make verify-ui-ocu`: upload a fixture ZIP and see it listed; cancel delete and see it remain; confirm delete and see it disappear; screenshots, zero console errors.

Suggested fixture level: compact - an isolated new settings tab over existing routes; the only shared touch is one tab-list entry.
Minimal mergeable slice: atomic - the API client is dead without its first caller, and this tab is that caller.

## 6. [webui] Personal Settings tab

- [ ] 6.1 Add the personal Settings 「工作区 Skills」 tab component, with one switch per granted skill backed by `GET /` and `POST /{name}/toggle`. Make a minimal diff to the personal settings tab list, shown only when `features.enable_ocu_workspace`. Verify with `make test-frontend` and a Playwright case in `e2e/ocu-skills.e2e.ts`: turn a switch off, reload, and see it still off; zero console errors.

Suggested fixture level: compact - an isolated settings tab over existing user routes.
Minimal mergeable slice: atomic - one component plus its tab entry.

## 7. [webui] Slash menu group

- [ ] 7.1 Add the 「工作区 Skills」 group to `Commands/SlashCommands.svelte` and its selection handling in `CommandSuggestionList.svelte`, as minimal upstream diffs. The group lists the user's enabled uploaded skills whenever `features.enable_ocu_workspace` is true, whatever the sandbox state or model filters. Selecting an entry inserts a mention serialized as `</ocu--{name}|{name}>`. Built-in OCU skills never appear, and nothing is requested when the workspace is disabled. Verify with `make test-frontend` and a Playwright case in `e2e/ocu-skills.e2e.ts`: a disabled skill is absent; the outgoing request body for a selected skill contains the marker; with the workspace disabled there is no group and no `/api/v1/ocu/skills` request.

Suggested fixture level: expanded - it touches the shared chat input entrypoint (upstream spine-adjacent command menu).
Minimal mergeable slice: atomic - one group and its selection branch; splitting them leaves an unselectable list.

## 8. [ocu] Filter marker rewrite

- [ ] 8.1 In `openwebui/functions/computer_link_filter.py` `inlet`:
  - replace each `</ocu--{name}|{label}>` in all user messages (string content and text parts) with `{label}`;
  - for the last user message only, append the named-skill sentence to the system message once per distinct name;
  - leave marker-free bodies byte-identical.

  Verify with OCU pytest for the single, repeated, earlier-message and no-marker cases, and confirm the existing `ocu-filter-auth` tests stay green. Verify the fallback in this repository with a backend pytest case that sends a marker through `strip_skill_mentions` and gets `{label}`.

Suggested fixture level: compact - an isolated text transform in one filter method, with no auth, schema or IO change.
Minimal mergeable slice: atomic - one transform plus its tests.

## 9. [deploy] Wire OCU to the WebUI registry

- [ ] 9.1 In `deploy/production-like-test/` compose and bootstrap, set `MCP_TOKENS_URL=http://open-webui:8080/api/v1/ocu/skills` on `computer-use-server`, and set `MCP_TOKENS_API_KEY` from the `OCU_INTERNAL_TOKEN` source, never written to a repository file, command line or log. The deployment record shows only configured yes/no. Verify with `tests/deploy/` cases: the rendered service environment has both values; the token appears in no other rendered file; an unset `OCU_INTERNAL_TOKEN` still triggers the existing bootstrap refusal.

Suggested fixture level: expanded - production config and a secret.
Minimal mergeable slice: atomic - two environment entries consumed together by the skill manager.

## 10. [deploy] Proxy deny row and gateway smoke

- [ ] 10.1 [deploy] Add `location ^~ /api/v1/ocu/skills/api/internal/ { return 404; }` to `deploy/proxy/nginx.conf.in` ahead of the catch-all row. Verify with `deploy/proxy/tests/` render and entrypoint cases: the internal path gets 404 for every method, and other `/api/v1/ocu/skills` paths still reach WebUI.
- [ ] 10.2 [webui] Bump `constraints.yaml ocu_checkout.sha` to the OCU commit containing tasks 8.1, 9.1 and 10.1. Add a `smoke/proxy/` hurl case: `GET /api/v1/ocu/skills/api/internal/user-config/x@y.z` with a key header gets 404 and the WebUI access log has no matching request; `GET /api/v1/ocu/skills/` as a signed-in user gets 200. Add an AGENTS.md Verification Matrix row. Verify with `make smoke-proxy`.

Suggested fixture level: expanded - the browser gateway auth boundary.
Minimal mergeable slice: task 10.1 in the OCU repository first; it keeps OCU green alone. Task 10.2 depends on the merged OCU commit and on task 3.1 (the forwarded user route).

## 11. [webui] User guide

- [ ] 11.1 Add the user guide `docs/uploaded-skills.md`, linked from AGENTS.md Project Identity next to the Office user guide. It covers uploading as an administrator, ZIP layout, limits and rejection reasons, narrowing access, personal switches, `/` usage, and the effect timing table from the source plan. Verify with `make doc-gate`.

Suggested fixture level: none - docs only.
Minimal mergeable slice: atomic - one document.
