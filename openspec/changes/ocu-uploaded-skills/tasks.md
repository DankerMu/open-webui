# Tasks

Prefixes:

- `[webui]` = this repository.
- `[ocu]` = sibling checkout `open-computer-use`. Branch `<tool>/<slug>` off `main`; tests live in the OCU repo root `tests/` and run with the command in its `AGENTS.md`.
- `[deploy]` = the OCU repo `deploy/` overlay. Tests live in `tests/deploy/` and `deploy/proxy/tests/`.

Every production file ships with its test file in the same task (AGENTS.md § TDD), and each test is red before the implementation. No task may implement an item from design.md Non-Goals. "Enabled set" is defined once, in design.md Decision 6; tasks refer to it and do not restate it. Each task is sized to fit one PR of at most 400 diff lines, tests and docs included (CI layer6), unless its group states a `diff-limit-exempt` reason.

Risk packs:

- **Selected:**
  - Public API: new routes;
  - Config: reuse of `ENABLE_OCU_WORKSPACE` and `OCU_INTERNAL_TOKEN`, overlay env;
  - File IO / path safety: ZIP validation; bytes stored in the `ocu_skill.data` DB column;
  - Schema: two tables and one migration;
  - Auth / secrets: admin, user and internal-key matrix;
  - Resource limits: 50 MB (413), 200 MB, 2000 entries;
  - Error handling / partial outputs: no residue on rejection; upload, replace and delete each one DB transaction, proven by an injected commit failure;
  - Documentation: decision record, glossary, AGENTS rows, user guide.
- **Not selected:**
  - Concurrency: last-writer-wins on admin replace is acceptable for administrator-only writes;
  - Legacy compatibility: native Skills are untouched and covered by their existing tests;
  - Release / packaging: no dependency change.

## 1. [webui] Registry data model, admin listing, access and delete

- [ ] 1.1 Add `backend/open_webui/models/ocu_skills.py` with the `ocu_skill` table (ZIP bytes in a deferred `LargeBinary` column `data`) and the `ocu_skill_user_disable` table, plus the get and list-all table methods; list-all never loads `data`. Add one additive Alembic migration (down_revision `e6f7a8b9c0d1`) whose downgrade drops both tables and deletes `resource_type='ocu_skill'` grants. Add `backend/open_webui/routers/ocu_skills.py`, which registers its routes unconditionally on its own router and imports nothing from `ocu_workspaces`. Mount it by calling `router.include_router(ocu_skills.router, prefix='/skills')` inside the existing `if ENABLE_OCU_WORKSPACE:` block of `routers/ocu_workspaces.py:290` (giving `/api/v1/ocu/skills`; `main.py` is not changed), so with the flag off every `ocu_skills` route returns 404. Because the gate is the mount, monkeypatching `ocu_workspaces.ENABLE_OCU_WORKSPACE` after import does not remove the routes: every "workspace disabled" case in this change imports the app in a fresh process with `ENABLE_OCU_WORKSPACE=false`. Extend the existing fresh-process helper `backend/open_webui/test/ocu_office_flag_process.py` (it already runs with `--workspace false`) to report the status of given `/api/v1/ocu/skills` requests, and reuse it in every later task; add no second subprocess helper. Add the admin `GET /admin` route, returning each skill's current read grant set (spec: Administrator listing with grants; Stage 3 finding SA-1). Ship the decision record `docs/decisions/implemented/architecture/2026-11-07-ocu-uploaded-skills.md`, recording design.md Decisions 1-4, 6 and 10 and linking the source plan; the AGENTS.md Critical Paths row for `backend/open_webui/routers/ocu_skills.py` and `models/ocu_skills.py`, requiring the auth matrix tests plus `make smoke`; and the glossary term **上传 skill** in `openspec/glossary.md`. Verify with model pytest (list-all does not load `data`), router pytest via `TestClient` (an admin gets the listing; a user gets 401; no session gets 401; with the workspace disabled the route gets 404), `make db-verify`, `make decisions-verify` and `make doc-gate`.
      Task 1.1 required evidence (issue #742; each item is input → expected output):
  - **Model (list-all).**
    - Seed two `ocu_skill` rows with non-empty `data` through the ORM session. The 1.1 model has no insert method.
    - List-all returns both rows.
    - For each returned row, `'data' in sqlalchemy.inspect(row).unloaded` holds. Alternatively, a `before_cursor_execute` listener shows that the list-all SELECT does not name the `data` column.
    - A Pydantic model without a `data` field is not proof.
  - **Migration.**
    - `make db-verify` exits 0: up, down -1, up.
    - A migration pytest, following `backend/open_webui/test/models/test_ocu_chat_state.py:206`, first creates `access_grant` in the tmp engine (for example `AccessGrant.__table__.create(conn)`), so the downgrade's delete really runs. It then seeds:
      - one `ocu_skill` grant;
      - one decoy grant (`resource_type='skill'`, same `resource_id`).
    - After `downgrade()`, both tables are gone, the `ocu_skill` grant is gone, and the decoy grant survives.
  - **Admin listing (SA-1).**
    - Seed skills `a` and `b` through the ORM session, and their grants through `AccessGrants.grant_access`:
      - `a` gets `user` / `*` / `read`;
      - `b` gets only group A read;
      - add a decoy native grant: `resource_type='skill'`, `resource_id='b'`, `user` / `*` / `read`.
    - As an admin, `GET /api/v1/ocu/skills/admin` returns 200 with exactly these items: `a` with the `user` / `*` / `read` grant, and `b` with exactly the group A read grant. The decoy does not appear, and no item carries `data`.
    - A user-role caller gets 401. No session gets 401.
  - **Workspace disabled.**
    - Run the extended fresh-process helper `backend/open_webui/test/ocu_office_flag_process.py`.
    - New interface: an optional list of `/api/v1/ocu/skills` paths and a role (`user` or `admin`) for the session that sends them. It returns the status for each path.
    - With `--workspace false`, admin `GET /admin` returns 404.
    - Positive control: the same helper with `--workspace true` returns 200, so a mistyped path cannot pass.
    - Must preserve:
      - The helper's existing `/api/config` output keys `auth_office`, `auth_workspace`, `anon_office` and `anon_workspace` stay unchanged for `test/routers/test_ocu_workspaces.py:64-79`.
      - Its payload stays deterministic for `test/test_harness_environment.py:490-503` (`inherited['payload'] == clean['payload']`).
      - With no path list, the output is byte-identical to today.
  - **Spine regression.**
    - `make smoke` passes.
    - `backend/open_webui/test/routers/test_ocu_workspaces.py` passes unchanged: the `/auth` route stays unconditional, and the `/workspaces/*` routes stay gated as before.
    - The new Critical Paths row's `make smoke` clause is first met by a `smoke/` hurl case in task 2.2. 1.1 adds no hurl case.
  - **Seam.**
    - `git diff --name-only $(git merge-base HEAD origin/main) -- backend/open_webui/main.py` prints nothing. Do not use `change-scope.sh`: it compares against the frozen upstream baseline, and earlier fork work already lists `main.py` there.
    - `grep -n ocu_workspaces backend/open_webui/routers/ocu_skills.py` prints nothing.
  - **Docs.** `make decisions-verify` and `make doc-gate` exit 0.
  - **Gates.** `make lint-scoped` and `make coverage-gate` pass, with every new file at 80% line coverage or more.
- [ ] 1.2 Add the delete-with-grants-and-disables table method as one DB transaction, and the admin `POST /{name}/access` and `DELETE /{name}` routes. Verify with router pytest: an admin succeeds; a user gets 401; no session gets 401; an unknown name gets 404; with the workspace disabled both routes get 404; access replaces the grant set (after narrowing to group A, the stored `ocu_skill` grants are exactly group A read); delete leaves no row, grant or disable row.
      Task 1.2 required evidence (issue #743; each item is input → expected output):
  - **Access form contract.**
    - Body: `{access_grants: [{principal_type, principal_id, permission}]}`.
    - Each grant is validated by a Pydantic model with:
      - `principal_type` in `user` | `group`;
      - `principal_id` a non-empty string, where `user` / `*` is the everyone grant;
      - `permission` exactly `read`.
    - Any other grant gets 422 and leaves the stored grants unchanged: a `write` grant, a `principal_type='anyone'` grant, an empty `principal_id`. Uploaded skills are read-only resources and sandboxes are never anonymous, so a grant that could not take effect fails loud instead of being dropped (AGENTS.md "Misconfiguration fails loud").
    - An empty list is valid and leaves the skill with no grants (only an administrator with `BYPASS_ADMIN_ACCESS_CONTROL` can then read it).
    - Bound consumer: the task 5.1 editor mounts `workspace/common/AccessControl.svelte` with its defaults `accessRoles=['read']` and `shareOpen=false` kept; otherwise it offers `write` and `anyone` grants that this route rejects with 422.
    - The route replaces grants through the existing `AccessGrants.set_access_grants(OCU_SKILL_RESOURCE_TYPE, name, ...)`; add no second grant-replace helper.
    - It returns 200 with the skill's `GET /admin` item, which has the same shape and the same read-only grant filter.
  - **Access behavior.** Seed skill `a` through the ORM session with the `user` / `*` / `read` grant, plus a stored `ocu_skill` / `a` `write` grant written directly through `AccessGrants.grant_access`. This seeded write grant is the case that closes the #759 review note that nothing exercised the `GET /admin` read filter.
    - Before the update, `GET /admin` lists `a` with only the read grant; the write grant is filtered out.
    - An admin `POST /api/v1/ocu/skills/a/access` with exactly group A read returns 200, and the item shows exactly group A read.
    - The stored `ocu_skill` / `a` grants, read through `AccessGrants.get_grants_by_resource`, are exactly group A read. The everyone grant and the write grant are both gone.
    - `GET /admin` then shows exactly the group A read grant for `a` (the SA-1 follow-up of #742).
    - A decoy native grant (`resource_type='skill'`, `resource_id='a'`) is unchanged.
    - Unknown name → 404 and no `ocu_skill` grant is written for that name.
    - Positive cases: POST `[user/*/read, group A/read, user U/read]` → 200 and `AccessGrants.get_grants_by_resource` returns exactly those three; POST `[]` → 200 and zero stored `ocu_skill` / `a` grants.
    - Rejections, parametrized over a group A `write` grant, `principal_type='anyone'` and an empty `principal_id`: each → 422 and the stored grants equal those before the call.
  - **Hard delete (table method).**
    - Add one method in `models/ocu_skills.py` that, in one session and with one `commit`, deletes the `ocu_skill` row, every `access_grant` with `resource_type='ocu_skill'` and `resource_id=name`, and every `ocu_skill_user_disable` row with `skill_name=name`.
    - It returns whether the row existed. The grant and disable deletes run even when the row is absent, so a grant orphaned by an access update racing a delete (access sees the row, delete commits, `set_access_grants` writes) is purged by the next `DELETE` of that name, which still returns 404. Task 2.1's first upload replaces grants instead of appending, so a re-upload never inherits an orphan.
    - Atomicity tests:
      - Success path: spy on the session's `commit` without raising, and assert exactly one call.
      - Failure path: patch `commit` to raise, call the method, and assert the row (with its `data` bytes, read back through `get_by_name`), its grants and its disable rows all still exist.
    - Orphan purge: seed an `ocu_skill` / `ghost` grant and a disable row for `ghost` with no `ghost` row. `DELETE /api/v1/ocu/skills/ghost` → 404, and afterwards neither the grant nor the disable row exists.
  - **Hard delete (route).** Seed skills `a` and `b`, each with an `ocu_skill` grant and a disable row for user U, plus a decoy native grant `skill` / `a`.
    - An admin `DELETE /api/v1/ocu/skills/a` returns 200 `true`.
    - Afterwards: no `ocu_skill` row `a`, no `ocu_skill` / `a` grant, no disable row for `a`; `GET /admin` lists only `b`.
    - `b` with its grant and its disable row, and the decoy native grant, are unchanged.
    - Unknown name → 404.
  - **Auth matrix.**
    - Both routes, with seeded data present: a user-role caller → 401; no session → 401; each refusal leaves rows and grants unchanged.
    - With the workspace disabled, the shared fresh-process helper `ocu_office_flag_process.py` with `--workspace false` returns 404 for admin `POST /{name}/access` and `DELETE /{name}`.
    - Positive control: the same paths with `--workspace true` and `skills_role='user'` return 401 from `get_admin_user`. This needs no seeded skill and no body; an admin `DELETE` of an unseeded name would get the handler's 404 and look unmounted.
    - The helper is GET-only (`_skills_statuses` calls `client.get`), so extend it with an optional method per path. Its existing output stays byte-identical when no method is given. Add no second helper.
  - **Seam.** No migration, no `main.py` change (`git diff --name-only $(git merge-base HEAD origin/main) -- backend/open_webui/main.py backend/open_webui/migrations` prints nothing), no frontend change.
  - **Gates.** `make lint-scoped` and `make coverage-gate` pass, with `models/ocu_skills.py` and `routers/ocu_skills.py` each at 80% line coverage or more. `make smoke` passes.

Suggested fixture level: expanded - schema, migration and admin authorization.
Minimal mergeable slice: task 1.1 first (tables, migration, the router mount and its first reader `GET /admin`, plus the decision record that must ship with the first code PR). Task 1.2 depends on 1.1.

## 2. [webui] ZIP validation, reserved names and upload

- [ ] 2.1 Add the upload validator as `backend/open_webui/utils/ocu_skill_zip.py` with its paired test file. It implements every rule of design.md Decision 5:
  - reject absolute paths, `..` components, backslashes, symlinks and encrypted entries;
  - accept only stored and deflated entries that are regular files or directories; cap the archive at 2000 entries and the declared uncompressed total at 200 MB, reading every entry CRC-checked;
  - strip a single shared top-level directory;
  - require a root `SKILL.md` whose frontmatter has a valid `name` and a non-empty `description`.

  Wire it to its only caller, the first-upload path of admin `POST /upload`, and add the insert table method and the hardcoded reserved list in `routers/ocu_skills.py` (the 29 names at the pinned OCU revision: every `skills/public/` directory name, `remotion`, and every key of `NATIVE_PROMPT_DESCRIPTIONS`, per design.md Decision 4, written as one compact `frozenset` literal): read at most 50 MB plus one byte (413 above 50 MB), validate, reject a reserved name with 400 before any insert, then in one DB transaction insert the row with `data` and replace (never append) the skill's `ocu_skill` grants with the single `user:*` read grant, so a grant orphaned under that name (task 1.2) is never inherited. Every other rejection returns 400. Verify with one validator pytest case per rejection class in spec `ocu-uploaded-skills` "ZIP validation", plus the wrapped-directory acceptance case; and router pytest: a first upload yields a single wildcard grant and the right SHA-256 and size; with an orphan `ocu_skill` / `invoice-builder` group A read grant seeded and no row, a first upload of `invoice-builder` leaves `AccessGrants.get_grants_by_resource` returning exactly the single `user` / `*` / `read` grant; `docx` and `internal-comms` (parametrized rejection cases) each get 400 with the listing and grants unchanged; a 51 MB body gets 413; every rejection leaves the listing and grants unchanged; an injected commit failure (patch the session commit to raise) on a first upload leaves no row or grant, and a success-path spy on the session commit sees exactly one call; after the existing admin "reset uploads" (`routers/retrieval.py:3204-3220`) and "delete all files" (`routers/files.py:562-569`) actions the skill is still listed and its bytes unchanged; a user-role caller gets 401 with the listing and grants unchanged; with the workspace disabled the route gets 404.

      Task 2.1 required evidence (issue #744; each item is input → expected output):

  - **Transport.**
    - `POST /api/v1/ocu/skills/upload` takes the raw ZIP as the request body (`Content-Type: application/zip`; the type is not checked).
    - It is read through `request.stream()` with a running byte count. Reading stops after 50 MB plus one byte, and that request gets 413.
    - Multipart is not used: Starlette spools a whole multipart file before the handler runs, so the cap would not bound what the server reads.
    - The response is 200 `{name, description, zip_sha256, size}`. `zip_sha256` is the hex SHA-256 of the body bytes and `size` is their length.
    - A rejection is an `HTTPException` with the reason in `detail`.
  - **Validator** `backend/open_webui/utils/ocu_skill_zip.py`.
    - Pure function over bytes, with no DB and no filesystem. It returns the frontmatter `name` and `description`, or raises one error type carrying the reason, which the route maps to 400.
    - Paired test `backend/open_webui/test/utils/test_ocu_skill_zip.py` uses one in-memory ZIP-building helper. Each case below asserts that the error is raised and that its reason names the class:
      - absolute path: `/etc/x` and a drive-letter `C:/x`;
      - a `..` component: `a/../x` and `../../evil.sh` next to a valid `SKILL.md`;
      - a backslash: `a\x`;
      - a non-canonical stripped path (`./a` next to `a/b`, `a/./b`, `a//b`, `a//`) and a file path under another file (`SKILL.md` with `SKILL.md/x`, either order, also through a wrapper directory); the conflict check is linear in total path length;
      - a symlink: an entry whose `external_attr >> 16` has `S_IFLNK`;
      - an encrypted entry: `flag_bits & 0x1`;
      - 2001 entries;
      - over 200 MB uncompressed: one honest deflated entry of 200 MB plus one byte of zeros (about 200 KB compressed), several entries whose sum exceeds the cap, and a 1-byte entry whose declared `file_size` is patched to 200 MB plus one, all rejected by the declared-total check before reading; BZIP2 and LZMA entries rejected by method before reading;
      - a forged header: an entry whose declared `file_size` is smaller than its real data is rejected, whatever the reason;
      - no root `SKILL.md`, including mixed top-level directories `a/SKILL.md` plus `b/x`, which are not stripped;
      - frontmatter that is missing, not YAML or not a mapping;
      - `name` missing, not a string (`name: 123`), failing `^[a-z0-9][a-z0-9-]{0,63}$` (uppercase, a 65-character name, a leading `-`, a trailing newline), or `description` missing or blank;
      - a body that is not a ZIP, and an empty body;
      - stdlib failures while reading, each mapped to the validator's error type (never a 500): a corrupt deflate stream (`zlib.error`), a `SKILL.md` that is not UTF-8 or a UTF-8-flagged entry name with invalid bytes (`UnicodeDecodeError`), and an unsupported feature flag such as compressed-patched data (`NotImplementedError`);
      - `description` that is not a string (`description: 123`, a list);
      - a `SKILL.md` larger than 1 MB.
    - Building the encrypted case: on Python 3.12, `writestr` resets `flag_bits`, so the helper sets bit `0x1` by patching the local and central headers after the archive is written, as the forged-`file_size` case patches sizes.
    - Frontmatter rule: strip one leading UTF-8 BOM, normalize CRLF to LF, then the first line must be `---` and the frontmatter ends at the next line that is exactly `---`.
    - Acceptance cases:
      - root `SKILL.md`;
      - a CRLF `SKILL.md` with a UTF-8 BOM;
      - every entry under `invoice-builder/`, with or without a directory entry for it, accepted as if at the root;
      - directory entries are path-checked but not read, and are left out of the file-conflict check.
    - Every file entry is read in bounded chunks and CRC-checked; only `SKILL.md` bytes are counted and kept, capped at 1 MB, so peak memory is the 50 MB body plus one chunk plus 1 MB. Frontmatter is parsed with `yaml.safe_load`; PyYAML is already used by `utils/tools.py`, so there is no new dependency.
    - Must preserve: the top-level strip is the same rule as the pinned OCU extractor (`computer-use-server/skill_manager.py` at `constraints.yaml ocu_checkout.sha`: the first name's first segment plus `/` is a prefix of every name), so a ZIP that WebUI accepts mounts with `SKILL.md` at the root in OCU.
  - **Reserved names.**
    - One `frozenset` literal in `routers/ocu_skills.py` holds exactly these 29 names, derived at the pinned OCU revision `4dab0cf30be033ec95818c2108487a61b7213029`:
      - 16 `skills/public/` directories;
      - `remotion`;
      - 27 `NATIVE_PROMPT_DESCRIPTIONS` keys;
      - the union of these: `algorithmic-art artifacts-builder brand-guidelines canvas-design copy-editing describe-image doc-coauthoring docx file-reading frontend-design gitlab-explorer internal-comms mcp-builder pdf pdf-reading playwright-cli pptx product-marketing-context remotion single-cell-rna-qc skill-creator slack-gif-creator social-content sub-agent test-driven-development theme-factory webapp-testing writing-skills xlsx`.
    - Router pytest, parametrized over `docx` and `internal-comms`: → 400, and the listing, the grants and the disables are unchanged. The drift test is task 2.3.
  - **First upload (table method).**
    - One insert method in `models/ocu_skills.py` does the following in one session with one `commit`:
      - inserts the row with `data`, `zip_sha256`, `size`, `created_by` (the admin's id) and `created_at`/`updated_at`;
      - deletes every `ocu_skill` grant and every `ocu_skill_user_disable` row for that name;
      - adds the single `user` / `*` / `read` grant row.
    - It does not call `AccessGrants.set_access_grants`, which commits in its own session.
    - There is no existence pre-check. A primary-key `IntegrityError` at flush or commit (the ORM flushes the added row when the next delete executes) rolls back the whole transaction (including the grant and disable deletes) and is mapped to 409. Sequential and concurrent duplicate uploads therefore take the same path.
    - Commit spy, in the model test around a direct call of the table method only: exactly one `AsyncSession.commit` call. A spy over a whole request would also count the background `Users.update_last_active_by_id` commit (`utils/auth.py:436`).
    - Failure path:
      - In the model test (direct call) and in the router test, `AsyncSession.commit` is patched at class level to raise `RuntimeError('injected commit failure')`, and the test asserts `pytest.raises(RuntimeError, match='injected commit failure')`, as in `test/models/test_ocu_skill_tables.py:216`.
      - Seed an orphan `ocu_skill` grant and a disable row for the name first. After the patch is removed, the full registry state equals the state before the attempt: no row, `get_by_name` returns `None`, the orphan grant and disable row are still present, and there is no `user:*` grant.
  - **First upload (route).**
    - An admin upload of a valid `invoice-builder` ZIP → 200 with `name`, `description`, the SHA-256 of the sent bytes and its length.
    - `GET /admin` then lists it with exactly the `user` / `*` / `read` grant, and `get_by_name` returns the same bytes.
    - Orphan case: seed an `ocu_skill` / `invoice-builder` group A read grant and a disable row with no row. A first upload leaves `AccessGrants.get_grants_by_resource` returning exactly the single wildcard grant, and no disable row.
    - An existing name, with narrowed grants and a disable row → 409 with a reason that names it. The row, data, grants and disables are unchanged; the rolled-back grant and disable deletes are proven by the unchanged state.
      - This branch is the only behavior for an existing name until task 2.2 replaces it with the replace path. There is no silent overwrite and no 500 from the primary key.
  - **Rejections leave everything unchanged.**
    - 51 MB body → 413.
    - Every 400 class, routed through the endpoint (at least path traversal, the zip bomb, not a ZIP and a reserved name).
    - Each asserts that the full registry state before and after is equal: the names, the `ocu_skill` grants and the disables.
  - **Upload-directory resets.**
    - These actions are destructive on the session-scoped harness DB: they delete every `file` row and reset the vector DB. The test must not rely on other modules' files, and no other module may rely on files surviving it.
    - After an upload, run the existing admin "reset uploads" (`routers/retrieval.py:3204-3220`) and "delete all files" (`routers/files.py:562-569`) through `TestClient` as an admin; both return success.
    - The skill is still listed, and `get_by_name(...).data` and its SHA-256 equal the uploaded bytes.
  - **Auth matrix.**
    - A user-role caller and a no-session caller → 401 with the state unchanged.
    - Workspace off: the shared fresh-process helper with `--workspace false` returns 404 for an admin `POST /upload`.
    - Positive control: `--workspace true` with `skills_role='user'` returns 401.
  - **Seam and gates.**
    - No migration, `main.py`, frontend or CI change (`git diff --name-only $(git merge-base HEAD origin/main) -- backend/open_webui/main.py backend/open_webui/migrations src .github` prints nothing).
    - `make lint-scoped`, `make fmt-check`, `make anti-drift` and `make coverage-gate` pass. Each new or changed fork file has at least 80% line coverage, and the validator is covered by its own test file.
    - The diff is at most 400 lines, or carries `diff-limit-exempt` with the task's slice reason.

- [ ] 2.2 Add the replace path of `POST /upload`: an existing name replaces `data`, SHA-256, size and description in one DB transaction and keeps grants and disables. Verify with router pytest: replace keeps narrowed grants and disables; an injected commit failure (patch the session commit to raise) on a replace leaves the previous row, its `data` and its SHA-256 unchanged (read back through the table get method), and a success-path spy on the session commit sees exactly one call. Add a `smoke/` hurl case for an admin upload, then delete it.
      Task 2.2 required evidence (issue #745; each item is input → expected output):
  - **Table method.**
    - The first-upload insert from task 2.1 becomes one upsert method in `models/ocu_skills.py`. There are no two parallel write methods.
    - In one session with one `commit`, the method first runs a Core `UPDATE ocu_skill SET data, zip_sha256, size, description, updated_at WHERE name = :name`. It never loads the old `data`.
    - If the update matched a row, that is the replace: `created_by` and `created_at` stay, and grants and disables are not touched.
    - If it matched nothing, the method runs the task 2.1 first-upload path: purge orphans, insert the row, add the single `user` / `*` / `read` grant.
    - It returns the stored metadata. The route response stays `{name, description, zip_sha256, size}` for both paths.
    - A primary-key `IntegrityError` can still happen if a concurrent first upload inserts between the `UPDATE` and the `INSERT`. It rolls back and the route maps it to 409. The route mapping is tested by having the table method raise `IntegrityError`, which mocks a dependency of the route. Last-writer-wins on concurrent replaces is accepted and not tested (issue Out of Scope).
  - **Replace keeps grants and disables.**
    - Setup: first-upload `invoice-builder` (ZIP A), narrow its grants through `POST /invoice-builder/access` to exactly group A read, and seed a disable row for user U.
    - Action: upload a different valid ZIP B with the same name and a different description.
    - Expected:
      - 200, with the SHA-256 and size of B;
      - `get_by_name` returns B's bytes and description, and the same `created_by` and `created_at` as A;
      - `updated_at` is at least the earlier value;
      - `AccessGrants.get_grants_by_resource` returns exactly group A read, not `user:*`;
      - U's disable row is still present;
      - `GET /admin` shows B's SHA-256 with exactly the group A read grant.
  - **One commit.**
    - In the model test, a commit spy wraps only the direct call of the table method.
    - The replace path sees exactly one `AsyncSession.commit`.
    - The first-upload path still sees exactly one.
  - **Replace commit failure.**
    - With ZIP A stored and narrowed grants and a disable row seeded, `AsyncSession.commit` is patched at class level to raise `RuntimeError('injected commit failure')`.
    - Both the model test and the router test assert `pytest.raises(RuntimeError, match='injected commit failure')`.
    - After the patch is removed, `get_by_name` returns A's `data`, SHA-256, size and description. The grants and disables are unchanged and `GET /admin` lists A's SHA-256.
  - **Validation still precedes any write.** A replace with an invalid ZIP (path traversal) → 400. A replace with a reserved name cannot occur, because reserved names never exist as rows. A 51 MB body → 413. In each case the stored row (A's bytes), grants and disables are unchanged.
  - **The interim 409 is gone.** The task 2.1 test "an existing name → 409" is replaced by the replace test above. No test asserts 409 for a sequential re-upload.
    - The model test `test_insert_of_existing_name_raises_integrity_error_and_rolls_back_the_purge` is deleted. Under the upsert, a sequential second call takes the replace path, so that test's premise no longer exists.
    - The concurrent-first-upload `IntegrityError` is only possible on Postgres. On the SQLite harness DB, the UPDATE's implicit `BEGIN` takes the write lock, so two sessions are serialized and cannot reproduce it.
    - The rollback of the purge on an exception before commit is the same mechanism the commit-failure tests prove. The route's 409 mapping is tested with the table method raising a real `IntegrityError(stmt, params, orig)` instance.
  - **Smoke.** `smoke/ocu-skills.hurl` runs as the seeded harness admin, using the same signin capture as `smoke/api.hurl`:
    - `POST /api/v1/ocu/skills/upload` with `Content-Type: application/zip` and the body `file,fixtures/ocu-smoke-skill.zip;` → 200, `name == "harness-smoke-skill"`, and `zip_sha256` matching the committed fixture's SHA-256;
    - `GET /api/v1/ocu/skills/admin` → contains that name with exactly one `user` / `*` / `read` grant;
    - `DELETE /api/v1/ocu/skills/harness-smoke-skill` → 200 `true`;
    - `GET /admin` again → that name is absent.
    - The fixture `smoke/fixtures/ocu-smoke-skill.zip` is committed. It is a few hundred bytes: a root `SKILL.md` with `name: harness-smoke-skill` and a description. The hurl file's header comment states how it was built (`python -c` with `zipfile`, deterministic `date_time`).
    - A rerun after an interrupted run is idempotent, because an existing name now replaces in place.
    - No `scripts/smoke.sh` change.
  - **Docs.** The AGENTS.md Verification Matrix row for `make smoke` and the matching rows in `docs/agents/verification-matrix.md` name the uploaded-skill upload/delete round trip. `make doc-gate` exits 0.
  - **Gates.**
    - `make smoke` exits 0 with the new hurl file counted.
    - `make lint-scoped`, `make fmt-check`, `make anti-drift` and `make coverage-gate` pass; the `ocu_skills` files stay at 80% or more.
    - The seam check prints nothing: `git diff --name-only $(git merge-base HEAD origin/main) -- backend/open_webui/main.py backend/open_webui/migrations src .github scripts`.

- [ ] 2.3 Add the reserved-list drift test: it asserts the list covers every directory under `$OCU_CHECKOUT/skills/public/`, `remotion`, and the `NATIVE_PROMPT_DESCRIPTIONS` keys parsed from the pinned `$OCU_CHECKOUT/computer-use-server/skill_manager.py`. `OCU_CHECKOUT` defaults to `<repo root>/../open-computer-use`, resolved from the repository root (as `scripts/proxy-dev.sh:10` does), not from the pytest working directory (`Makefile:91` runs pytest from `backend/`). A missing checkout fails with a message instead of skipping. Give the pinned OCU checkout to `layer2-backend-tests` (the job that runs `make coverage-gate PART=backend` since the CI split) and export `OCU_CHECKOUT` there; the PR must flag this CI change. Verify locally that the drift test fails after removing one `skills/public/` name and, separately, one `NATIVE_PROMPT_DESCRIPTIONS` key from the list, fails with the message when `OCU_CHECKOUT` points at a missing directory, and passes with the full list.
      Task 2.3 required evidence (issue #746; each item is input → expected output):
  - **Fixture level and risk packs for this task.**
    - Level: expanded.
      - `setup-toolchain` is the shared entry point of every `ci.yml` job, and every job feeds the single required check.
      - The test parses an external file.
    - Selected packs: config / project setup; public API / script entry (the new composite input); file IO / path (checkout resolution); error handling (fail, never skip); documentation.
    - Not selected: resource limits, persisted state, auth, schema, concurrency.
    - Governing invariant: at the `constraints.yaml ocu_checkout.sha` revision, every name OCU lists from `skills/public/`, and every name whose description it forces, is in `RESERVED_SKILL_NAMES`.
      - Any PR that could break this fails `layer2-backend-tests`.
      - That includes the #755 pin bump, because `ci-gate.py` classifies `constraints.yaml` as code.
    - Sibling surfaces:
      - the reserved check in the upload route, shared by first upload and replace;
      - the single "Resolve pinned OCU SHA" step in `action.yml`, which layer2 and the layer3 jobs read;
      - `layer3-runtime-smoke` and `layer3-browser` as regression controls for the `runtime || ocu` condition;
      - `ci-gate.py` classify and verdict, whose job set is unchanged;
      - local `test-backend`, `coverage-gate` and `check`, which now need the checkout.
  - **Test module.**
    - The test lives at `backend/open_webui/test/test_ocu_skill_reserved_drift.py`, at the top level. It is not under `test/routers/`, because that directory's autouse `client` fixture imports the whole app.
    - It imports `RESERVED_SKILL_NAMES` from `routers/ocu_skills.py` and reads OCU from a checkout. It makes no network call and imports nothing else from the app.
    - One-off local proof: running `pytest -v --setup-show <module>` on the module alone shows no `client` or `_bind_client` setup. The proof is not a `sys.modules` assertion, which fails in the full suite after `routers/` has imported the app. It is also not a bare `python -c` import, which wipes the tracked static tree (AGENTS.md note 6).
  - **Checkout resolution.**
    - `OCU_CHECKOUT` is used when it is set.
    - Otherwise the path is `<repo root>/../open-computer-use`, where the repo root is found from the test file's own path (`Path(__file__).resolve().parents[...]`). It does not depend on the pytest working directory.
    - A missing directory fails with `pytest.fail` (never `skip`). The message names the resolved path and says to clone OCU at `constraints.yaml ocu_checkout.sha` or to set `OCU_CHECKOUT`.
    - A checkout that exists but has no `skills/public/` or no `computer-use-server/skill_manager.py` also fails, naming the missing file.
  - **Expected set.**
    - Every directory name under `skills/public/` (directories only), plus `remotion`, plus the keys of `NATIVE_PROMPT_DESCRIPTIONS`.
    - The keys come from `ast`-parsing `skill_manager.py`. The module-level assignment is accepted as either `ast.Assign` or `ast.AnnAssign`; at the pin it is `NATIVE_PROMPT_DESCRIPTIONS: dict[str, str] = {`. Its value must be a dict literal with string-constant keys.
    - Anything else fails with a message, not a silent empty set: a missing assignment, a value that is not a dict literal, or a key that is not a string.
    - At the pin the expected counts are 16 directories and 27 keys, giving a union of 29, which equals the literal's size.
    - The test asserts that this set is a subset of `RESERVED_SKILL_NAMES`. The failure message lists every missing name, sorted. Extra reserved names are allowed: a built-in removed upstream may stay reserved harmlessly.
  - **Proof that the test can fail.** Run each locally, then restore the original state:
    - remove one `skills/public/` name, for example `file-reading`, from the literal → the test fails naming it;
    - remove one dict-only key, for example `internal-comms` → the test fails naming it;
    - `OCU_CHECKOUT=/nonexistent` → the test fails with the message;
    - the full list against a checkout at the pinned SHA `4dab0cf30be033ec95818c2108487a61b7213029` (for example a `git worktree` or `git archive` of the sibling checkout in the scratchpad) → the test passes.
    - Cwd independence, against the pinned checkout: run once from `backend/` and once from the repository root, and both pass. Without `OCU_CHECKOUT`, a run from each directory fails, and both messages name the same `<repo root>/../open-computer-use`. This proof runs from a linked worktree, where that sibling path does not exist.
    - Each structural failure path is a parametrized case against a fake checkout built in `tmp_path`, so it runs in CI and locally without the real checkout. The cases are:
      - no `skills/public/`;
      - no `computer-use-server/skill_manager.py`;
      - no `NATIVE_PROMPT_DESCRIPTIONS` assignment;
      - a value that is not a dict literal;
      - a non-string key.

      Each asserts that `pytest.fail`'s message names the reason. A positive case uses a fake checkout whose names are a subset of the literal.

    - Also report the result against the sibling checkout's current HEAD. Name any built-in added after the pin as a finding for #755 (the pin bump); it is not fixed here.

  - **CI.**
    - `.github/actions/setup-toolchain/action.yml` gains a validated input `ocu` (`true`/`false`, default `false`; any other value fails the job, as the existing inputs do).
    - The pinned-SHA resolution and the `actions/checkout` of `DankerMu/open-computer-use` into `.run/open-computer-use` run when `inputs.runtime == 'true' || inputs.ocu == 'true'`. There is one copy of those steps, not a second one in `ci.yml`.
    - `layer2-backend-tests` passes `ocu: 'true'`, and its `make coverage-gate PART=backend` step sets `OCU_CHECKOUT: ${{ github.workspace }}/.run/open-computer-use`.
    - No other job changes.
    - CI proof, from the PR's `layer2-backend-tests` log:
      - the OCU checkout step checked out the pinned SHA;
      - `make coverage-gate PART=backend` exited 0;
      - its passed count exceeds the latest `main` layer2 run by this module's test count.

      `coverage-gate.sh` prints only the last pytest lines and excludes `test/` from the coverage report, so the module itself is not listed there.

    - The PR flags both CI files: `.github/actions/setup-toolchain/action.yml` and `.github/workflows/ci.yml`.

  - **Local gates.**
    - With `OCU_CHECKOUT=<sibling checkout>` set, `make coverage-gate PART=backend` exits 0, and `pytest -v` of the module lists its test IDs.
    - `make lint-scoped`, `make fmt-check`, `make anti-drift` and `make doc-gate` exit 0.
    - `python3 scripts/ci-gate.py` tests (`backend/open_webui/test/test_ci_gate.py`) still pass, because the job set is unchanged.
  - **Docs.**
    - The AGENTS.md `### Environment` "Local services" line states that backend pytest (`make test-backend`, `make coverage-gate`, `make check`) now reads the sibling OCU checkout.
    - It names `OCU_CHECKOUT`, the default `<repo root>/../open-computer-use`, and that a linked worktree must set `OCU_CHECKOUT`, because the default resolves from the worktree root.
    - The PR flags this AGENTS.md change.

Suggested fixture level: expanded - path safety, resource limits and persisted bytes.
Minimal mergeable slice: task 2.1 first (the validator, the reserved-name check and the first-upload route that is their only caller, so no dead code and no window in which `main` accepts a reserved name); depends on 1.1. Estimated about 380 diff lines (validator about 100, its parametrized tests about 90 over one ZIP-building helper, route, insert method and the compact reserved literal about 75, router tests about 115 reusing that helper); if the implemented diff exceeds 400, use the `diff-limit-exempt` label with this reason instead of splitting the reserved check away from the route. Task 2.2 depends on 2.1 and 1.2 (its smoke case deletes through the `DELETE /{name}` route). Task 2.3 depends on 2.1 (the list it checks) and is the only part that carries a CI change: the drift test plus the CI checkout.

## 3. [webui] Per-user list and toggle

- [ ] 3.1 Add the enabled-set query of design.md Decision 6 to `models/ocu_skills.py`, without loading `data`. Add the user routes `GET /` (readable skills with `enabled`) and `POST /{name}/toggle` (404 without read access or for an unknown name). Verify with router pytest: a group-narrowed skill is hidden from a non-member; an administrator outside the group sees it exactly when `BYPASS_ADMIN_ACCESS_CONTROL` is on; the default-open skill is listed as enabled; a disable affects only the caller; an ungranted toggle gets 404 and stores nothing; no session gets 401; the workspace disabled gets 404.
      Task 3.1 required evidence (issue #747; each item is input → expected output):
  - **Fixture level and risk packs for this task.**
    - Level: expanded (authorization, persisted per-user state).
    - Selected packs:
      - authz: wildcard, direct-user and group grants, admin bypass on and off, the pending role;
      - information disclosure: 404 parity, the listing contents;
      - persisted state: idempotent toggles, per-user isolation of disable rows;
      - concurrency: a double toggle from a UI switch;
      - API contract.
    - Not selected: schema, migration, resource limits.
    - Governing invariant (design.md Decision 6):
      - every user-facing consumer works only on the readable set computed by the one method from (user_id, bypass): `GET /`, the toggle, and later the #748 `user-config` and the #751 menu;
      - a toggle writes only the caller's own disable row;
      - no path loads `data`.
    - Sibling surfaces:
      - `GET /` and the toggle;
      - #748 `user-config` and `download`;
      - #751 menu;
      - #750 personal settings;
      - admin `DELETE`, which purges disable rows (task 1.2);
      - first upload, which purges orphan disable rows (task 2.1);
      - `POST /{name}/access`, which keeps disable rows when it narrows grants. A user who loses access keeps the row, which is harmless because the row only matters while the skill is readable. This is intended.
  - **One query (design Decision 6).**
    - `models/ocu_skills.py` gains exactly one readable-set method, `readable_skills(user_id, bypass: bool, names: list[str] | None = None)`. It returns, for each readable skill, its metadata (name, description, `zip_sha256`) and `enabled`, ordered by name. It never loads `data`.
    - A skill is readable when it exists and either `bypass` is true, or `AccessGrants.get_accessible_resource_ids(user_id, 'ocu_skill', ..., 'read')` returns it. That call is the existing filter (wildcard, direct user and group membership), reused rather than re-implemented.
    - `enabled` means no `ocu_skill_user_disable` row exists for (`user_id`, name).
    - `bypass` is computed by one module-level helper in `routers/ocu_skills.py`: `_admin_bypass(user) -> bool`, which returns `user.role == 'admin' and BYPASS_ADMIN_ACCESS_CONTROL`.
      - `BYPASS_ADMIN_ACCESS_CONTROL` is imported from `open_webui.config`, as `routers/skills.py:46` does.
      - `GET /`, the toggle and the #748 `user-config` route all call this helper, which has the `UserModel` with `role` available.
      - Tests switch the flag with `monkeypatch.setattr(ocu_skills, 'BYPASS_ADMIN_ACCESS_CONTROL', ...)`.
    - `GET /`, the toggle, and later the #748 `user-config` and #751 menu all call this one method. No second readable or enabled computation exists.
    - Model test: a `before_cursor_execute` recorder shows no SELECT naming `ocu_skill.data`. This is the same technique as `test_list_all_returns_every_row_without_selecting_data`.
  - **Data-free metadata read (the #760 review follow-up, comment on #747).**
    - `models/ocu_skills.py` gains `get_metadata(name) -> OcuSkillModel | None`, which never loads `data`.
    - `POST /{name}/access` checks existence with it instead of `get_by_name`.
    - `get_by_name` keeps loading `data` for the download route (task 4.1) and the tests. It stays a separate method, not a parameter of `get_metadata`, because the return types differ (`OcuSkillModel` versus `OcuSkillDataModel`). A flag would need typing overloads for one caller each.
    - Test: during an admin `POST /a/access`, the recorder sees no SELECT naming `ocu_skill.data`. Run it red on main first.
  - **`GET /api/v1/ocu/skills/`.**
    - It uses `get_verified_user`, which admits only `VERIFIED_USER_ROLES = {'user', 'admin'}` (`utils/auth.py:519`).
    - No session gets 401, and a `pending` session gets 401 on both routes with state unchanged; a test proves the pending case.
    - Each item is exactly `{name, description, enabled}`.
    - Seed:
      - skill `open`: `user` / `*` / `read`;
      - skill `team`: group A read only;
      - skill `hidden`: no grant;
      - user M is in group A;
      - user N is not in group A;
      - admin X is outside group A.
    - As M: `[open (enabled), team (enabled)]`.
    - As N: `[open]` only. `team` and `hidden` are absent.
    - As X with bypass on: all three. As X with bypass off: `[open]`.
    - No item and no response body contains ZIP bytes.
  - **`POST /api/v1/ocu/skills/{name}/toggle`.**
    - Body: `{"enabled": <bool>}`, using Pydantic `StrictBool`. Any other type gets 422 and stores nothing.
    - `enabled: false` INSERTs the caller's disable row without checking first.
      - A primary-key `IntegrityError` means the row already exists: roll back and return 200 as already disabled. This makes concurrent double toggles from a UI switch safe on any database.
      - Test: write the (M, `open`) disable row through the model first. M's `enabled: false` then gets 200, and exactly one row exists. A `before_cursor_execute` recorder sees an `INSERT INTO ocu_skill_user_disable` during the request, so the conflict branch really ran. A check-then-insert implementation fails this test.
      - A sequential second call also leaves one row.
    - `enabled: true` deletes it. It is idempotent too.
    - Response 200 is the caller's `{name, description, enabled}` item.
    - Readability goes through `readable_skills(..., names=[name])`.
    - Cases:
      - M disables `open` → M's `GET /` shows `open` with `enabled: false`; N's still shows it enabled. Exactly one disable row exists, for (M, `open`).
      - M re-enables → no row.
      - N toggles `team` (ungranted) → 404 and no row.
      - Anyone toggles unknown `ghost` → 404 and no row.
      - The two 404 bodies are byte-identical, so the toggle does not reveal whether an ungranted skill exists.
      - X with bypass off toggles `team` → 404. With bypass on → 200.
      - No session → 401 for both routes, with state unchanged.
  - **Workspace disabled.**
    - The shared fresh-process helper with `--workspace false` returns 404 for `GET /` and `POST /a/toggle`.
    - Positive control: `--workspace true` with `skills_role='user'` gives 200 for `GET /` and 422 for the bodiless `POST /a/toggle`. FastAPI resolves `Depends` before body validation, so a mounted toggle with a user session returns 422.
    - Both entries are added to the parametrized table of `test_fresh_process_admin_routes_follow_workspace_mount`.
    - Router-level recorder: during one `GET /` request and one toggle request, no SELECT names `ocu_skill.data`.
  - **Seam and gates.**
    - No migration, `main.py` or frontend change.
    - `make lint-scoped`, `make fmt-check`, `make anti-drift` and `make coverage-gate` pass, and the `ocu_skills` files stay at 80% or more. The local runs need `OCU_CHECKOUT`, per AGENTS.md.
    - `make smoke` passes.

Suggested fixture level: expanded - authorization and persisted per-user state.
Minimal mergeable slice: atomic - one query and the two routes that are its only callers; depends on 1.1.

## 4. [webui] Internal registry endpoints

- [ ] 4.1 Add `GET /api/internal/user-config/{email}` and `GET /api/internal/skills/{name}/download`:
  - authenticate by `X-Internal-Api-Key` equal to `OCU_INTERNAL_TOKEN`, read from `os.environ` at request time (design.md Decision 2; no import from `ocu_workspaces`), via `hmac.compare_digest`, with an empty token or missing header giving 401 with an empty body, and cookies ignored;
  - user-config returns the OCU contract shape built from the task 3.1 enabled-set query; an unknown email gives 200 with an empty list;
  - download reads `ocu_skill.data` and returns `application/zip`, or 404 for an unknown name.

  Verify with router pytest: no key, wrong key, cookie only and an empty configured token each get 401; with the workspace disabled both routes get 404 even with the correct key; the enabled set excludes the user's disabled skill; an administrator's user-config contains a group-narrowed skill exactly when that administrator's `GET /` does; the download SHA-256 equals the advertised `zip_sha256`; after an injected replace commit failure the download still returns the previous bytes; a deleted skill gets 404. Change `scripts/smoke.sh` to source `scripts/dev-env.sh` (it now sources only `scripts/seed.sh`; `scripts/dev-bg.sh:13` already does `source scripts/dev-env.sh || exit 2`, and the default `DATA_DIR`/`FRONTEND_BUILD_DIR` pass its path checks) and write the `OCU_INTERNAL_TOKEN` that `scripts/dev-env.sh:73` exports (default `harness-no-ocu`) into its hurl secrets file next to `seed_email`/`seed_password`, never a hardcoded copy, so a `make dev-bg` override stays consistent with the running server. Add `smoke/` hurl cases for an internal call with and without the key. Add an AGENTS.md Verification Matrix row for these endpoints.
  Task 4.1 required evidence (issue #748; each item is input → expected output):
  - **Fixture level and risk packs for this task.**
    - Level: expanded. This is a server-to-server secret and a public contract consumed by OCU.
    - Selected packs:
      - auth/secrets: the internal key matrix; sessions ignored; the token kept out of argv, output and repository files (the routes add no logging call; logs are review-only);
      - public API contract: the OCU `skill_manager.py` caller;
      - information disclosure: no existence oracle before the key check;
      - config: request-time read of `OCU_INTERNAL_TOKEN`;
      - error handling: a non-ASCII key header.
    - Not selected:
      - schema and migration: no table change;
      - concurrency: read-only routes. The #765 hand-over on #748 still applies: the routes pass no `db` to `Users.get_user_by_email` or `OcuSkills.readable_skills`, so under `DATABASE_ENABLE_SESSION_SHARING` no caller session with uncommitted writes reaches them (review-checked invariant);
      - resource limits: `data` is capped at 50 MB by task 2.1.
    - Governing invariants:
      - only a request whose `X-Internal-Api-Key` equals a non-empty `OCU_INTERNAL_TOKEN` reaches either route body;
      - `user-config` is exactly the enabled set of design Decision 6, computed by `readable_skills` with `_admin_bypass` (task 3.1);
      - only `download` loads `data`.
    - Sibling surfaces:
      - `GET /` (same query);
      - `scripts/smoke.sh` and its harness test `backend/open_webui/test/test_harness_seed.py`;
      - the shared fresh-process helper `ocu_office_flag_process.py`;
      - the OCU caller `computer-use-server/skill_manager.py` `_fetch_user_config` and `_download_skill_zip`. These are fixed and not changed:
        - they send `X-Internal-Api-Key` and the raw email in the path;
        - they read `enabled_skills` from a 200 JSON response, and anything else counts as a miss;
        - `download` needs 200, and a JSON content type is treated as "native, skip".
  - **Internal key check (design Decision 2).**
    - It is one module-level helper in `routers/ocu_skills.py`. The helper reads `os.environ.get('OCU_INTERNAL_TOKEN', '')` on every request; nothing is read at import. `ocu_skills.py` still imports nothing from `ocu_workspaces`.
    - It compares UTF-8 bytes with `hmac.compare_digest`, so a non-ASCII header value is a mismatch, not a `TypeError` and a 500.
    - An empty or unset configured token rejects every request, including one whose header is also empty.
    - Every rejection is 401 with a zero-length body.
    - The check runs before any DB access, so a wrong key on `download` of an unknown name is 401, not 404. A bad key cannot learn whether a skill exists.
    - The routes declare no session dependency. `Authorization: Bearer <valid admin token>` and a `token=<valid admin token>` cookie, each without the key, get 401.
    - Tests:
      - Set the token with `monkeypatch.setenv('OCU_INTERNAL_TOKEN', ...)` after the app is imported; this proves the request-time read.
      - Each of the following gets 401 with `response.content == b''` on both routes:
        - no header;
        - a wrong value;
        - a value that differs only in case;
        - the non-ASCII header value `'é'.encode('latin-1')`;
        - an admin Bearer only;
        - an admin cookie only;
        - token `''` with header `''`;
        - token unset with no header.
      - The wrong-key `download` of an existing skill and of `ghost` give the same 401.
  - **`GET /api/v1/ocu/skills/api/internal/user-config/{email}`.**
    - Lookup uses `Users.get_user_by_email`, which is case-insensitive through the normalized index.
    - The response is 200 `{"email": <path value verbatim>, "enabled_skills": [{"name", "description", "category": "user", "zip_sha256"}, ...]}`. Items are ordered by name and have exactly these four keys.
    - The items are the `enabled: true` entries of `readable_skills(user.id, _admin_bypass(user))`. No second filter exists.
    - There is no role filter. A `pending` user's email returns that user's enabled set by Decision 6: the wildcard grant applies, and bypass applies only to admins. Pending users cannot open a chat or a workspace (every OCU route uses `get_verified_user`), so OCU never asks for them, and adding a role rule here would go beyond the spec.
    - An email matching no user gets 200 with `"enabled_skills": []`.
    - Seed with the task 3.1 `user_matrix`: skills `open`/`team`/`hidden`, users M/N/X/P.
    - Cases with the correct key:
      - M → `open`, `team`, each with `category` `user` and the stored `zip_sha256`.
      - After M disables `open` through `POST /open/toggle`, M → `team` only. M's `GET /` still lists `open` with `enabled: false`.
      - N → `open` only.
      - X with bypass on → all three; with bypass off → `open`. For each of M, N and X under both bypass settings, the `user-config` names equal the `enabled: true` names of that user's `GET /`.
      - The upper-cased form of M's email returns M's set, and the response `email` echoes the upper-cased value.
      - P (pending) → `open`.
      - `nobody@harness.local` → 200 with an empty list.
      - The response body never contains `PK\x03\x04`.
    - A `_SelectRecorder` sees no SELECT naming `ocu_skill.data` during a `user-config` request.
  - **`GET /api/v1/ocu/skills/api/internal/skills/{name}/download`.**
    - It reads `OcuSkills.get_by_name` (the one data-loading getter) and returns 200 `application/zip` with the stored bytes. `sha256(body)` equals the `zip_sha256` that `user-config` advertised.
    - An unknown name gets 404, the existing `_skill_not_found()`. There is no per-user check; the key is the authority (Decision 7).
    - Cases:
      - An uploaded skill downloads with matching SHA-256 and `content-type` starting with `application/zip`.
      - Replace with a second ZIP and an injected commit failure (the task 2.2 commit-spy pattern, `pytest.raises(RuntimeError, match='injected commit failure')`). Then `download` returns the previous bytes, and its SHA-256 equals the previous `zip_sha256` from `user-config`.
      - After admin `DELETE /{name}`, `download` gets 404 and the name is absent from every `user-config`.
  - **Workspace disabled.**
    - Extend the shared helper `run_office_flag_process` with a keyword `skills_key: str | None = None`. When it is set, the parent passes it only through the `env` copy at `ocu_office_flag_process.py:47` as `OCU_INTERNAL_TOKEN`, never through argv. The subprocess reads it from `os.environ` and sends `X-Internal-Api-Key: <value>` on every `/api/v1/ocu/skills` request alongside the session header. The existing callers in `test_ocu_workspaces.py`, `test_harness_environment.py` and `test_ocu_skills.py` pass nothing new.
    - Default `None` leaves the current behaviour and stdout byte-identical. The existing `test_fresh_process_without_skills_paths_keeps_the_office_payload` stays green unchanged.
    - New table cases, using the correct key:
      - `--workspace false`: `/api/internal/user-config/nobody@harness.local` and `/api/internal/skills/a/download` get 404.
      - Positive control `--workspace true`: the same `user-config` path gets 200.
  - **Smoke harness.**
    - `scripts/smoke.sh` sources `scripts/dev-env.sh` after its `cd` to the repository root, with `|| exit $?`. It writes `ocu_internal_token=$OCU_INTERNAL_TOKEN` into the same private secrets file as `seed_email`/`seed_password`.
    - The token never appears in hurl argv, in a repository file, or in output. `git grep -n harness-no-ocu -- smoke scripts/smoke.sh` prints nothing. The default is defined only in `scripts/dev-env.sh`, and the harness test derives the expected default by parsing that file, not from a literal.
    - `test_harness_seed.py`:
      - Its `harness` fixture copies `scripts/dev-env.sh` and makes the workspace a git repository, because `dev-env.sh` runs `git rev-parse --show-toplevel`. `git` joins the `names` tuple (`:204`) so the receiver `execv`s it by absolute path. The narrowed-PATH case `test_failed_transport_retires_owned_child_before_private_files[missing-hurl]` still exits 127.
      - Every existing `smoke` case stays green.
      - The receiver gains an `OBS_TOKEN` variable. In the hurl branch it records the boolean "the secrets file's `ocu_internal_token` equals `OBS_TOKEN`", never the value. `exposed` and the `launch()` stdout/stderr disclosure check cover `OBS_TOKEN` as well as `OBS_PASSWORD`.
      - New assertions: that boolean is true both by default (the value parsed from `dev-env.sh`) and with `OCU_INTERNAL_TOKEN=<uuid>` in the environment, and the token appears in no recorded argv or output.
      - Red first: the new assertions fail on the current `smoke.sh`.
    - `smoke/ocu-skills.hurl` gains these cases inside its existing upload/delete round trip; no new hurl file is added.
      - After the upload:
        - `user-config` for `{{seed_email}}` with `X-Internal-Api-Key: {{ocu_internal_token}}` gets 200. It lists `harness-smoke-skill` with `category` `user` and the fixture SHA-256 `4cbbaee5…291c`.
        - `download` with the key gets 200 `application/zip`, asserted with hurl `sha256 == hex,<fixture sha>;`.
        - `user-config` without the key gets 401 with `bytes count == 0`.
      - After the delete: `download` with the key gets 404.
  - **Docs and gates.**
    - Add an AGENTS.md Verification Matrix row, "Uploaded-skill internal registry (user-config, download) | `make smoke`", and its matching row in `docs/agents/verification-matrix.md`. The second row states what a pass does not prove: OCU's real fetch and its cache.
    - Run `make doc-gate`, `make lint-scoped`, `make fmt-check`, `make anti-drift` and `make coverage-gate` (with `OCU_CHECKOUT`), with the `ocu_skills` files at 80% or more.
    - `make smoke` exits 0.
    - No migration, `main.py`, frontend or OCU-repo change.

Suggested fixture level: expanded - a server-to-server secret and a public contract consumed by OCU.
Minimal mergeable slice: atomic - the two routes form one contract that OCU calls in sequence; neither is useful alone. Depends on 2.2 (the replace path behind the replace-commit-failure download check; 2.2 already depends on 2.1 and on 1.2, whose `DELETE /{name}` the deleted-skill 404 uses) and 3.1 (the enabled-set query).

## 5. [webui] Admin Settings tab

- [ ] 5.1 Add the `constraints.yaml` `bounded_overrides` entry for `src/lib/components/chat/SettingsModal.svelte`: ceiling about 1350, a reason naming change `ocu-uploaded-skills` and the user's approval (2026-11-07), and exit_condition "Remove when SettingsModal.svelte is <=800 lines or the 工作区 Skills tabs are removed". Add `src/lib/apis/ocu/skills.ts` (with `skills.test.ts`) covering the admin routes. Add the Admin Settings 「工作区 Skills」 tab as a new component: upload with the server's rejection reason shown, a list, access editing through `workspace/common/AccessControl.svelte`, delete behind a confirmation dialog, and both timing notices (revocation and deletion wait for a sandbox rebuild; a replaced ZIP reaches running sandboxes that already mount it within minutes). In `SettingsModal.svelte` add only the `admin:` tab registration and its render branch, shown only when `features.enable_ocu_workspace`. Run `npm run i18n:parse` for new strings. Create `e2e/ocu-skills.e2e.ts`, add its bare filename `ocu-skills.e2e.ts` to `REQUIRED_SPECS` in `scripts/verify-ui-ocu.py:86-95` (the tuple lists bare filenames), and add an assertion for it to `scripts/test_verify_ui_ocu_repeat.py` (which asserts that list). Verify with `make test-frontend`, `make test-verify-ui-ocu-repeat`, `make lint-scoped` (SettingsModal within the new ceiling) and the Playwright case under `make verify-ui-ocu`: upload a fixture ZIP and see it listed; both notices shown; cancel delete and see it remain; confirm delete and see it disappear; with `/api/config` intercepted to set `features.enable_ocu_workspace=false`, no admin tab and zero `/api/v1/ocu/skills` requests; screenshots, zero console errors.
      Task 5.1 required evidence (issue #749; each item is input → expected output):
  - **Fixture level and risk packs for this task.**
    - Level: expanded. The change touches the shared `SettingsModal.svelte` entry point, and a hard delete sits behind a confirmation.
    - Selected packs:
      - UI flow: upload, list, access, delete and the notices;
      - feature gating: zero requests when the workspace flag is off;
      - API client contract with the merged admin routes;
      - destructive action: delete only after confirmation;
      - upstream spine: a minimal diff to `SettingsModal.svelte` within the new ceiling;
      - i18n: generated, never hand-patched.
    - Not selected:
      - backend, schema and migration: no backend change;
      - auth: the admin routes already enforce `get_admin_user` (tasks 1.1–2.2);
      - concurrency: single-admin UI.
    - Governing invariants:
      - with `features.enable_ocu_workspace` not `true`, no admin 「工作区 Skills」 entry renders and the page sends zero `/api/v1/ocu/skills` requests, even on a deep link `/?settings=admin%3Aocu-skills`;
      - a DELETE is sent only after the user confirms;
      - the grants handed to `POST /{name}/access` keep the `{principal_type, principal_id, permission}` shape of `GET /admin`.
    - Sibling surfaces:
      - `SettingsModal.svelte`: its tab list, group map, search filter, URL deep link and render chain;
      - `/admin/settings/[tab]`, which redirects to `?settings=admin:<tab>`;
      - `AdminTabIcon.svelte`;
      - `AccessControlModal.svelte` / `AccessControl.svelte`, unchanged;
      - `ConfirmDialog.svelte`;
      - `scripts/verify-ui-ocu.py` `REQUIRED_SPECS` and its unit test;
      - `playwright.ocu.config.ts` `testMatch` (a brace glob of spec names);
      - #750, which extends the same client file and the same e2e spec.
  - **API client `src/lib/apis/ocu/skills.ts` with `skills.test.ts` (red first).**
    - It exports exactly four functions for the admin routes, each taking the session token first:
      - `getAdminSkills(token)` → `GET {WEBUI_API_BASE_URL}/ocu/skills/admin`;
      - `uploadSkill(token, file: Blob)` → `POST …/ocu/skills/upload`, with the raw ZIP as the body and `Content-Type: application/zip`. The body is not multipart: the route reads `request.stream()`;
      - `updateSkillAccess(token, name, accessGrants)` → `POST …/ocu/skills/{encodeURIComponent(name)}/access` with the JSON body `{"access_grants": [{principal_type, principal_id, permission}]}`. Each grant is reduced to those three keys, so an `id` from `AccessControl` is dropped;
      - `deleteSkill(token, name)` → `DELETE …/ocu/skills/{encodeURIComponent(name)}`.
    - Every request carries `Authorization: Bearer <token>`.
    - A non-2xx response throws an `Error` whose message is the server's `detail` when that is a string (the 400 rejection reason, 409, 413). Otherwise the message is `HTTP <status>`. A response that is not JSON gives `HTTP <status>`.
    - Before adding the client, grep `src/lib/apis/` for an existing fetch or error helper and reuse it if it fits. Do not add a second one.
    - Unit test with mocked `fetch`, for each function:
      - the URL, method, headers and body (for upload, the same `Blob` instance);
      - the parsed success value;
      - error messages for a string `detail`, a list `detail` (422 → `HTTP 422`) and a non-JSON body.
  - **Tab component `src/lib/components/admin/Settings/OcuSkills.svelte` with `OcuSkills.test.ts`.**
    - All logic lives here. Stable `data-cy` hooks:
      - `ocu-skills-upload` (the file input, `accept=".zip,application/zip"`);
      - `ocu-skills-upload-error`;
      - `ocu-skills-row-{name}`;
      - `ocu-skills-access-{name}`;
      - `ocu-skills-delete-{name}`;
      - `ocu-skills-notice-revocation`;
      - `ocu-skills-notice-replacement`.
    - On mount it calls `getAdminSkills` once and lists each skill's name and description.
    - Upload:
      - Choosing a file uploads it.
      - On success the error is cleared and the list is re-fetched, with no navigation.
      - On failure the server's reason is shown verbatim in `ocu-skills-upload-error` and the list stays unchanged.
      - The input is reset after each attempt, so the same file can be chosen again.
    - Access:
      - The access button opens `AccessControlModal` with `accessRoles={['read']}` and `shareOpen={false}`, so no write and no `anyone` grant can be produced.
      - The modal opens with `accessGrants` set to that skill's `access_grants` from the last `GET /admin` (SA-1).
      - Each change calls `updateSkillAccess`, and the row's grants are replaced by the response.
      - On failure an error toast is shown and the list is re-fetched.
    - Delete:
      - The delete button opens `ConfirmDialog` naming the skill.
      - Cancel sends nothing.
      - Confirm calls `deleteSkill` and removes the row on success. On failure it shows a toast and keeps the row.
    - Both notices are always visible:
      - revocation: revocation and deletion reach running sandboxes only after they are rebuilt;
      - replacement: a replaced ZIP reaches running sandboxes that already mount it within minutes (roughly 60–420 s), while new sandboxes read the cache.
    - Component test (vitest and `@testing-library/svelte`, with the client mocked, following `ImageGenerationPlaceholder.test.ts` for the i18n context):
      - the list renders from `getAdminSkills`;
      - a rejected upload shows the reason;
      - a successful upload calls `getAdminSkills` again;
      - cancel sends no `deleteSkill`;
      - confirm calls it once and the row disappears;
      - the access modal receives the stored grants, and a change calls `updateSkillAccess` with the three-key grants;
      - both notices render.
    - The fork-added files keep 80% or more under `make coverage-gate`.
  - **`SettingsModal.svelte` (the minimal upstream diff; record its line count).**
    - It may only add:
      - one import of `OcuSkills`;
      - one `adminSettings` entry `{id: 'admin:ocu-skills', title: 'Workspace Skills', keywords: [...]}`;
      - its `adminSettingGroups` row (`'Tools'`);
      - a filter in `getAvailableSettings`, so the tab exists only for admins when `$config?.features?.enable_ocu_workspace === true`;
      - one render branch `{:else if selectedTab === 'admin:ocu-skills' && $config?.features?.enable_ocu_workspace === true}<OcuSkills />`.
    - The render branch's `=== true` guard is the only deep-link gate, and it must not be removed. `setFilteredSettings` runs only on mount, on `config.subscribe` and on search. A deep link sets `selectedTab` after mount through the `show` reactive statement, so the `filteredSettings` fallback does not run and `selectedTab` stays `admin:ocu-skills`. Compare `admin:analytics`, which is filtered the same way and still renders on a deep link through its unguarded branch. With the guard false, `OcuSkills` never mounts and no request is sent. No test may assert a fallback to the first tab.
    - `AdminTabIcon.svelte` gains exactly two lines: `{:else if id === 'ocu-skills'}` and an icon component the file already imports, for example `WrenchAlt`. There is no new import and no new icon file. Without the branch the sidebar entry would have no icon, because the file has no `{:else}` fallback. This is a recorded deviation from "SettingsModal only", and it is inside the PR boundary.
    - `constraints.yaml` `bounded_overrides` gains `src/lib/components/chat/SettingsModal.svelte` with ceiling 1365, a reason naming change `ocu-uploaded-skills` and the user's approvals (2026-11-07; raised from about 1350 on 2026-11-08), and exit_condition "Remove when SettingsModal.svelte is <=800 lines or the 工作区 Skills tabs are removed". `make lint-scoped` passes with the file under that ceiling.
      - Both 工作区 Skills tabs share this one ceiling (design.md). The PR records the file's line count after this change and the headroom left for the registration, sidebar button and render branch #750 adds, about 25 lines (1337 + 25 ≤ 1365).
      - User decision (2026-11-08, PR #767 review): each personal tab has a hand-written sidebar button of about 13 lines (`SettingsModal.svelte:994-1167`). #750 therefore needs about 25 lines, and 1350 and 1360 are both too small. The ceiling is 1365, approved by the user, and the reason records that approval.
  - **i18n.**
    - The UI strings are English keys passed through `$i18n.t`. The key for the tab title is `Workspace Skills`.
    - `npm run i18n:parse` regenerates the locale files.
    - Only the `zh-CN` values of the new keys are filled in; the tab title is 「工作区 Skills」. This follows the #709 precedent `a5e4e4ad4`. No other locale value and no existing key is edited.
    - Proof: after the values are filled, a second `npm run i18n:parse` leaves `git diff --exit-code src/lib/i18n` empty against the staged result. Other locales gain only the new keys parse generates, with empty values.
  - **Playwright `e2e/ocu-skills.e2e.ts`.**
    - Uses `openAuthenticatedPage` and `admin` from `e2e/ocu-auth.ts`, and sets `localStorage.locale = 'zh-CN'` as `ocu-image-placeholder.e2e.ts:65` does. Order matters here. `openSettingsFromUrl` strips `?settings=` with `replaceState` (`(app)/+layout.svelte:214-221`), so reloading after the deep link would land on `/` with the modal closed. Set the locale on `/`, reload, and only then `goto` the deep link. Both cases run in zh-CN.
    - It collects `pageerror` and console errors and asserts that none occurred. It saves screenshots under `.run/ui-evidence/` named `ocu-skills-*.png`.
    - Case "admin tab":
      - Open `/?settings=admin%3Aocu-skills`.
      - The tab 「工作区 Skills」 is selected, and both notice elements are visible.
      - Upload `smoke/fixtures/ocu-smoke-skill.zip` through `setInputFiles`. `harness-smoke-skill` appears in the list. A `window` marker set before the upload is still present afterwards, which proves there was no reload.
      - Upload the in-memory payload `setInputFiles({ name: 'not-a-zip.txt', mimeType: 'text/plain', buffer: Buffer.from('not a zip') })`. The text of `ocu-skills-upload-error` must equal that response's `detail` and be non-empty.
      - Through the API, narrow the skill to a group the test creates. Re-open the tab; the access editor opens showing that group (SA-1). Restore the grant afterwards.
      - Click delete, then cancel. No `DELETE /api/v1/ocu/skills/` request is recorded, and the row remains.
      - Click delete, then confirm. Exactly one DELETE is sent, and the row disappears.
      - Cleanup deletes the skill and the group through the API, even when the test fails.
    - Case "workspace off":
      - Use `page.route('**/api/config', …)` to rewrite the response with `features.enable_ocu_workspace = false`, installed before the first navigation.
      - As admin, open the settings modal. Step 1, search box empty: the Database 「数据库」 tab is visible, which proves the admin section rendered. Step 2, type `skills` (the new tab's `keywords` include it; search matches English titles and keywords only): `getByRole('tab', { name: '工作区 Skills' })` has count 0 and the "No matches" notice is visible. The admin section is hidden at this point because `filteredAdminSettings` is empty.
      - Positive control in the "admin tab" case: with the flag on, the same `skills` search finds exactly one tab, 「工作区 Skills」.
      - Navigate to `/?settings=admin%3Aocu-skills`. No `ocu-skills-*` element renders.
      - Across the whole case, zero requests match `/api/v1/ocu/skills`.
    - Add `'ocu-skills.e2e.ts'` to `REQUIRED_SPECS` in `scripts/verify-ui-ocu.py`, and add `assert 'ocu-skills.e2e.ts' in HARNESS.REQUIRED_SPECS` to `scripts/test_verify_ui_ocu_repeat.py`.
    - Add `skills` to the `testMatch` brace glob in `playwright.ocu.config.ts:7-9`, as #709 `6fd42e7c1` did for `image-placeholder`. Without it, the full `make verify-ui-ocu` fails with "required Playwright spec contributes no tests". The repeat path hides the failure, because `OCU_UI_SPEC` overrides `testMatch`, so only the full run proves it.
  - **Gates.**
    - Run `make test-frontend`, `make typecheck` (the ratchet must not rise), `make lint-scoped`, `make fmt-check`, `make anti-drift` (no unused exports: #750 adds the user functions) and `make coverage-gate`.
    - Run `make test-verify-ui-ocu-repeat`.
    - Run `make verify-ui-ocu-repeat SPEC=ocu-skills.e2e.ts REPEAT=1`, then the full `make verify-ui-ocu`, both with zero console errors and with screenshots.
    - No backend, migration or OCU-repo change.

Suggested fixture level: expanded - touches the shared `SettingsModal.svelte` entrypoint and guards a hard delete behind a confirmation.
Minimal mergeable slice: atomic - the API client is dead without its first caller, and this tab is that caller; the line-ceiling override lands with the first diff that needs it. Depends on 1.2 and 2.1.

## 6. [webui] Personal Settings tab

- [ ] 6.1 Add the personal Settings 「工作区 Skills」 tab as a new component, with one switch per readable skill backed by `GET /` and `POST /{name}/toggle`; extend `src/lib/apis/ocu/skills.ts` and `skills.test.ts` with those two user routes. In `SettingsModal.svelte` add only the tab registration and its render branch, shown only when `features.enable_ocu_workspace`, within the `bounded_overrides` ceiling added in task 5.1. Verify with `make test-frontend`, `make lint-scoped` and a Playwright case in `e2e/ocu-skills.e2e.ts`: turn a switch off, reload, and see it still off; with `/api/config` intercepted to set `features.enable_ocu_workspace=false`, no personal tab and zero `/api/v1/ocu/skills` requests; zero console errors.
      Task 6.1 required evidence (issue #750; each item is input → expected output):
  - **Fixture level and risk packs for this task.**
    - Level: expanded. The change touches the shared `SettingsModal.svelte` entry point and persisted per-user state.
    - Selected packs:
      - UI flow: list, switch, reload, and the empty state;
      - persisted state: the switch survives a reload; a failed write is reverted;
      - feature gating: zero requests when the workspace flag is off, deep link included;
      - API client contract with the merged user routes (#747);
      - concurrency: rapid double-clicks on one switch;
      - upstream spine: minimal `SettingsModal.svelte` diff within the 1365 ceiling;
      - i18n: generated, never hand-patched.
    - Not selected:
      - backend, schema: none;
      - auth: the routes use `get_verified_user`, and readability is enforced server-side (#747).
    - Governing invariants:
      - The switch shows the server's `enabled` for the caller, and the only writer is `POST /{name}/toggle`. There is no client-side store and nothing in `user.settings` (Decision 3).
      - With `features.enable_ocu_workspace` not `true`, no personal 「工作区 Skills」 entry renders, and zero `/api/v1/ocu/skills` requests are sent, deep link `/?settings=ocu_skills` included.
    - Sibling surfaces:
      - the admin tab `admin:ocu-skills` (#749), which has the same title and shares the e2e spec;
      - `SettingsModal.svelte`: personal tab list, `personalSettingGroups`, hand-written sidebar buttons, search, deep link and render chain;
      - `Switch.svelte`, unchanged: it has no `disabled` prop and no `$$restProps`, so the in-flight guard and the `data-cy` hook go on wrappers in the new component;
      - the #751 slash menu, which will reuse `getUserSkills`.
  - **API client additions in `src/lib/apis/ocu/skills.ts` and `skills.test.ts` (red first).**
    - Add `getUserSkills(token)`, which sends `GET {WEBUI_API_BASE_URL}/ocu/skills/` with the trailing slash and returns `[{name, description, enabled}]`.
    - Add `toggleSkill(token, name, enabled: boolean)`, which sends `POST …/ocu/skills/{encodeURIComponent(name)}/toggle` with JSON `{"enabled": <bool>}` and returns the item.
    - Both reuse the existing private `requestSkills`, with the same Bearer header and error mapping. Do not add a second helper.
    - Export the type `OcuUserSkill`.
    - Unit tests, using the existing `skills.test.ts` patterns:
      - URL with the trailing slash, method, headers, and the exact JSON body for both `true` and `false`;
      - a name that needs encoding;
      - the parsed result;
      - error mapping for a 404 string `detail`, a 422 list, and a non-JSON body.
  - **Component `src/lib/components/chat/Settings/OcuSkillPreferences.svelte` with `OcuSkillPreferences.test.ts`.**
    - The name differs from the admin `OcuSkills.svelte` so the two imports in `SettingsModal` cannot collide.
    - `data-cy` hooks all start with `ocu-skills-`, so the existing workspace-off assertion `[data-cy^="ocu-skills-"]` covers them:
      - `ocu-skills-pref` on the component root, rendered synchronously. If the render guard were removed, the workspace-off DOM check would then fail at once instead of waiting for `getUserSkills` (added in the #768 review);
      - `ocu-skills-pref-row-{name}`;
      - `ocu-skills-pref-switch-{name}` on a wrapper element around the `Switch`, whose `ariaLabel` names the skill. Tests find the switch with `getByRole('switch', { name: <ariaLabel> })` and assert state through `aria-checked`, or `toBeChecked()` in e2e;
      - `ocu-skills-pref-empty`.
    - Behaviour:
      - On mount, call `getUserSkills` once and list each skill's name and description with a switch set to `enabled`.
      - An empty list shows `ocu-skills-pref-empty`. A failed load shows an error toast and the empty state.
      - A switch change calls `toggleSkill(token, name, newState)`.
      - That switch sits inside a `<fieldset disabled={pending[name]}>` while its request is in flight, so a second click cannot race the first. A guard only inside the change handler is not enough, because `bind:checked` has already flipped the state by then.
      - The fieldset blocks clicks only: bits-ui's `onkeydown` checks only its own `disabled` option. So `toggle` also returns early while `pending[name]` is set and puts the row back. A component test sends a Space keydown while a toggle is pending and expects exactly one `toggleSkill` call. In Chromium the fieldset also blurs the switch, so the e2e Space press is recorded but cannot reach it (#768 review).
      - On success, the row takes `enabled` from the response.
      - On failure, the switch reverts to its previous state and an error toast shows the server's message.
    - Component test (svelte `mount`, as in `OcuSkills.test.ts`; client mocked):
      - rows render from `getUserSkills`;
      - turning a switch off calls `toggleSkill` exactly once, `toHaveBeenCalledWith(expect.any(String), 'a', false)`;
      - while that request is pending, a second click leaves `toggleSkill` called once and the switch disabled; after it settles the switch is enabled again;
      - a rejected toggle reverts the switch and toasts;
      - the empty state renders;
      - a failed load toasts.
    - Fork-added files stay at 80% or more under `make coverage-gate`.
  - **`SettingsModal.svelte` (minimal upstream diff; record its line count).**
    - Only these additions are allowed:
      - one import of `OcuSkillPreferences`;
      - one `allSettings` entry `{id: 'ocu_skills', title: 'Workspace Skills', keywords: ['workspace skills', 'skills', 'ocu', 'sandbox']}`, inserted right after the `audio` entry (the last `Preferences` item). Group headings appear only when the group changes and nothing sorts the list, so appending it at the end would draw a second 「偏好」 heading;
      - its `personalSettingGroups` row (`'Preferences'`);
      - a branch in `getAvailableSettings` that keeps `ocu_skills` only when `workspaceFilesEnabled($config)`. It may call the helper inline or move the existing `const ocuSkills` line above the personal filter;
      - one hand-written sidebar button branch `{:else if tabId === 'ocu_skills'}` in the same shape as its neighbours, with `aria-controls="tab-ocu_skills"`, reusing an icon the file already imports (for example `WrenchAlt`); no new icon import;
      - one render branch `{:else if selectedTab === 'ocu_skills' && workspaceFilesEnabled($config)}<OcuSkillPreferences />`.
    - The render guard is the only gate for a deep link, the same as #749, and must not be removed.
    - The file stays at or below the ceiling of 1365, and `make lint-scoped` passes. The diff adds 28 lines or fewer (estimate: 26–27). The PR records the final line count.
    - `constraints.yaml` is not changed.
  - **i18n.**
    - Same procedure as task 5.1:
      - English keys;
      - `npm run i18n:parse`;
      - fill only the `zh-CN` values;
      - a second parse leaves `git diff --exit-code src/lib/i18n` empty.
    - `Workspace Skills` already exists, so new keys cover only the new strings, such as the empty state.
  - **Playwright, in the existing `e2e/ocu-skills.e2e.ts`.**
    - Fix the existing assertions first. With two `role=tab` elements named 「工作区 Skills」, `tabNamed(page, TAB)` would hit strict mode. Identify the tabs as `[aria-controls="tab-admin-ocu-skills"]` (admin) and `[aria-controls="tab-ocu_skills"]` (personal). Each deep link asserts its own tab is `aria-selected="true"` and the other is `"false"`. After searching `skills`, both `settingsTabs` and `tabNamed(page, TAB)` have count 2, one personal and one admin.
    - New case "personal tab":
      - Setup: as admin through the API, call `removeQuietly(api, …/harness-smoke-skill)` first, then upload `smoke/fixtures/ocu-smoke-skill.zip` with `api.request.post(UPLOAD_PATH, { data: <raw bytes>, headers: { ...api.headers, 'Content-Type': 'application/zip' } })` and expect 200. The `post` helper sends JSON, so it is not used here. Delete removes per-user disable rows, so no disabled leftover can exist.
      - Open `/?settings=ocu_skills` in zh-CN, with the same locale order as task 5.1.
      - The row and switch for `harness-smoke-skill` are visible and on.
      - Turn the switch off and wait for the toggle response through `page.waitForResponse`. `response.request().postDataJSON()` equals `{ enabled: false }`, and the status is 200. The POST entries recorded for `/api/v1/ocu/skills` are exactly `['POST /api/v1/ocu/skills/harness-smoke-skill/toggle']`. Only then reload.
      - Reload, then open the deep link again. The switch is still off.
      - `GET /api/v1/ocu/skills/` through the API also reports `enabled: false`.
      - Cleanup in `finally`: `removeQuietly` (200 or 404), safe to run twice.
      - Zero console errors and page errors. Screenshot `.run/ui-evidence/ocu-skills-personal.png`.
    - Extend the existing "workspace off" case. After the admin checks:
      - open `/?settings=ocu_skills`. Positive control first: `settingsSearch(page)` and the 「数据库」 tab are visible, which proves the modal opened;
      - no `ocu-skills-*` element renders;
      - `getByRole('tab', { name: '工作区 Skills' })` has count 0;
      - the existing zero-request assertion still covers the whole case.
  - **Gates.**
    - `make test-frontend`;
    - `make typecheck`, with the ratchet not rising;
    - `make lint-scoped` with SettingsModal at or below 1365;
    - `make fmt-check`;
    - `make anti-drift`;
    - `make coverage-gate`;
    - `make verify-ui-ocu-repeat SPEC=ocu-skills.e2e.ts REPEAT=1`, then the full `make verify-ui-ocu`;
    - no backend, `constraints.yaml`, or OCU change.

Suggested fixture level: expanded - touches the shared `SettingsModal.svelte` entrypoint and persisted per-user state; the line-ceiling override is already in place from task 5.1.
Minimal mergeable slice: atomic - one component plus its tab entry. Depends on 3.1 and 5.1.

## 7. [webui] Slash menu group

- [ ] 7.1 Add the 「工作区 Skills」 group to `Commands/SlashCommands.svelte` and its selection handling in `CommandSuggestionList.svelte`, as minimal upstream diffs. The group lists the user's enabled set (design.md Decision 6) whenever `features.enable_ocu_workspace` is true, whatever the sandbox state or model filters. Selecting an entry inserts a mention with id `ocu--{name}|{name}` and label `{name}`, as the native skill branch does (`CommandSuggestionList.svelte:136-139`), plus `mentionSuggestionChar: '/'`. The chat input's `/` command inserts the given attrs without a trigger char (`MessageInput.svelte:1418-1426`), so the branch passes `mentionSuggestionChar: '/'`; without it the editor falls back to `@` and writes `<@…>`. The editor then serializes only the id, `/` written as `$`, so the sent text carries `<$ocu--{name}|{name}>` (`RichTextInput.svelte:117-125`; no `RichTextInput.svelte` change). Built-in OCU skills never appear, and nothing is requested when the workspace is disabled. Add the fallback backend pytest: a message carrying `<$ocu--invoice-builder|invoice-builder>` passed through `strip_skill_mentions` comes out as `invoice-builder` (`SKILL_MENTION_STRIP_RE`, `middleware.py:2293`, matches the `$` form; the unknown id is skipped at `:2775-2780`). Verify with `make test-frontend`, that pytest module, and a Playwright case in `e2e/ocu-skills.e2e.ts`: a disabled skill is absent; the outgoing request body for a selected skill contains `<$ocu--invoice-builder|invoice-builder>`; with `/api/config` intercepted to set `features.enable_ocu_workspace=false`, no group and zero `/api/v1/ocu/skills` requests.
      Task 7.1 required evidence (issue #751; each item is input → expected output):
  - **Fixture level and risk packs for this task.**
    - Level: expanded. The change touches the shared chat-input command menu, which sits next to the upstream spine.
    - Selected packs:
      - UI flow: the menu group, filtering, and selection by mouse and keyboard;
      - contract: the mention id `ocu--{name}|{name}` and its serialized form `<$ocu--{name}|{name}>`;
      - backward compatibility: native skill handling is unchanged, and pytest pins the fallback strip;
      - feature gating: zero requests when the workspace flag is off;
      - upstream spine: minimal diffs to `SlashCommands.svelte` and `CommandSuggestionList.svelte`. `src/lib/components/common/RichTextInput.svelte` and `middleware.py` stay out of the diff.
    - Not selected:
      - backend routes and schema: no change;
      - auth: `GET /` enforces readability, so an uploaded skill the user cannot read never reaches the menu (#747).
    - Governing invariants:
      - The group lists exactly the `enabled: true` entries of the caller's `GET /api/v1/ocu/skills/` (Decision 6), whatever the sandbox state or model filters. Built-in OCU skills never appear.
      - Selecting an entry only inserts the mention, so the frontend chat request carries no `skill_ids`.
        - On the server, `extract_skill_ids_from_messages` (`middleware.py:2732-2737`) still extracts `ocu--invoice-builder`, merges it into `skill_ids`, and drops it at `:2775-2780` because no native skill has that id.
        - Known residual risk, on the no-filter fallback path only: native skill ids are only checked against `[a-z0-9_-]+` (`routers/skills.py:170`). A native skill created with the id `ocu--invoice-builder` would therefore be injected.
        - With the OCU filter installed, its inlet rewrites the marker first (`:2635`), before extraction runs.
      - With `features.enable_ocu_workspace` not `true`, the menu makes zero `/api/v1/ocu/skills` requests.
    - Sibling surfaces:
      - the native `Skills` group and its `type === 'skill'` branch, unchanged. Its slash `onSelect` in `MessageInput.svelte:1448-1456` handles only `model` and then focus. Native mentions from the chat `/` menu serialize as `<${id}|{name}>` since #771;
      - prompts and commands: their order and indices are unchanged;
      - the `src/lib/components/common/RichTextInput.svelte` serializer (`mentions` rule, 117-125), unchanged;
      - `middleware.py`, unchanged;
      - the #752 OCU filter, which rewrites the marker;
      - the #750 personal tab, whose switches define the enabled set.
  - **`Commands/SlashCommands.svelte` (minimal upstream diff).**
    - Each mount fetches at most once with `getUserSkills` from `$lib/apis/ocu/skills`, and only when `workspaceFilesEnabled($config)` is true. The suggestion plugin mounts the component on `onStart` and only updates `query` on `onUpdate`, so this is one fetch per `/`, never one per keystroke.
    - Errors are swallowed and give an empty group, as the upstream `.catch(() => null)` does.
    - `ocuSkills` holds the `enabled: true` entries whose `name` includes `query` (case-insensitive), sorted by name.
    - These entries are appended to `filteredItems` after the native skills as `{type: 'ocu_skill', data}`, so keyboard indices continue the existing sequence (row index offset by `skills.length`).
    - Markup:
      - A wrapper element with `data-cy="ocu-skills-slash-group"` encloses both the header `$i18n.t('Workspace Skills')` (zh-CN 「工作区 Skills」, an existing key) and the rows.
      - Each row has `data-cy="ocu-skills-slash-{name}"` and mirrors the native skill rows: the name, the tooltip through the existing `getSkillTooltipContent`, and selection on mousemove.
      - The group renders only when the list is non-empty.
  - **`CommandSuggestionList.svelte` (minimal upstream diff).**
    - Add one branch (an `else` calling a helper that checks `type === 'ocu_skill'`, to stay under the complexity limit): `command({ id: \`ocu--${data.name}|${data.name}\`, label: data.name, mentionSuggestionChar: '/' })`.
    - The branch calls no `onSelect`.
  - **Component test `Commands/SlashCommands.test.ts` (new, red first).**
    - Use svelte `mount`, as `OcuSkills.test.ts` does. Mock `getPrompts`, `getSkillItems` and `getUserSkills`, and set the `config` store.
    - With the flag on and skills `invoice-builder` (enabled) and `harness-smoke-skill` (disabled):
      - the group lists only `invoice-builder`;
      - query `inv` keeps it, and query `zzz` hides the group;
      - `getUserSkills` is called exactly once across several query changes;
      - clicking the row calls `onSelect` with `{type: 'ocu_skill', data: {name: 'invoice-builder', …}}`;
      - `select()` after `selectDown` to that row does the same.
    - With the flag off: `getUserSkills` is never called, and the group is absent.
    - A rejected `getUserSkills` gives no group and throws no error.
  - **Fallback pytest `backend/open_webui/test/utils/test_ocu_skill_mention_fallback.py`.**
    - This is a pin test of unchanged middleware behaviour, with exact expected strings.
    - `strip_skill_mentions` on `[{'role':'user','content':'用 <$ocu--invoice-builder|invoice-builder> 做发票'}]` gives exactly `用 invoice-builder 做发票`. The same holds for the list content `[{'type':'text','text':…}]`.
    - `extract_skill_ids_from_messages` on the same message returns exactly `{'ocu--invoice-builder'}`.
    - Red-proof: `monkeypatch.setattr(middleware, 'SKILL_MENTION_STRIP_RE', <a regex matching only the '/' form>)`, then show that the strip assertion fails. `strip_skill_mentions` reads the module global at call time, so the swap takes effect.
  - **Playwright, in the existing `e2e/ocu-skills.e2e.ts`.**
    - Fixture `smoke/fixtures/ocu-invoice-builder.zip`, next to the existing smoke fixture:
      - built with the one-liner style of `smoke/ocu-skills.hurl:4-5`, with `name: invoice-builder` and a description;
      - the build command and its sha256 are recorded in a comment in the spec.
    - New case "slash menu".
      - Setup as admin, through the API:
        - `removeQuietly` both skills, then upload `invoice-builder` and `harness-smoke-skill` as raw ZIPs;
        - disable `harness-smoke-skill` for the admin with `POST /harness-smoke-skill/toggle {"enabled": false}`;
        - point the OpenAI connection at the OCU stub model, as `ocu-image-placeholder.e2e.ts` does.
      - Open a new chat in zh-CN with the stub model selected, and type `/` in `#chat-input`.
      - Check the group:
        - the 「工作区 Skills」 group is visible;
        - inside `ocu-skills-slash-group`, the `[data-cy^="ocu-skills-slash-"]` rows are exactly one, `ocu-skills-slash-invoice-builder`. The disabled skill and every built-in OCU skill are therefore absent.
      - Type `inv`. `ocu-skills-slash-invoice-builder` is visible and `data-selected="true"` before Enter is pressed.
      - Press Enter, type ` 做发票`, and send. Set up `page.waitForResponse` on `/api/chat/completions` before sending and read the body from its `.request().postDataJSON()`. Then check:
        - `request.postDataJSON().user_message.content` contains `<$ocu--invoice-builder|invoice-builder>`;
        - `skill_ids` is `undefined`.
        - A saved chat sends no history `messages`; the user text is in `user_message`.
        - Capture the chat id from the `chat_id` of the `/api/chat/completions` response: the backend creates the chat inline (`main.py:1276-1277`), so this path never calls `/api/v1/chats/new`.
      - Wait for the stub reply `Stub reply. Saw: no OCU system prompt.` to be visible before cleanup.
      - Cleanup in `finally`:
        - `DELETE /api/v1/chats/{id}`;
        - `removeQuietly` both skills;
        - restore the OpenAI config.
      - Expect zero console and page errors. Save the screenshot `.run/ui-evidence/ocu-skills-slash.png` with the group open.
    - Extend the existing "workspace off" case. Run these steps before the existing `expect(requests).toEqual([])`:
      - After the personal deep-link checks, close the settings modal or navigate to `/`.
      - Type `/` in `#chat-input`.
      - Positive control: the native 「命令」 header is visible.
      - Wait for one native debounce request, `getPrompts` or `getSkillItems` (200 ms), as a sync point.
      - No `ocu-skills-slash-*` element exists.
      - The existing zero-request assertion then covers the whole case.
  - **Gates.**
    - `make test-frontend`.
    - `make typecheck`; the ratchet must not rise.
    - `make lint-scoped`.
    - `make fmt-check`.
    - `make anti-drift`.
    - `make coverage-gate`, with `OCU_CHECKOUT` set.
    - The fallback pytest module.
    - `make verify-ui-ocu-repeat SPEC=ocu-skills.e2e.ts REPEAT=1`, then the full `make verify-ui-ocu`.
    - `git diff --name-only origin/main -- src/lib/components/common/RichTextInput.svelte backend/open_webui/utils/middleware.py` prints nothing.

Suggested fixture level: expanded - it touches the shared chat input entrypoint (upstream spine-adjacent command menu).
Minimal mergeable slice: atomic - one group and its selection branch; splitting them leaves an unselectable list. Depends on 6.1 (the user-route API client) and 5.1 (the e2e spec).

## 8. [ocu] Filter marker rewrite

- [ ] 8.1 In `openwebui/functions/computer_link_filter.py` `inlet`, with a regex keyed on the `<$ocu--` prefix:
  - replace each `<$ocu--{name}|{label}>` in all user messages (string content and text parts) with `{label}`;
  - for the last user message only, append the named-skill sentence to the system message once per distinct name;
  - leave marker-free bodies byte-identical.

  Verify with OCU pytest for the single, repeated, earlier-message and no-marker cases, and confirm the existing `ocu-filter-auth` tests stay green. This task changes only the OCU repository.
  Task 8.1 required evidence (issue #752; each item is input → expected output):
  - **Fixture level and risk packs for this task.**
    - Level: expanded. The task parses and rewrites message text inside the filter inlet, which every OCU chat request passes through.
    - Selected packs:
      - public contract: the marker grammar shared with the #751 `/` menu, which produces it, and native `strip_skill_mentions`, which is the fallback consumer;
      - error handling: every existing early return of `inlet` stays unchanged;
      - legacy compatibility: `ocu-filter-auth` behaviour and the injected-prompt layout stay byte-identical for marker-free bodies;
      - prompt integrity: user text must not reach the system message except as a grammar-checked skill name;
      - resource limits: the inlet runs synchronously on the request path over every user message of the history, and the gateway sets no body cap (`client_max_body_size 0`), so the scan must be linear in the text length (review finding on OCU PR #223);
      - documentation: the OCU filter docs and changelog describe the new inlet step (#702 precedent: `CHANGELOG.md` Unreleased entry and `docs/openwebui-filter.md`, commit `c07baae`).
    - Not selected:
      - config: no new Valve or environment variable;
      - auth/secrets: the token path is untouched, and a marker grants nothing (design.md Decision 9);
      - schema: no stored data.
    - Governing invariant: the marker rewrite changes a body only on the path where the filter injected the OCU prompt. On that path, its only changes are label rewrites in user messages and at most one sentence per distinct name of the last user message.
    - Sibling surfaces:
      - producer: the #751 `/` menu emits `<$ocu--{name}|{name}>`;
      - fallback consumer: native `strip_skill_mentions` (`middleware.py:2293`);
      - the `<available_skills>` block of the OCU prompt, which the sentence points at;
      - the `inlet` early returns: non-saved chat id, `INJECT_SYSTEM_PROMPT` off, failed or unauthorized fetch, empty `messages`;
      - all three system-message branches: insert before the template-variable block, plain string append, and non-string content coerced to a string (existing test `tests/test_filter.py:782`); plus the system message the inlet inserts when none exists.
  - **Where the rewrite runs.**
    - The rewrite and the sentence run only after the OCU prompt has been injected, that is after the whole existing system-message step at the end of `inlet`. The sentence is appended to the final system-message content, never to `system_prompt` before insertion, so in the template-variable branch it lands after the template block.
    - Every early return returns `body` exactly as today, raw marker included. Native `strip_skill_mentions` then removes it downstream: it runs unconditionally after the inlet filters (`middleware.py:2635` inlet, `:2807` strip). The sentence names `<available_skills>`, which exists only in an injected prompt.
  - **Marker grammar.**
    - One module-level compiled regex: `<\$ocu--([a-z0-9][a-z0-9-]{0,63})\|([^<>]*)>`, applied in a single `sub` pass per text with a callback that collects names; no second `finditer` pass.
    - The name class equals the WebUI upload name rule `_NAME` (`backend/open_webui/utils/ocu_skill_zip.py:22`). The label class excludes `<` as well as `>`, so every match attempt stops at the next `<` and the scan is linear; a label from the #751 menu is the name and never contains `<`. A marker whose label holds `<` is left to native stripping, whose label class is `[^>]*`.
    - A `<$ocu--` sequence that does not fully match is left verbatim by the filter and adds no sentence (native stripping may still rewrite it downstream, e.g. `<$ocu--a_b|x>` becomes `x`). Examples: `<$ocu--Bad Name|x>`, `<$ocu--a_b|x>`, ``<$ocu--x`y|x>``, and a missing `|`. This is what keeps arbitrary user text out of the system message.
  - **Rewrite cases.** Each case calls `Filter.inlet()` with a saved `CHAT_ID`, `OCU_INTERNAL_TOKEN` set, and the prompt fetch mocked to return `PROMPT`:
    - Single: last user message `请用 <$ocu--invoice-builder|invoice-builder> 生成发票` → its content is `请用 invoice-builder 生成发票`, and the system message content ends with `\n\n` followed by the exact sentence of design.md Decision 9 with `{name}` = `invoice-builder` (the test spells the sentence out as a literal).
    - Repeated: the same marker twice in the last user message → both replaced, and the sentence occurs exactly once (`count == 1`).
    - Two names: `<$ocu--a|a>` then `<$ocu--b|b>` → two sentences, `a` first, joined by `\n` after one `\n\n` separator.
    - Label differs from name: `<$ocu--invoice-builder|Invoice Builder>` → the text contains `Invoice Builder`, and the sentence names `invoice-builder`.
    - Earlier message: a marker for `old` in the first user message, and a marker-free last user message → the earlier text has its label, and the system message content equals the no-marker expectation exactly, with no sentence.
    - Mixed: `old` only in an earlier message, `new` in the last → only the `new` sentence.
    - Text parts: the last user message has content `[{"type": "text", "text": "用 <$ocu--a|a>"}, {"type": "image_url", "image_url": {"url": "data:x"}}]` → the text part becomes `用 a`, and the image part is equal and still at index 1. The same holds for a parts list in an earlier message.
    - System message forms: an existing plain system message, one containing `{{CURRENT_DATE}}` (the prompt still sits before that block), one with non-string (list) content that the inlet coerces to a string, and none (the inlet inserts it at index 0). In each, the content ends with the sentence.
  - **Controls (green before and after; they guard must-preserve).**
    - No marker: the output equals what today's inlet produces for the same body: `tool_ids` plus the injected `PROMPT`, the user messages `==` their deep-copied input, and the system message content exactly `PROMPT` or `existing\n\nPROMPT`.
    - Early returns with a marker: a non-saved chat id, `INJECT_SYSTEM_PROMPT=False`, `OCU_INTERNAL_TOKEN` unset (`monkeypatch.delenv`, because the autouse `_filter_test_token` fixture sets it), and a fetch answering 401 each leave `messages ==` the deep-copied input, raw marker included, and `tool_ids` exactly as today.
    - Other roles: a marker inside an assistant or system message is left verbatim. Only `role == "user"` messages are rewritten.
    - Grammar negatives from the grammar item above, plus a leading hyphen (`<$ocu---a|x>`), an upper-case-only name (`<$ocu--Abc|x>`) and a label holding `<` (`<$ocu--a|x<y>`) → the text is unchanged and there is no sentence.
    - Grammar boundary (a rewrite case): a 64-character name is rewritten and named in the sentence; the 65-character twin stays a negative.
    - Linear scan: a user message of `"<$ocu--a|" * 20000` (180 KB, no `>`) passes through `inlet` unchanged in under 1 s; the quadratic `[^>]*` form takes several seconds on the same input.
    - Cache: after a first call whose last user message carries `<$ocu--a|a>`, a second `inlet` call on the same filter for the same chat with a marker-free body has no sentence, so the sentence never enters `_prompt_cache`.
  - **Red and green.**
    - Every rewrite case is red on OCU `main` `2fea8f6` (no rewrite, no sentence) and green after.
    - The controls pass on both.
    - Tests go in `tests/test_filter.py`, reusing `_make_filter`, `_urlopen_mock`, `_system_content` and `CHAT_ID`. Add no new production file.
  - **Docs in the same change.**
    - The module docstring FUNCTIONALITY block describes the marker rewrite and the sentence.
    - The header `version` goes from 5.1.0 to 5.2.0.
    - `docs/openwebui-filter.md` gains a short section on the marker rewrite, the sentence and the early-return fallback.
    - `CHANGELOG.md` gains an entry under "Unreleased — `main` branch" / Added.
  - **Must preserve and gates.**
    - The existing `tests/test_filter.py` cases (69 today), `tests/test_video_production_filter.py` and `tests/test_org_prompt_filter.py` pass unchanged.
    - The full OCU unit command from OCU `AGENTS.md` passes. The PR states its passed and skipped counts before and after.
    - `uvx ruff check` on the changed files adds no finding over `main`.
    - The PR changes only `openwebui/functions/computer_link_filter.py`, `tests/test_filter.py`, `docs/openwebui-filter.md` and `CHANGELOG.md`. The two docs files widen the issue's PR Boundary, which names only the module and its tests, because docs change with code in the same PR (#702 precedent).
  - **Non-goals.**
    - No `computer-use-server/` change.
    - No authorization check of the named skill.
    - No rewrite when the filter skips prompt injection; native stripping covers that path.
    - No persistence: the rewrite applies to the request body only.
    - Issue acceptance wording: "a body with no marker equals the input byte for byte" cannot hold literally for a saved chat, because the inlet already adds `tool_ids` and the prompt; the control above uses the spec delta's wording, "equals the body produced before this change".

Suggested fixture level: expanded - a parser/writer of message text inside the shared request entrypoint (filter inlet) that every OCU chat request passes through.
Minimal mergeable slice: atomic - one transform plus its tests.

## 9. [deploy] Wire OCU to the WebUI registry

- [ ] 9.1 In `deploy/production-like-test/` compose and bootstrap, set `MCP_TOKENS_URL=http://open-webui:8080/api/v1/ocu/skills` on `computer-use-server`, and set `MCP_TOKENS_API_KEY` from the `OCU_INTERNAL_TOKEN` already in `runtime.env` (`bootstrap-test.sh:389`), never written to a repository file, command line or log. Add a registry status line to `scripts/write-deployed-version.sh` following its configured yes/no pattern (`:44-53`), never printing the key. Verify with `tests/deploy/` cases: the rendered `computer-use-server` environment has both values; no file added by this change carries the token value (the pre-existing `runtime.env`, which already holds `OCU_INTERNAL_TOKEN`, is out of scope); `MCP_TOKENS_API_KEY` appears in no service environment other than `computer-use-server`; the deployment record shows `yes` when configured and `no` when not, and never the key; an unset `OCU_INTERNAL_TOKEN` still triggers the existing bootstrap refusal.
      Task 9.1 required evidence (issue #753; each item is input → expected output):
  - **Fixture level and risk packs for this task.**
    - Level: expanded. The task changes production deploy config and routes a secret to a new consumer.
    - Selected packs:
      - auth/secrets: `MCP_TOKENS_API_KEY` carries the `OCU_INTERNAL_TOKEN` value; it must reach no repository file, command line, log, other service or sandbox;
      - config: one new optional runtime.env knob, `MCP_TOKENS_URL`, with defined absent, set and empty states;
      - legacy compatibility: a runtime.env written before #753 (the LAN instance) must turn the registry on with no manual edit; the existing `OCU_INTERNAL_TOKEN` refusal and every other service environment stay unchanged;
      - documentation: the deployment record line and the overlay docs.
    - Not selected:
      - network: OCU already reaches `open-webui:8080` on the shared control-plane bridge; the browser deny row is #754;
      - schema, resource limits, concurrency: none.
    - Governing invariant: `MCP_TOKENS_API_KEY` exists only in the `computer-use-server` environment, never in a sandbox, and its value is exactly the runtime `OCU_INTERNAL_TOKEN`, interpolated by Compose and never copied into a new file, argument or output.
    - Sibling surfaces:
      - `deploy/up.sh` and `deploy/compose-snapshot.sh` resolve the protected compose snapshot, which already holds the resolved `OCU_INTERNAL_TOKEN`;
      - `write-deployed-version.sh`;
      - `bootstrap-test.sh`, unchanged (see Wiring);
      - `deploy/recovery.py`: not affected. `MCP_TOKENS_URL` matches no `SECRET_MARKERS` entry (`_TOKENS_` is not `_TOKEN_`, `recovery.py:76,592`), and retarget keeps every existing key (`:546`); the PR cites these lines;
      - sandboxes: `_create_container` `extra_env` and `_PASSTHROUGH_BY_CLI` (`docker_manager.py:471-543,1201-1240`) name neither variable, so no sandbox gets the key;
      - `computer-use-server` consumers: `skill_manager.py:34-35,298-360`, the GitLab-token fetch `docker_manager.py:617-689`, `/api/skill-stats` (`app.py:1688-1700`), and OCU's own `scripts/check-config.sh:115-123`.
  - **Wiring (one design).**
    - `compose.core.override.yml` `computer-use-server.environment` gains exactly two entries:
      - `MCP_TOKENS_URL: ${MCP_TOKENS_URL-http://open-webui:8080/api/v1/ocu/skills}`, the pattern of `SANDBOX_RETENTION_DAYS: ${SANDBOX_RETENTION_DAYS-30}` (`:54`), with a comment naming the three states;
      - `MCP_TOKENS_API_KEY: ${OCU_INTERNAL_TOKEN:?OCU_INTERNAL_TOKEN is required}`.
    - States:
      - absent from runtime.env (every runtime.env, fresh or written before #753) → the registry URL, so the LAN instance gets the registry on its next `up` without an edit;
      - set → that value;
      - explicitly empty (`MCP_TOKENS_URL=`) → `""`, the disabled state.
    - `bootstrap-test.sh` is not changed: the compose default already covers a fresh runtime.env, and runtime.env gets no `MCP_TOKENS_*` line and no second copy of the token. This deviates from the task text "compose and bootstrap"; the PR records it.
    - `deploy/up.sh`'s `require` list is unchanged.
  - **Disabled state, stated honestly.** With `MCP_TOKENS_URL=` the key is still set, because it is wired from `OCU_INTERNAL_TOKEN`:
    - `skill_manager._fetch_user_config` checks only the key (`:305`), builds the relative URL `/api/internal/user-config/{email}`, aiohttp refuses it before any connection, the error is logged at `:326` without the key, and OCU falls back to the disk-cached user-config, then built-ins;
    - this logs one warning per user per `MEMORY_CACHE_TTL`, as `main` already logs `MCP_TOKENS_API_KEY not configured` per fetch;
    - `docker_manager.py:676,683` skip the GitLab fetch because they check the URL;
    - `scripts/check-config.sh` would call it partial config; that script is not part of this overlay's `up` path.
    - So the rollback step "unset `MCP_TOKENS_URL` and `MCP_TOKENS_API_KEY` on OCU" (design.md Migration Plan) becomes, for this overlay: set `MCP_TOKENS_URL=` in runtime.env (or deploy the previous release), then clear `SKILLS_CACHE_DIR` as the Migration Plan says. `NETWORK-HARDENING.md` states this; the user guide (#756) cites it.
  - **Structure (red on `main`, green after).** On the parsed override, in the style of `test_tts_settings_reach_only_the_computer_use_server` and `:295-302`:
    - `core_env["MCP_TOKENS_URL"] == "${MCP_TOKENS_URL-http://open-webui:8080/api/v1/ocu/skills}"`;
    - `interpolated(core_env["MCP_TOKENS_API_KEY"], "OCU_INTERNAL_TOKEN")` holds (the `:?` helper at `:124`);
    - `interpolate_value(core_env["MCP_TOKENS_URL"], {})` is the URL, with `{"MCP_TOKENS_URL": ""}` is `""`, and with another value is that value;
    - no other service in the core, webui or proxy documents names `MCP_TOKENS_` (checked by name, `assertNotIn("MCP_TOKENS_", json.dumps(service))`; by value would wrongly fail, because WebUI and the proxy legitimately carry `OCU_INTERNAL_TOKEN`).
  - **Native compose (red on `main`, green after).** With `resolved_stacks`, which refuses a non-zero exit and any "is not set" warning:
    - `MCP_TOKENS_URL` unset → `computer-use-server` has the URL and `MCP_TOKENS_API_KEY ==` the synthetic `OCU_INTERNAL_TOKEN`;
    - `MCP_TOKENS_URL=""` → `""`, key unchanged;
    - no other resolved service has an `MCP_TOKENS_API_KEY` or `MCP_TOKENS_URL` key.
  - **No secret in files or arguments.**
    - After a bootstrap run with the harness's generated token: runtime.env contains the token value exactly once (the existing `OCU_INTERNAL_TOKEN=` line) and no `MCP_TOKENS_` line.
    - After the consumer `up` run (the existing token test around `test_bootstrap_runtime.py:490-531`): the token is absent from stdout and stderr, from the fake docker's `ops.log`, and from every `argv` in `executed.json` (`tests/deploy/fakebin/docker:51,343`). It may appear only inside the recorded resolved documents.
    - This case uses the hand-written `token_docs()` documents, so it proves only the argv/log side. The overlay file itself is proven by the Structure and Native compose cases; the PR says so.
  - **Deployment record (red on `main`, green after).**
    - `write-deployed-version.sh` gains one line in `## Runtime policy`, following `retention_days` (`:25-32`): `- Uploaded-skill registry: configured \`yes|no\`; the registry URL and internal key are not recorded`.
    - `yes` when runtime.env has no `MCP_TOKENS_URL` line or a non-empty one; `no` when it has `MCP_TOKENS_URL=`.
    - Cases, in the `write_version` style of `test_bootstrap_runtime.py:950-980`: the bootstrap-written runtime.env → `yes`; `MCP_TOKENS_URL=http://x.example/y` → `yes`; `MCP_TOKENS_URL=` → `no`; a runtime.env with a misplaced `MCP_TOKENS_API_KEY=<sentinel>` line → neither the sentinel nor `open-webui:8080` nor `x.example` is in the record.
    - The script never reads `OCU_INTERNAL_TOKEN` or `MCP_TOKENS_API_KEY`.
  - **Existing refusal (controls; green before and after).** The task text says "bootstrap refusal", but bootstrap generates the token itself (`bootstrap-test.sh:346,389`); the refusal is in `up.sh` and Compose.
    - `up.sh` with `OCU_INTERNAL_TOKEN` absent exits non-zero with `deploy: OCU_INTERNAL_TOKEN is required`, and the fake docker records no start and no op. Extend the pattern of `test_office_settings_are_required_in_both_flag_states` (`test_deploy_entry.py:200-220`, `starts() == []`, `ops() == []`).
    - Native compose with `extra={"OCU_INTERNAL_TOKEN": ""}` makes `resolved_stacks` raise, with `OCU_INTERNAL_TOKEN is required` in the message.
  - **Known effects, accepted (no `computer-use-server` change, design.md Non-Goals).**
    - GitLab-token fetch: with the URL set, `_ensure_gitlab_token` runs on every bash and sub_agent tool call (`mcp_tools.py:512,589,662,735,1086`) and `_server_gitlab_token` at sandbox creation (`docker_manager.py:1186`). Each requests `{MCP_TOKENS_URL}/api/internal/tokens/{email}/gitlab` with the internal key. WebUI has no such route; its `SPAStaticFiles` (`backend/open_webui/main.py:294-304`) answers 200 with `index.html`, so aiohttp's JSON decode fails and `:655` swallows it. Cost: one loopback round trip (5 s timeout) and one log line with the user's email per tool call; no GitLab token, as today. The orchestrator files a follow-up issue for it.
    - `/api/skill-stats` (`app.py:1688-1700`) is open today because the key is empty; afterwards it requires `X-Internal-Api-Key == OCU_INTERNAL_TOKEN`. Nothing in OCU or WebUI calls it.
    - Residual: an MCP caller that already holds `OCU_INTERNAL_TOKEN` can send `X-Mcp-Tokens-Url` (`mcp_tools.py:1472`) and redirect the GitLab fetch, with the env key, to a URL of its choice (`docker_manager.py:673-674`). `openwebui/` sends no such header. The PR records this.
  - **Docs in the same change.**
    - `deploy/production-like-test/NETWORK-HARDENING.md`, near the runtime.env paragraph at `:214`: the knob, its three states, that the key reuses `OCU_INTERNAL_TOKEN`, and the disabled-state behaviour above.
    - The same section states the ordering: deploy the WebUI image with the registry routes first. If OCU is upgraded first, an old WebUI answers the user-config path with a non-JSON 200 (`SPAStaticFiles`, `backend/open_webui/main.py:294-304`), not a 404; OCU swallows it at `skill_manager.py:326` and falls back to the disk cache, then built-ins.
    - `CHANGELOG.md` gains an Unreleased `main` / Added entry.
  - **File gate and must preserve.**
    - The PR changes only `deploy/production-like-test/compose.core.override.yml`, `deploy/production-like-test/scripts/write-deployed-version.sh`, `deploy/production-like-test/NETWORK-HARDENING.md`, `CHANGELOG.md` and `tests/deploy/`.
    - It changes no `computer-use-server/`, proxy, bootstrap or WebUI file.
    - Every existing `tests/deploy/` case passes. If an existing exact-set assertion over a service environment must grow, the PR names each edited assertion and why.
    - The full OCU unit command passes; the PR states passed and skipped counts before and after.
  - **Non-goals.** No separate key (design.md Decision 2); no deploy to the LAN instance; no proxy row (#754); no change to the GitLab-token fetch or `/api/skill-stats`.

Suggested fixture level: expanded - production config and a secret.
Minimal mergeable slice: atomic - two environment entries consumed together by the skill manager, plus their status line.

## 10. [deploy] Proxy deny row and gateway smoke

- [ ] 10.1 [deploy] Add `location ^~ /api/v1/ocu/skills/api/internal/ { return 404; }` to `deploy/proxy/nginx.conf.in` ahead of the catch-all row. Verify with `deploy/proxy/tests/` render and entrypoint cases: the internal path gets 404 for every method, and other `/api/v1/ocu/skills` paths still reach WebUI.
- [ ] 10.2 [webui] Bump `constraints.yaml ocu_checkout.sha` to the OCU commit containing tasks 8.1, 9.1 and 10.1. Add a `smoke/proxy/` hurl case: `GET /api/v1/ocu/skills/api/internal/user-config/x@y.z` through the gateway with a key header gets a plain 404 (WebUI itself would answer 401 to a wrong key and 200 to an unknown email with the right key, so the 404 proves the gateway answered); `GET /api/v1/ocu/skills/` as a signed-in user gets 200. Add an AGENTS.md Verification Matrix row. Verify with `make smoke-proxy`.

Suggested fixture level: expanded - the browser gateway auth boundary.
Minimal mergeable slice: task 10.1 in the OCU repository first; it keeps OCU green alone. Task 10.2 depends on the merged OCU commit, on task 3.1 (the forwarded user route) and on task 4.1 (the internal routes the gateway must hide).

## 11. [webui] User guide

- [ ] 11.1 Add the user guide `docs/uploaded-skills.md`, linked from AGENTS.md Project Identity next to the Office user guide. It covers uploading as an administrator, ZIP layout, limits and rejection reasons (413 for size, 400 otherwise), narrowing access, personal switches, `/` usage, and the effect timing table from the source plan (replacement reaches running sandboxes within minutes; revocation waits for a rebuild). It states the revocation and rollback steps of design.md Migration Plan: revoke by deleting in WebUI while the registry is reachable; unsetting `MCP_TOKENS_URL` alone does not return OCU to built-ins only; a full rollback also clears OCU's `SKILLS_CACHE_DIR` including `_user_configs/`. Verify with `make doc-gate`.

Suggested fixture level: none - docs only.
Minimal mergeable slice: atomic - one document.
