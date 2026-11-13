# Tasks

All tasks are in this repository. Each production change ships with its test in the same task, and each new test is red before the implementation (AGENTS.md § TDD). No task may implement an item from design.md Non-Goals. Each task is sized for one PR of at most 400 diff lines, tests and docs included, excluding regenerated i18n catalogs.

## 1. Column, listings and administrator route

- [x] 1.1 Add the migration and the column, and carry the field through every listing.
  - **Migration.** Add `backend/open_webui/migrations/versions/<rev>_add_ocu_skill_display_name.py` with `down_revision = 'f7a8b9c0d1e2'`. It adds nullable `ocu_skill.display_name` (Text); its downgrade drops the column.
  - **Model.** In `backend/open_webui/models/ocu_skills.py`, add the ORM column `OcuSkill.display_name` (nullable Text), add `display_name: str | None` to `OcuSkillModel` and `OcuSkillReadableModel`, and add the column to the explicit select of `readable_skills`.
  - **Router.** Add the field to the administrator and user item models, so that `GET /admin`, `POST /{name}/access`, `GET /` and `POST /{name}/toggle` carry it. Leave the internal user-config model unchanged.
  - **Existing tests.** Update the shape assertions this breaks:
    - the column set in `backend/open_webui/test/models/test_ocu_skill_tables.py` (`:405-409`). Its module fixture also applies the new migration after `f7a8b9c0d1e2`;
    - the access-response comparison in `backend/open_webui/test/routers/test_ocu_skills.py` (`:248`);
    - the user-item helpers in `test_ocu_skill_user_routes.py`.
  - **Decision record.** Ship `docs/decisions/implemented/architecture/2026-11-11-ocu-skill-display-name.md`, recording design.md Decisions 1-5 and linking the source plan.

  Verify with:
  - router pytest in the new module `backend/open_webui/test/routers/test_ocu_skill_display_name.py`:
    - the four responses carry `display_name: null` for an existing skill;
    - with a value written through the table, `GET /` and the toggle response carry `发票生成` (spec "Display name listed", "Toggle response carries the display name");
    - the internal user-config body has the same keys as before;
  - model pytest: list-all still does not load `data`, and the new migration upgrades and downgrades;
  - `make db-verify`, `make smoke`, `make lint-scoped`, `make coverage-gate` for the changed backend files, `make decisions-verify` and `make doc-gate`.

  Task 1.1 required evidence (issue #788; each item is input → expected output):
  - **Fixture level and risk packs.**
    - Level: expanded, upstream agreed: schema migration plus response models on the Critical Path `routers/ocu_skills.py`.
    - Selected packs:
      - Schema: one nullable column; upgrade is idempotent like `f7a8b9c0d1e2`, and downgrade drops only the column;
      - Public API: four responses gain one field, and the internal contract is unchanged;
      - Legacy compatibility: existing rows read `null`; existing shape tests are updated, never weakened;
      - Documentation: the decision record.
    - Not selected:
      - Auth: no new route, and the existing dependencies are unchanged;
      - File IO, concurrency and resource limits: no new IO paths;
      - Error handling: no new failure path.
    - Governing invariant: every response that names a skill to a WebUI client carries `display_name` (string or `null`), while the internal user-config body keeps exactly `{email, enabled_skills: [{name, description, category, zip_sha256}]}`.
    - Sibling surfaces:
      - the ORM column `OcuSkill.display_name = Column(Text, nullable=True)`; without it `OcuSkillModel.model_validate(row)` in `get_all` and `get_metadata` fails;
      - `OcuSkillModel`, `OcuSkillReadableModel` and the explicit select in `readable_skills`;
      - router models `OcuSkillAdminItem` (used by `GET /admin` and `POST /{name}/access` via `_admin_item`) and `OcuSkillUserItem` (`GET /`, `POST /{name}/toggle` via `_user_item`);
      - `OcuInternalUserConfig` / `OcuInternalSkill`, which stay unchanged;
      - `OcuSkillUploaded`, the upload response, which is out of this task;
      - `upsert` replace columns in `models/ocu_skills.py`, which must not list `display_name`;
      - frontend types, which are out of this task (#790).
  - **Migration `<rev>_add_ocu_skill_display_name.py`.**
    - `revision` is a fresh 12-hex id, and `down_revision = 'f7a8b9c0d1e2'`.
    - Upgrade adds `display_name` `sa.Text()` nullable only when the column is absent (inspect guard, as the parent migration does).
    - Downgrade drops it with `op.batch_alter_table` (SQLite).
    - Model test, red first: on a fresh SQLite file, running `upgrade` of both migrations, then `upgrade` again, leaves `display_name` in the `ocu_skill` columns. `downgrade` of the new one removes it and keeps every other column and row.
    - `make db-verify` passes.
  - **Table test module `backend/open_webui/test/models/test_ocu_skill_tables.py`.**
    - The migration helpers load the new revision file as well. The module fixture runs its guarded upgrade every time, outside the existing "tables missing" guard. The test DB is the persistent `.run/data/webui.db`, which may already hold both tables at `f7a8b9c0d1e2`.
    - Input → output: on a DB already at `f7a8b9c0d1e2` with both tables, running the fixture leaves `display_name` present.
    - `test_registry_schema_matches_the_data_model` adds `display_name` to the column set.
    - The existing test that list-all never loads `data` stays green.
  - **Router tests in the new module `backend/open_webui/test/routers/test_ocu_skill_display_name.py`, red first.**
    - For a seeded skill `a` without a display name, each of these carries `display_name: null`: `GET /admin` items, the `POST /a/access` response, `GET /` items and the `POST /a/toggle` response.
    - After `UPDATE ocu_skill SET display_name='发票生成' WHERE name='a'` through the test DB, all four responses carry `display_name: "发票生成"`: `GET /admin`, `POST /a/access`, `GET /` and the toggle response. `_admin_item` copies fields with `model_dump(include=...)`, so a defaulted field would otherwise pass the null-only checks.
    - `GET /api/internal/user-config/{email}` with the key returns items whose key set is exactly `{name, description, category, zip_sha256}`.
  - **Existing shape assertions updated, not loosened.** Each exact-equality check below adds `'display_name': None`, and nothing else changes:
    - the `POST /{name}/access` comparison and the full `GET /admin` list equality in `test_ocu_skills.py`;
    - the `_user_item` helper in `test_ocu_skill_user_routes.py`;
    - the `readable_skills` `item()` helper in `test_ocu_skill_tables.py`;
    - the `_user_listing` literal in `test_ocu_skill_internal_routes.py`.
  - **Decision record** `docs/decisions/implemented/architecture/2026-11-11-ocu-skill-display-name.md`. It records design Decisions 1-5, links the source plan and this change, and passes `make decisions-verify`.
  - **Commands:**
    - backend pytest for `test_ocu_skill_tables.py`, `test_ocu_skill_display_name.py`, `test_ocu_skills.py`, `test_ocu_skill_user_routes.py` and `test_ocu_skill_internal_routes.py`;
    - `make db-verify`, `make smoke`, `make lint-scoped`, `make coverage-gate`, `make decisions-verify`, `make doc-gate`.

- [x] 1.2 Add the table method that sets `display_name`, and the administrator route `POST /{name}/display-name` with the body model and validation of design.md Decisions 2-3. In `test_ocu_skill_display_name.py`, cover one case per scenario of spec requirement "Administrator display name" in `ocu-uploaded-skills`:
  - trimmed set;
  - 32 characters and `|` accepted;
  - clear with `""`, `"   "` and `null`;
  - 400 for each of: 33 characters, `<`, `>`, a line break, a tab;
  - 422 for `{}`, a number and a boolean;
  - 404 for an unknown name;
  - 401 for a user-role caller and for no session, with the stored value unchanged;
  - 404 with the workspace disabled, through `backend/open_webui/test/ocu_office_flag_process.py`;
  - a replace upload keeps the name;
  - delete, then re-upload of the same name, shows `null`.

  Add a `smoke/ocu-skills.hurl` case that sets and clears a display name. Verify with `make smoke`, `make lint-scoped` and `make coverage-gate`.

  **Task 1.2 required evidence** (authoritative where it is more specific than the bullets above):
  - Fixture level expanded (admin write route on the Critical Path `routers/ocu_skills.py`). Risk packs selected: Auth (the 401/404 matrix below); Public API (new route, response is the admin item); Error handling (400/422/404 ordering); Security / input validation (`<`, `>`, Cc rejected, `|` allowed); Legacy compatibility (existing exact-equality tests and the internal user-config unchanged); Documentation (verification-matrix row). Not selected: Schema (no migration), File IO / resource limits (short JSON string), Concurrency (one UPDATE), Audit/log (the router has none and none is added).
  - Setter: `OcuSkills.set_display_name(name, value: str | None) -> OcuSkillModel | None` runs one `UPDATE ocu_skill SET display_name` and returns `None` when no row matches; the route maps `None` to `_skill_not_found()`. It writes only `display_name`: `description`, `zip_sha256`, `size`, `created_by`, `created_at`, `updated_at`, grants and disables stay equal (assert the response's `updated_at` equals the seeded value). It never selects `data` (assert with `_SelectRecorder().assert_no_skill_data_select()` around a successful POST, as `test_access_update_does_not_select_skill_data` does).
  - Order of checks: `get_admin_user` (401), then body validation (422), then trim and rule (400), then the setter (404). So a user-role caller with `{}` gets 401; an unknown name with `{}` gets 422; an unknown name with `"<x>"` gets 400; an unknown name with `"发票生成"` gets 404 and no row is created.
  - Exact 400 details, asserted by equality, each input breaking one rule: `display name must be at most 32 characters`; `display name must not contain < or >`; `display name must not contain control characters`. They match the router's existing English details; #790 shows them as given.
  - "Unchanged" starts non-null: every 400, 422 and 401 case first seeds `a` with `发票生成` through `_store_display_name`, then re-reads `GET /admin` as admin and asserts `display_name == "发票生成"`.
  - Trim: bare `str.strip()` before every rule. `{"display_name": "\u3000 发票生成\t\n"}` → 200, `"发票生成"`; `" 发票生成"` → 200, `"发票生成"`.
  - Length: `len()` (code points) of the trimmed value, tested with CJK so byte counting fails. `"发"*32` → 200 stored as given; `"  " + "发"*32 + "  "` → 200 storing `"发"*32`; `"发"*33` → 400 with the length detail.
  - Allowed: `"发票|生成"` → 200 stored as given; `"发票生成"` on both `a` and `b` → 200 each (names are not unique).
  - Rule violations sit inside the string (strip removes edge `\n`/`\t`), each → 400 with its detail and `发票生成` unchanged: `"发<票"`, `"发>票"` (angle-bracket detail); `"发\n票"`, `"发\t票"`, `"发\x00票"` (control detail). The `\x00` case proves the rule is Unicode category `Cc`, not a `\n`/`\t` blacklist. Cf characters (U+200B, U+200D) inside a name pass, as Decision 3 then designed (task 1.3 rejects them).
  - Clear: `""`, `"   "`, `"\t"` and `null`, each from seeded `发票生成` → 200 with `display_name is None`, and `GET /admin` shows `None` (stored NULL, not `''`).
  - Malformed body: `{}`, `{"display_name": 123}`, `{"display_name": true}` and a JSON array `[]` → 422 each, `发票生成` unchanged; the 422 body is not asserted.
  - Response: a successful POST's JSON equals exactly the `GET /admin` item for `a`, including `access_grants == [EVERYONE_READ]` (the seeded group write grant filtered out).
  - Auth: the `member` session and no session, each with `{"display_name": "新名"}` and with `{}` → 401, and `a` keeps `发票生成` (tested in the new module, because `ADMIN_WRITES` / `_registry_state` cannot see `display_name`).
  - Mount gate: add `'POST /a/display-name'` to `ADMIN_ROUTES` in `test_ocu_skills.py` (404 with the workspace off, 401 for a user with it on), and `'POST /a/display-name': 422` to the `workspace-on-positive-control` row (fresh DB, no body: 422 proves the route is mounted and the off-404 comes from the gate).
  - Replace: with the `registry` fixture, upload `_skill_zip_for(INVOICE)`, set `发票生成` through the route, upload `_skill_zip_for(INVOICE, description=DESCRIPTION_B)` through the upload route; `GET /admin` shows `display_name == "发票生成"` with a changed `zip_sha256` and description.
  - Delete: after setting through the route, `DELETE /invoice-builder` (expect `true`), re-upload the same name; `GET /admin` shows `display_name is None`.
  - Hurl, between the existing upload and `DELETE`: `POST .../harness-smoke-skill/display-name` `{"display_name": " 冒烟技能 "}` → 200 with `$.name == "harness-smoke-skill"`, `$.display_name == "冒烟技能"`, `$.access_grants count == 1`; `GET /admin` asserts the filtered `display_name == "冒烟技能"`; `POST` `{"display_name": null}` → 200 with `$.display_name == null` asserted on the POST response. No `display_name` assertion before the set step (a rerun after an interrupted run replaces the skill, which keeps the name). Only this file uses `harness-smoke-skill`, and the existing delete removes the row.
  - Docs: update the "Uploaded-skill upload/delete round trip" row in `docs/agents/verification-matrix.md` with the set/clear step and its asserts; run `make doc-gate`. The decision record already covers Decisions 2-3 and is not touched.
  - Must preserve: the existing exact-equality tests in `test_ocu_skills.py`, `test_ocu_skill_user_routes.py`, `test_ocu_skill_internal_routes.py` and `test_ocu_skill_tables.py` pass unmodified apart from the two mount-gate entries; the `upsert` `replace` tuple does not list `display_name`; `OcuSkillUploaded` is unchanged.
  - Commands: backend pytest for `test_ocu_skill_display_name.py` and `test_ocu_skills.py` (plus the other three skill modules); `make smoke`; `make lint-scoped`; `make coverage-gate` (`routers/ocu_skills.py`, `models/ocu_skills.py`); `make doc-gate`. Each new test is red against the unchanged source, except those that only pin unchanged behavior, which the PR names.

- [x] 1.3 Tighten the display-name rule (issue #804, owner chose option A on 2026-11-12). In `_checked_display_name` (`backend/open_webui/routers/ocu_skills.py`), add design.md Decision 3 rules 4-6 after the existing three, and cover them in `test_ocu_skill_display_name.py`. Update the Rule bullet of the decision record `docs/decisions/implemented/architecture/2026-11-11-ocu-skill-display-name.md` in place, naming #804. Verify with the router pytest, `make smoke`, `make lint-scoped`, `make coverage-gate` and `make decisions-verify`.

  **Task 1.3 required evidence** (input → expected output):
  - Fixture level compact (one validation function on the Critical Path `routers/ocu_skills.py`). Risk packs selected: Security / input validation (Cs, Cf, no visible character); Error handling (the lone-surrogate 500 becomes 400); Legacy compatibility (the rule stays write-only; a name stored before this change is listed as is); Documentation (decision record Rule bullet). Not selected: Auth, Schema, Public API shape, File IO, Concurrency.
  - Exact 400 details, asserted by equality, in addition to the three of task 1.2: `display name must not contain surrogate characters`; `display name must not contain invisible format characters`; `display name must contain a visible character`.
  - Rule order is Decision 3 order, after `str.strip()`: length, angle brackets, `Cc`, `Cs`, `Cf`, visible character. Each case below breaks exactly one rule unless it names the order it proves.
  - Surrogate, each → 400 with the surrogate detail and the seeded `发票生成` unchanged: `"发\ud800票"` (inside) and `"\udc00发"` (leading). Send `content=json.dumps(body).encode('ascii')` with `Content-Type: application/json` and the admin session headers; `json.dumps` with the default `ensure_ascii` writes the `\ud800` escape that httpx's `json=` cannot encode. Red first: against the unchanged source the shared client raises `UnicodeEncodeError` from the database write (the default `TestClient` re-raises; production returns 500). That is the red state, and no second client is added.
  - Format characters, each → 400 with the format detail and `发票生成` unchanged: `"发\u202e票"` (RLO), `"发\u2066票"` (LRI), `"发\u200b票"` (zero-width space), `"发\u200d票"` (zero-width joiner), `"\ufeff发票"` and `"发票\u200b"` (edge characters `str.strip()` keeps), and `"\u200b"` alone (the #804 item 3 input; it also lacks a visible character, so it proves Cf before the visible rule). The two existing accepted cases `zwsp` and `zwj` move here; no other accepted case changes.
  - No visible character, each → 400 with the visible detail: `"\u0301"` and `"\u0301\u0302"` (combining marks only).
  - Order: `"<\u200b"` → angle detail; `"发\n\u200b票"` → control detail; `"\u200b\u0301"` → format detail; `"发" * 32 + "\u200b"` → length detail. Surrogate order, sent as raw bodies like the surrogate cases: `"发\n\ud800"` → control detail (Cc before Cs); `"\ud800\u200b"` → surrogate detail (Cs before Cf); `"\ud800"` alone → surrogate detail (Cs before the visible rule).
  - Still accepted and stored as given: `"发票 生成"` (inner space), `"e\u0301"` (letter plus combining mark), `"📄发票"` (symbol), `"发票|生成"` and `"发" * 32`.
  - Must preserve: every other case in `test_ocu_skill_display_name.py` and the 401 → 422 → 400 → 404 order of task 1.2 pass unchanged; `GET /admin` and `GET /` return a stored name without re-checking it (assert one row written through `_store_display_name` with `"发\u200b票"` is listed as is); `smoke/ocu-skills.hurl` is unchanged and passes.
  - Docs:
    - Decision record: rewrite the Rule bullet as the six rules of Decision 3, naming #804. Add the Alternatives bullet "**Keep the rule and isolate bidi on render (`<bdi>` / `unicode-bidi: isolate`)** — every consumer in #790–#794 would have to remember it, and it leaves zero-width-only names; rejecting all `Cf` on write closes both (#804)." Add `DankerMu/open-webui#804` to `references:`.
    - Source plan `docs/plans/2026-11-11-knowledge-copy-and-skill-display-names.md`: append row 19 to the decision table: 「显示名规则收紧（#804，2026-11-12）| 另拒 surrogate、`Cf` 格式字符（含 bidi 控制与零宽字符），且须含至少一个可见字符」.
  - Pin-only cases: the still-accepted names and the listed-as-is row pass against the unchanged source; the PR names them.
  - Commands: backend pytest for `test_ocu_skill_display_name.py` and `test_ocu_skills.py`; `make smoke`; `make lint-scoped`; `make coverage-gate` (`routers/ocu_skills.py`); `make decisions-verify`; `make doc-gate`.

Suggested fixture level: expanded - schema migration plus a new administrator route on a Critical Path (`routers/ocu_skills.py`).
Minimal mergeable slice: task 1.1 - the column and the listing field are green alone (every value is `null`), and the slice carries the decision record. Task 1.2 depends on 1.1. Task 1.3 depends on 1.2 and must merge before 2.1.

## 2. Administrator tab editing

- [x] 2.1 Add the client function and the per-row editor.
  - **Client.** In `src/lib/apis/ocu/skills.ts`, add `display_name` to the types and add `updateSkillDisplayName(token, name, displayName)`, with cases in `skills.test.ts`.
  - **Tab.** In `src/lib/components/admin/Settings/OcuSkills.svelte`, add the per-row field and save action of design.md Decision 8, with cases in the existing `OcuSkills.test.ts`: save updates the row from the response; a rejection shows the server's reason and keeps the typed text.
  - **i18n.** Run `npm run i18n:parse` and add the zh-CN strings.
  - **Browser spec.** Create `e2e/ocu-skill-display-name.e2e.ts`. Add its bare filename to `REQUIRED_SPECS` in `scripts/verify-ui-ocu.py`, and add the matching assertion to `scripts/test_verify_ui_ocu_repeat.py`. Its first case: save `发票生成`, reload, and see it; save a 33-character name, and see the reason and the kept text. Take a screenshot; expect zero console errors.

  Verify with `make test-frontend`, `make typecheck`, `make lint-scoped`, `make test-verify-ui-ocu-repeat` and `make verify-ui-ocu`.

  **Task 2.1 required evidence** (issue #790; input → expected output):
  - Fixture level compact. Risk packs selected: Public API client (new function, types); UI state (draft per row, kept on rejection); Error handling (server reason shown as given); Test harness (new required browser spec, shared e2e helpers). Not selected: Auth, Schema, Backend (route proven by task 1.2/1.3), Security (every display-name sink is a Svelte text binding, design.md Decision 3; the input's `value` binding is one).
  - **Types** (`src/lib/apis/ocu/skills.ts`): `OcuAdminSkill` gains `display_name: string | null`; `OcuUserSkill` picks it too (`Pick<OcuAdminSkill, 'name' | 'description' | 'display_name'>`), because `GET /` and the toggle response carry it (task 1.1). `OcuUploadedSkill` is unchanged.
  - **Client** `updateSkillDisplayName(token, name, displayName: string | null): Promise<OcuAdminSkill>` goes through the existing `requestSkills`: `POST ${WEBUI_API_BASE_URL}/ocu/skills/${encodeURIComponent(name)}/display-name`, `Content-Type: application/json`, body exactly `JSON.stringify({ display_name: displayName })`. Cases in `skills.test.ts`, red first: URL, method, headers and body for `('t', 'invoice-builder', '发票生成')`; a name needing encoding is encoded; `null` is sent as `{"display_name":null}`; a 400 with `{"detail": "display name must be at most 32 characters"}` rejects with exactly that message; a 422 list detail rejects with `HTTP 422`.
  - **Row editor** in `OcuSkills.svelte` (design.md Decision 8):
    - Each row has `<input data-cy="ocu-skills-display-name-input-{name}">` with `aria-label` `$i18n.t('Display name')` and `placeholder` the skill's `name`, and a button `data-cy="ocu-skills-display-name-save-{name}"` labelled `$i18n.t('Save')` (existing key). The input has no `maxlength`; length is the server's rule.
    - Drafts live in one `Record<string, string>` keyed by name. `loadSkills` sets every draft from the server (`display_name ?? ''`); nothing else resets them. A successful upload and the access-failure reload both call `loadSkills` and so discard unsaved drafts in every row; accepted, since the requirement only protects the rejected row's text.
    - Save sends the draft as typed (the server trims; `''` clears). On success the row is replaced by the response and its draft becomes `response.display_name ?? ''`, so `'  发票生成 '` shows `发票生成` after saving. On failure: `toast.error(reason(error))` with the server's string as given, the draft and the row stay as they were, and no reload happens.
    - The access, delete and upload behaviour is unchanged.
  - **Component cases** in the existing `OcuSkills.test.ts`, red first:
    - a row with `display_name: '发票生成'` renders the input with that value; a row with `null` renders `''` with placeholder `invoice-builder`;
    - typing `'  发票生成 '` and saving calls `updateSkillDisplayName(token, 'invoice-builder', '  发票生成 ')` once; with the mocked response `display_name: '发票生成'` the input shows `发票生成`;
    - a rejected save with `Error('display name must be at most 32 characters')` calls `toast.error` with that exact string, keeps the typed 33 characters in the input, and `getAdminSkills` is not called again;
    - clearing the field and saving sends `''`.
  - **i18n**: run `npm run i18n:parse`; zh-CN `"Display name": "显示名"`. No other catalog is hand-edited.
  - **Browser spec** `e2e/ocu-skill-display-name.e2e.ts`, first case (admin edit):
    - Open in Chinese (`openInChinese`; `admin(page)` reads the token from `localStorage`, so sign-in comes first), then set up through the API: delete `invoice-builder` quietly (200 or 404), upload `smoke/fixtures/ocu-invoice-builder.zip`.
    - Open the admin tab by deep link `/?settings=admin%3Aocu-skills`, type `发票生成` into the row's field, click save, and wait for the `POST …/invoice-builder/display-name` response (200).
    - Reload, reopen the deep link: the field's value is `发票生成`. Screenshot `.run/ui-evidence/ocu-skill-display-name-admin.png`.
    - Fill `"发" * 33`, save: the 400 response arrives, the toast `page.locator('[data-sonner-toast]').filter({ hasText: 'display name must be at most 32 characters' })` is visible, the field still holds the 33 characters, and `GET /api/v1/ocu/skills/admin` (API) still shows `display_name: "发票生成"` for the skill.
    - Console: page errors none; console errors none except exactly one `Failed to load resource … 400` whose URL path is `/api/v1/ocu/skills/invoice-builder/display-name`. This is the only exception to "zero console errors" in task 2.1 and #790, as in the upload case of `ocu-skills.e2e.ts`.
    - Teardown in `finally`: delete `invoice-builder` quietly.
  - **Shared e2e helpers, no copies** (`make anti-drift` scopes jscpd to fork files): move what both specs need from `e2e/ocu-skills.e2e.ts` into a new module `e2e/ocu-skill-fixtures.ts` (the pattern of `ocu-office-fixtures.ts`), at least the invoice fixture path and name, the skill route paths, the admin deep link, `byCy`, `openInChinese`, `removeQuietly`, `uploadRaw`, and `collectErrors` with the expected-rejection path as a parameter. `ocu-skills.e2e.ts` imports them and keeps every case and assertion unchanged (its rejection path stays `/api/v1/ocu/skills/upload`).
  - **Harness registration**: add `'ocu-skill-display-name.e2e.ts'` to `REQUIRED_SPECS` in `scripts/verify-ui-ocu.py`, add `skill-display-name` to the default `testMatch` glob in `playwright.ocu.config.ts` (`ocu-{…,image-placeholder,skills,skill-display-name}.e2e.ts`; without it `verify_test_discovery` fails the default run while the `OCU_UI_SPEC` repeat path still passes), and a test in `scripts/test_verify_ui_ocu_repeat.py` mirroring `test_skills_spec_is_required_and_repeatable` (`in REQUIRED_SPECS`; `selection('ocu-skill-display-name.e2e.ts', '2')` returns `('ocu-skill-display-name.e2e.ts', 2, None)`).
  - Must preserve: every existing case of `OcuSkills.test.ts`, `skills.test.ts` and `ocu-skills.e2e.ts` keeps its name and assertions. Allowed edits: imports; `display_name: null` added to the typed fixtures (`skills.test.ts` `userListing`, `OcuSkills.test.ts` `skill()` with an optional `display_name` parameter, `OcuSkillPreferences.test.ts` `skill()`, `SlashCommands.test.ts` `invoice`/`disabled`); `updateSkillDisplayName: vi.fn()` in the `OcuSkills.test.ts` mock factory; the new function joining the `routes` table in `skills.test.ts`; `collectErrors(page, UPLOAD_PATH)` at its call sites in `ocu-skills.e2e.ts`. `make typecheck` reports no new error in these files. `OcuSkillPreferences.svelte` and `SlashCommands.svelte` are not changed (tasks 3.1, 4.1).
  - Diff: the CI layer6 count (`+`/`-` lines excluding lockfiles, snapshots and `src/lib/i18n/`) is expected to exceed 400 because the helper move counts twice; if it does, the PR carries the `diff-limit-exempt` label and its body justifies it (the move is required by anti-drift).
  - Commands: `make test-frontend`, `make typecheck`, `make lint-scoped`, `make anti-drift`, `make test-verify-ui-ocu-repeat`, `make verify-ui-ocu` (the default run lists the new spec's test; screenshot + console check), and `make verify-ui-ocu-repeat SPEC=ocu-skill-display-name.e2e.ts REPEAT=3` for stability.

Suggested fixture level: compact - one component and one client function over a route already proven by task 1.2.
Minimal mergeable slice: atomic - the client function's only caller is this tab, and the e2e spec is created with its first case. Depends on 1.3.

## 3. Personal tab

- [x] 3.1 In `src/lib/components/chat/Settings/OcuSkillPreferences.svelte`, show the shown name first and the English name as secondary text (spec requirement "Display name in the personal tab"), with cases in the existing `OcuSkillPreferences.test.ts` for both scenarios. Add a Playwright case to `e2e/ocu-skill-display-name.e2e.ts`: a skill whose display name was set through the API shows both names. Take a screenshot; expect zero console errors. Verify with `make test-frontend`, `make typecheck`, `make lint-scoped` and `make verify-ui-ocu`.

  **Task 3.1 required evidence** (issue #791; input → expected output):
  - Fixture level compact. Risk packs selected: UI rendering (label and secondary text); Accessibility (the switch keeps its accessible name); Security (the display name is a Svelte text binding only, design.md Decision 3 last bullet). Not selected: Public API (types already carry `display_name` since task 2.1), Auth, Schema, Backend, State (no new state).
  - **Label** in `OcuSkillPreferences.svelte`, through `UserSettingRow`'s existing `label` slot (`UserSettingRow.svelte` is not changed):
    - Both spans sit in one `<div slot="label">`. `<span data-cy="ocu-skills-pref-name-{name}">` holds the shown name: `display_name ?? name`.
    - Only when `display_name` is non-null, a following `<span data-cy="ocu-skills-pref-slug-{name}">` holds `name`, styled as secondary text (a lighter gray than the label, as `UserSettingRow`'s description uses).
    - The description line, the switch, its `fieldset` and the switch's `ariaLabel={skill.name}` are unchanged, and row order stays the server's order.
  - **Component cases** in the existing `OcuSkillPreferences.test.ts`, red first:
    - `invoice-builder` with `display_name: '发票生成'`: `ocu-skills-pref-name-invoice-builder` text is exactly `发票生成`, `ocu-skills-pref-slug-invoice-builder` text is exactly `invoice-builder`;
    - `pdf-tools` with `display_name: null`: the name span text is exactly `pdf-tools`, `ocu-skills-pref-slug-pdf-tools` does not exist, and the trimmed text of the name span's parent element (the label container, which excludes the description) is exactly `pdf-tools`;
    - the switch of the display-named row is still found by `aria-label="invoice-builder"` (the existing `switchFor` helper).
  - **Browser case** added to `e2e/ocu-skill-display-name.e2e.ts`, a separate `test(...)` (own setup and teardown):
    - `collectErrors(page, DISPLAY_NAME_PATH)` is registered before `openInChinese`; `checkErrors(0)` runs after `finally`.
    - `openInChinese`, then through the API: delete `invoice-builder` quietly, upload the invoice fixture (first upload grants every user read, so the admin's personal tab lists it), `post(api, DISPLAY_NAME_PATH, { display_name: '发票生成' })` (asserts 200).
    - `page.goto(PERSONAL_DEEP_LINK)`: `ocu-skills-pref-name-invoice-builder` has text `发票生成` and `ocu-skills-pref-slug-invoice-builder` has text `invoice-builder`. Screenshot `.run/ui-evidence/ocu-skill-display-name-personal.png` with `animations: 'disabled'`.
    - Console: no console or page errors.
    - Teardown in `finally`: delete `invoice-builder` quietly.
    - Move `PERSONAL_DEEP_LINK = '/?settings=ocu_skills'` from `ocu-skills.e2e.ts` to `e2e/ocu-skill-fixtures.ts` next to `DEEP_LINK`, and import it in both specs; in `ocu-skills.e2e.ts` only the const line and the import list change.
  - Must preserve: every existing case in `OcuSkillPreferences.test.ts`, `ocu-skills.e2e.ts` and the admin case of `ocu-skill-display-name.e2e.ts` passes unmodified (allowed: a new optional `display_name` parameter on the test's `skill()` helper, and the `PERSONAL_DEEP_LINK` import in `ocu-skills.e2e.ts`).
  - Commands: `make test-frontend`, `make typecheck` (no new errors), `make lint-scoped`, `make anti-drift`, `make verify-ui-ocu` (screenshot; console as above), `make verify-ui-ocu-repeat SPEC=ocu-skill-display-name.e2e.ts REPEAT=3`.

Suggested fixture level: compact - a display-only change in one fork component.
Minimal mergeable slice: atomic - one component's label. Depends on 2.1 (the API type and the e2e spec).

## 4. Slash menu and sent bubble

- [x] 4.1 Change the menu, the inserted mention and the bubble.
  - **Menu.** In `Commands/SlashCommands.svelte`, render the shown name with the English name as secondary text, match the query on both names, and sort by the shown name.
  - **Mention.** In `CommandSuggestionList.svelte` `selectOcuSkill`, insert `ocu--{name}|{shown name}` with label `{shown name}` (design.md Decision 7).
  - **Bubble.** Apply the one-line `MentionToken.svelte` fix of Decision 10.

  All three are minimal upstream diffs.

  Verify with:
  - `SlashCommands.test.ts` cases: a display-name entry is matched by `发票` and by `invoice`; the inserted mention id is `ocu--invoice-builder|发票生成`; an entry without a display name still inserts `ocu--invoice-builder|invoice-builder`; entries sort by the shown name;
  - a Vitest case rendering `MentionToken` for `<$ocu--invoice-builder|发票生成>` (shows `$发票生成`), for a native skill mention with a label (shows the label) and for `<$invoice-builder>` (shows `$invoice-builder`);
  - extend the decision record of task 1.1 with design.md Decisions 7 and 10 (the upstream `MentionToken.svelte` change);
  - a Playwright case in `e2e/ocu-skill-display-name.e2e.ts`: the chip reads `发票生成`, the outgoing request body contains `<$ocu--invoice-builder|发票生成>`, and the sent bubble shows `$发票生成`;
  - `make test-frontend`, `make typecheck`, `make lint-scoped` and `make verify-ui-ocu`.

  **Task 4.1 required evidence** (issue #792; input → expected output):
  - Fixture level expanded. Risk packs selected:
    - Upstream spine, minimal diff: three upstream files (`SlashCommands.svelte`, `CommandSuggestionList.svelte`, `MentionToken.svelte`); each change is limited to the lines named below, with no reformatting.
    - Public contract: the marker `<$ocu--{name}|{label}>` consumed by the OCU filter (`openspec/specs/ocu-skill-mention/spec.md`). The id part keeps `ocu--{name}`; only the label changes. A display name may contain `|`; the tokenizer (`mention-extension.ts`, id class `[\w.\-:/]+`, label `[^>]*`) and the filter both take everything after the first `|` as the label, and the rule forbids `<` and `>`.
    - Legacy compatibility: a skill without a display name still inserts and sends `<$ocu--{name}|{name}>` (the existing `ocu-skills.e2e.ts` marker case keeps its name and assertions); stored chats keep their text. Native skill bubbles change from `$<id>` to `$<label>`, which Decision 10 intends.
    - Security: every new sink is a Svelte text binding (`{...}`), never `{@html}`; `MentionToken` already renders `{triggerChar}{label}` as text.
    - Test harness: one new browser case, a stub-provider helper shared with `ocu-skills.e2e.ts`.
    - Not selected: Auth, Schema, Backend, OCU repo (no filter change), the Decision 5 store (task 5.1 adds it and makes the menu write into it).
  - **Menu** (`SlashCommands.svelte`, the `ocuSkills` reactive statement and the OCU group markup only):
    - shown name = `display_name ?? name`, inline or through one small `shown` function in the script;
    - filter: `enabled` and (the lower-cased `name` or the lower-cased `display_name` includes the lower-cased query);
    - sort: `shown(a).localeCompare(shown(b))`;
    - each button keeps `data-cy="ocu-skills-slash-{name}"`; its first text span shows the shown name; only when a display name is set, a second span with `data-cy="ocu-slash-skill-slug-{name}"` shows `name` as lighter secondary text. No new `data-cy` may start with `ocu-skills-slash-`, because `ocu-skills.e2e.ts` counts `[data-cy^="ocu-skills-slash-"]` rows.
  - **Selection** (`CommandSuggestionList.svelte` `selectOcuSkill`, one function): `data` is typed `{ name: string; display_name: string | null }`; shown = `data.display_name ?? data.name`; ``command({ id: `ocu--${data.name}|${shown}`, label: shown, mentionSuggestionChar: '/' })``.
  - **Bubble** (`MentionToken.svelte`, the `$` branch's else arm only): `label = (token as import('marked').Tokens.Generic).label;` replaces `label = _id;` (the tokenizer always sets `label`, falling back to the id; `?? _id` would break the `make lint-scoped` complexity limit and `?.` on `Token` the typecheck ceiling). The `|` arm and every other branch stay as they are.
  - **Slash-menu cases** in the existing `SlashCommands.test.ts`, red first (fixtures `invoice-builder` with `display_name: '发票生成'`, `pdf-tools` with `null`):
    - query `发票` lists `ocu-skills-slash-invoice-builder` and not `pdf-tools`; query `invoice` and query `INVOICE` list it; query `pdf` lists `pdf-tools` only;
    - in the `invoice-builder` button, the first `span` has text `发票生成`, `ocu-slash-skill-slug-invoice-builder` has text `invoice-builder`, and the first span precedes the slug span in document order; `ocu-slash-skill-slug-pdf-tools` does not exist;
    - sort by shown name: `zeta-tool` with display name `Alpha 工具` and `beta-tool` without one list in the order `zeta-tool`, `beta-tool` (the English names alone would give the opposite);
    - selecting `invoice-builder` (click, and Enter on the selected row) calls `onSelect` with the skill, and `CommandSuggestionList`'s handler calls `command` with `{ id: 'ocu--invoice-builder|发票生成', label: '发票生成', mentionSuggestionChar: '/' }`; selecting `pdf-tools` calls it with `{ id: 'ocu--pdf-tools|pdf-tools', label: 'pdf-tools', mentionSuggestionChar: '/' }`. These cases use the existing `renderList` (`SlashCommands.test.ts`), which mounts `CommandSuggestionList`. For the Enter path, the case mocks `getSkillItems` to resolve `{ items: [], total: 0 }`, types `发票`, asserts `ocu-skills-slash-invoice-builder` has `data-selected="true"`, then calls `component.select()` (SlashCommands) or `_onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }))` (CommandSuggestionList).
  - **`MentionToken` cases** in a new `MentionToken.test.ts` beside the component, red first for the first two: a token from the `$` tokenizer for `<$ocu--invoice-builder|发票生成>` renders `$发票生成`; `<$harness-native-skill|Harness native skill>` renders `$Harness native skill`; `<$invoice-builder>` renders `$invoice-builder` (pin-only). Tokens come from `mentionExtension({ triggerChar: '$' }).tokenizer(...)`, not hand-built, so the test pins the tokenizer's id/label split. The test mocks `$app/navigation` (`vi.mock('$app/navigation', () => ({ goto: vi.fn() }))`, as `UserMenu.test.ts` does) and passes the `i18n` context; if bits-ui `LinkPreview` cannot mount in jsdom, the PR reports it instead of stubbing the component under test.
  - **Browser case** added to `e2e/ocu-skill-display-name.e2e.ts`, a separate `test(...)` with `test.setTimeout(120_000)`:
    - `collectErrors(page, DISPLAY_NAME_PATH)` before sign-in; `openInChinese`; through the API: delete `invoice-builder` quietly, upload it, `post(api, DISPLAY_NAME_PATH, { display_name: '发票生成' })`, enable the stub provider (the shared helper below, keeping the previous OpenAI config).
    - Open `/?models=ocu-stub-model` in Chinese, focus `#chat-input`, type `/发票`: `ocu-skills-slash-invoice-builder` is visible and selected, its text contains `发票生成` and `invoice-builder`. Press Enter.
    - The chip `#chat-input [data-type="mention"]` has text `$发票生成`.
    - Type ` 做发票`, click send, wait for `POST /api/chat/completions`: `user_message.content` contains `<$ocu--invoice-builder|发票生成>`; the chat id is kept for teardown.
    - Wait for the reply: `#messages-container` shows `STUB_REPLY` (as the existing slash cases do), before the bubble assertions, the screenshot and teardown.
    - The sent bubble: `#messages-container .mention` with text `$发票生成` is visible, and no element in `#messages-container` has text `$ocu--invoice-builder`. Screenshot `.run/ui-evidence/ocu-skill-display-name-slash.png` (`animations: 'disabled'`).
    - Teardown in `finally` with `Promise.allSettled`, as the existing slash case: delete the chat, delete `invoice-builder`, restore the OpenAI config; a rejected restore fails the test after the case. Then `checkErrors(0)`.
  - **Shared stub-provider helper**: move `STUB_MODEL`, `STUB_REPLY` and the stub-provider set-up of the two slash cases in `ocu-skills.e2e.ts` into `e2e/ocu-skill-fixtures.ts` as `enableStubProvider(api: Admin): Promise<unknown>` (GET `/openai/config` asserting 200, POST the stub config, return the previous config). Each existing case calls `const openai = await enableStubProvider(api);` before `try`, replacing its GET lines; its POST lines inside `try` are deleted, so the stub config is posted before the skill set-up. This reorder is the only allowed order change; assertions and teardown are unchanged. The new case calls it the same way, before `try`. `make anti-drift` passes (jscpd aggregate 3%); only the stub-provider set-up is shared, the completion capture and teardown follow the existing slash case.
  - **Decision record**: extend `docs/decisions/implemented/architecture/2026-11-11-ocu-skill-display-name.md` with design.md Decisions 7 and 10 (menu matching and sort, the inserted `ocu--{name}|{shown name}` mention, the one-line upstream `MentionToken.svelte` change and its native-skill effect), and add the Alternative "change what `RichTextInput` serializes" — rejected: upstream input code, and the marker is a contract with the OCU filter. Add `DankerMu/open-webui#792` to `references:`.
  - Must preserve: every existing case of `SlashCommands.test.ts` and `ocu-skills.e2e.ts` keeps its name and assertions (allowed: the stub-helper call replacing the set-up lines, imports, and fixture objects gaining `display_name`); the earlier `ocu-skill-display-name.e2e.ts` cases are unchanged; `RichTextInput.svelte` and `mention-extension.ts` are not changed.
  - Commands: `make test-frontend`, `make typecheck` (no new errors), `make lint-scoped`, `make anti-drift`, `make decisions-verify`, `make doc-gate`, `make verify-ui-ocu` (default run; screenshot; console as above), `make verify-ui-ocu-repeat SPEC=ocu-skill-display-name.e2e.ts REPEAT=3`.

Suggested fixture level: expanded - it touches the shared chat-input entrypoint (upstream command menu) and the upstream message renderer.
Minimal mergeable slice: atomic - the menu's label, the inserted mention and the bubble must agree; shipping one without the others shows the user two names for one choice. Depends on 2.1.

## 5. Tool-call row and group summary

- [x] 5.1 Add the helper module and the two row branches.
  - **Helper.** Add `src/lib/components/chat/ocu-skill-call.ts` and its paired `ocu-skill-call.test.ts`, implementing design.md Decision 5: the matcher, and the store with its load-once fallback. Make the slash menu write into the store.
  - **Branches.** Add the minimal branches of Decision 6 to `src/lib/components/common/ToolCallDisplay.svelte` and of Decision 9 to `src/lib/components/chat/Messages/Markdown/ConsecutiveDetailsGroup.svelte`.
  - **i18n.** Run `npm run i18n:parse` and add the zh-CN strings `使用技能：{{NAME}}`, `正在读取技能：{{NAME}}…` and `读取技能失败：{{NAME}}`.

  Verify with Vitest:
  - matcher, raw JSON and entity-encoded arguments: an exact `/mnt/skills/user/invoice-builder/SKILL.md` matches;
  - matcher, these do not match: `/mnt/skills/public/docx/SKILL.md`, `/mnt/skills/user/invoice-builder/scripts/run.py`, `/mnt/skills/user/../SKILL.md`, a non-`view` tool, malformed arguments;
  - store: one load per page; a slash-menu load refreshes it; no request when the workspace feature is off; a disabled skill keeps its display name; a failed load falls back to the English name;
  - `ToolCallDisplay` rendered per state (preparing, executing, done, failed status, error result, rejected, awaiting approval, awaiting input), asserting the label table of the spec, the short label, and an unchanged built-in row;
  - group summary: the summary for a matching `view` call followed by `bash_tool`, and two matching calls on one skill counted as upstream counts equal names.

  Add a Playwright case to `e2e/ocu-skill-display-name.e2e.ts`. Seed a chat through `POST /api/v1/chats/new` with `message.output` items: a done `view` call on the uploaded skill's `SKILL.md` directly followed by a `bash_tool` call. Assert, without expanding, that the collapsed summary shows 「使用技能：发票生成」. Then expand and assert that the row reads 「使用技能：发票生成」. A separate message with a done `docx` `SKILL.md` call shows the upstream label. Take a screenshot; expect zero console errors.

  Extend the decision record of task 1.1 with design.md Decisions 6 and 9 (the upstream `ToolCallDisplay.svelte` and `ConsecutiveDetailsGroup.svelte` branches). Also run `make test-frontend`, `make typecheck`, `make lint-scoped`, `make decisions-verify` and `make verify-ui-ocu`.

  **Task 5.1 required evidence** (issue #793; input → expected output):
  - Fixture level expanded. Risk packs selected:
    - **Upstream spine, minimal diff.** Three upstream files are touched: `ToolCallDisplay.svelte`, `ConsecutiveDetailsGroup.svelte` and `SlashCommands.svelte`.
      - Every branch only calls into `ocu-skill-call.ts`. The `$i18n.t` calls stay in the `.svelte` templates, because `i18next-parser` does not scan the helper.
      - No reformatting, and no upstream line is rewritten except the ones the branch needs.
      - The fixture pins behaviour, not literal lines. `make typecheck` sits at its ceiling (7769) and `make lint-scoped` ratchets per-file complexity, so the implementer chooses the line shape that keeps both green and reports it.
    - **Public contract.** The matcher reads the OCU wrapper's `view` tool (`open-computer-use/openwebui/tools/computer_use_tools.py:975`, arguments `description`, `path` and others) and the mount path `/mnt/skills/user/{name}/SKILL.md` (`computer-use-server/skill_manager.py:73`). Extra argument keys are allowed; only `path` is read.
    - **Legacy compatibility.** Every non-matching row and summary renders exactly as upstream: other tools, `/mnt/skills/public/...`, other paths, and `delegate_task`'s token rename. Both the structured `message.output` path and the legacy `<details type="tool_calls">` content path reach the same two components.
    - **Security.** Every new sink is a Svelte text binding. The display name reaches the DOM only through `{$i18n.t(...)}` or `{...}`, never `{@html}`. i18next has `escapeValue: false`, so the name is not double-escaped.
    - **Async state.** The store fills after first render, so a row or summary rendered before the list resolves must re-label when it arrives. That is the reason Decision 6 rejected the token rename.
    - **Test harness.** One new browser case seeds `message.output`. There is no precedent in `e2e/`; the cited `ocu-fixtures.ts` seeds `content` only.
    - **Not selected:** Auth, Schema, Backend, the OCU repo, built-in skill names (Non-Goal).
    - **Review-only:** the OCU `view` signature and mount path have no cross-repo drift test; the PR says so.
  - **Helper** `src/lib/components/chat/ocu-skill-call.ts`, with the paired `ocu-skill-call.test.ts`:
    - **Matcher.** Input: a tool name and the raw `attributes.arguments` string. It must read the attribute, not the row's `args`, because `args` is `''` while a row is closed.
      - It decodes with `html-entities` `decode`, then unwraps nested JSON strings with `JSON.parse` until a non-string remains, as the row's own `parseJSONString` does: legacy `<details>` content stores entity-encoded JSON inside a JSON string (`serialize_output`, `git show 0443ab3a6^:backend/open_webui/utils/middleware.py`). It needs a plain object whose `path` is a string.
      - It returns `{name}` only when the tool name is `view` and the path is exactly `/mnt/skills/user/{name}/SKILL.md`, with `{name}` matching `^[a-z0-9][a-z0-9-]{0,63}$`. Otherwise it returns `null`.
      - It never throws.
    - **Store.** One page-scoped writable map from `name` to `display_name` (a string or `null`), built from the `GET /api/v1/ocu/skills/` list. Disabled entries are included.
      - **Shown name:** the map value when it is a non-null string, otherwise `{name}`. This covers a skill the viewer cannot read, a deleted skill, an unloaded store and a `null` display name.
      - **Slash-menu write:** each successful `getUserSkills` result in `SlashCommands.svelte`'s `onMount` replaces the map. A failed slash load must not write: the existing `.catch(() => [])` result must not reach the store, so the write sits before the `catch`, for example `.then(remember)`. A successful slash write also counts as "filled", so no row load follows.
      - **Row and summary load:** a load-once call takes the app config. When `workspaceFilesEnabled(config)` (`src/lib/apis/ocu/index.ts:38`) is false it requests nothing. Otherwise it calls `getUserSkills` at most once per page, whatever the number of callers and calls.
      - **Load failure:** a failed load leaves the map unchanged. It logs once with `console.warn`, not `console.error`, because the browser cases fail on console errors. It is not retried for the rest of the page.
    - **Load trigger:** only a row or summary whose call matches calls the load. A non-matching row or group never requests the list.
    - **Tests isolate the module state without a reset export,** so `make anti-drift` finds no dead export and every export has a non-test caller.
      - Preferred: in `beforeEach`, call `vi.resetModules()` and then dynamically import, together, `svelte` (`mount`, `tick`), `$lib/stores` (`config`), the helper, the component and the `i18n` fixture. `vite.config.ts` inlines svelte into the Vitest registry, so a statically imported `mount` would run on a different svelte instance than a re-imported component.
      - The mocked `$lib/apis/ocu/skills` must be the same instance the re-imported helper calls. Create the mock with `vi.hoisted(() => vi.fn())` and return it from the `vi.mock` factory, or add the module to the joint dynamic import and configure and assert on that handle. A statically imported `getUserSkills` handle would be stale after `vi.resetModules()`, and the 0-call cases would pass vacuously. This applies to the helper's store tests too.
      - If that does not hold in practice (context or store writes miss), put the cases that need an empty store in their own test file, one isolated state per file.
      - A feature-off call does not mark the load as attempted. A later call with the feature on still loads once.
      - The PR reports which approach was used.
  - **Matcher cases** (Vitest; red first, because the module does not exist):
    - match `invoice-builder` for:
      - raw JSON `{"description":"d","path":"/mnt/skills/user/invoice-builder/SKILL.md"}`;
      - the same JSON entity-encoded (`&quot;`, as the legacy `<details>` path stores it);
      - the same object with an extra `view_range` key.
    - `null` for:
      - path `/mnt/skills/public/docx/SKILL.md`;
      - path `/mnt/skills/user/invoice-builder/scripts/run.py`;
      - path `/mnt/skills/user/../SKILL.md`;
      - path `/mnt/skills/user/Invoice/SKILL.md` (uppercase);
      - path `/mnt/skills/user/invoice-builder/SKILL.md/` (trailing slash);
      - tool name `bash_tool` with the matching path;
      - arguments `''`, `'{"path":'` (partial streaming JSON), `'[]'`, `'"x"'` and `'{"path":5}'`.
  - **Store cases** (Vitest, mocking `$lib/apis/ocu/skills`'s `getUserSkills`, red first):
    - Load once. Three load calls (feature on) made before the mocked list resolves, plus two after, produce exactly one `getUserSkills` call. After it resolves with `[{name:'invoice-builder', display_name:'发票生成', enabled:true, …}]`, the shown name of `invoice-builder` is `发票生成`.
    - A slash write (the same function the menu calls) of a list with `display_name: '新名字'` changes the shown name to `新名字`. A slash write before any load means a later load call makes no request.
    - Feature off: config `{features:{enable_ocu_workspace:false}}`, and also `{}`, makes no `getUserSkills` call, and the shown name stays `invoice-builder`.
    - Disabled skill: a list entry with `enabled:false, display_name:'发票生成'` gives the shown name `发票生成`.
    - Failed load: `getUserSkills` rejects. The shown name stays `invoice-builder`, `console.warn` is called exactly once, and a second load call makes no second request. A previously written map is not cleared.
    - Fallbacks: an unknown name shows as the name itself, and a `null` display name shows as the name.
  - **`SlashCommands.test.ts`** (existing file, new cases only):
    - after the menu mounts with the list mock resolving the `invoice-builder` fixture with `发票生成`, the store's shown name is `发票生成`;
    - with the list mock rejecting, the store keeps its earlier value.
  - **`ToolCallDisplay` per-state cases** in a new `src/lib/components/common/ToolCallDisplay.test.ts`, following `ImageGenerationPlaceholder.test.ts` (jsdom, the `i18n` fixture `t` that interpolates the English key):
    - **Setup.** The store is pre-written with `invoice-builder → 发票生成` unless a case says otherwise. Each case asserts the full-label span and the short-label span; the implementer names the selectors (the class contains `@`, so it must be escaped, for example `.\@md\:inline`). Arguments use the matching raw JSON.
    - **Label table.** Input: `done`, `status`, `resolvable` and the result.

      | Input                                                                                                         | Full label                                                     | Short label |
      | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------- |
      | `done:'false', status:''` (preparing)                                                                         | `Reading skill: 发票生成...`                                   | `发票生成`  |
      | `done:'false', status:'pending', resolvable:false` (pending, not resolvable: upstream treats it as preparing) | `Reading skill: 发票生成...`                                   | `发票生成`  |
      | `done:'false', status:'completed'` (executing)                                                                | `Reading skill: 发票生成...`                                   | `发票生成`  |
      | `done:'true', status:'completed'`, result `'# SKILL'`                                                         | `Used skill: 发票生成`                                         | `发票生成`  |
      | `done:'false', status:'failed'`                                                                               | `Skill read failed: 发票生成`                                  | `发票生成`  |
      | `done:'true'`, result `'Error: not found'`                                                                    | `Skill read failed: 发票生成`                                  | `发票生成`  |
      | `status:'rejected'`                                                                                           | upstream `Denied view`                                         | `发票生成`  |
      | `done:'false', status:'pending', resolvable:true` (awaiting approval)                                         | upstream `Allow view?`; the Allow and Deny buttons are present | `发票生成`  |

    - **Awaiting input** cannot match, because `needsInput` requires the name `ask_user`. The case is pinned as: an `ask_user` pending row keeps `Input needed` and short label `ask_user`.
    - **Built-in row:** `view` on `/mnt/skills/public/docx/SKILL.md`, done. Full label `View Result from view`, short label `view`.
    - **Status icons and expanded body:** a matching done row and the same row with `name: 'view'` on a public path have the same icon element (`CheckCircle`) and the same open-body `Input` text.
    - **Late fill:** with feature on, an empty store and a deferred `getUserSkills`, a done matching row first reads `Used skill: invoice-builder`. After the list resolves and a `tick`, it reads `Used skill: 发票生成`.
    - **Feature off:** the same render with `features.enable_ocu_workspace:false` makes no request and reads `Used skill: invoice-builder`.
    - **Only a match loads:** with the feature on (`config.set({features:{enable_ocu_workspace:true}})`) and an empty store, these make 0 `getUserSkills` calls:
      - a done `bash_tool` row;
      - a done `view` row on `/mnt/skills/public/docx/SKILL.md`.
    - **Failed icons:** the `status:'failed'` row and the `Error: not found` row both show the upstream error icon container `text-red-500`, not the rejected one (`text-red-400`). The rejected row shows `text-red-400`.
    - **Text, not markup:** with the display name `A&amp;B "x"`, the done row's full-label `textContent` is exactly `Used skill: A&amp;B "x"`. No entity is decoded and nothing is double-escaped.
    - **Red first:** every matching row in the table starts red. The built-in, `ask_user` and rejected/approval full-label cases pass before and after.

  - **Group summary cases**, added to the existing `ConsecutiveDetailsGroup.test.ts` (new `describe`; existing cases unchanged; red first):
    - Tokens: a done matching `view` token (entity-encoded arguments, `text` `'# SKILL'`), then a done `bash_tool` token.
      - The summary span reads exactly `Used skill: 发票生成, bash_tool`.
      - The prefix is `Explored`, and the group stays closed (`aria-expanded="false"`).
    - Two done matching tokens on `invoice-builder` plus one `bash_tool` give `2 Used skill: 发票生成, bash_tool`, as upstream counts equal names.
    - A failed matching token (`status:'failed'`) still contributes `Used skill: 发票生成` (Decision 9), and the summary icon is the upstream error icon.
    - Late fill, with `config.set({features:{enable_ocu_workspace:true}})`, an empty store and a deferred list:
      - the summary first reads `Used skill: invoice-builder, bash_tool`;
      - after the list resolves and a `tick`, it reads `Used skill: 发票生成, bash_tool`;
      - the closed group renders no rows (its slot is not rendered), and the group alone makes exactly one `getUserSkills` call.
    - No match: two `bash_tool` tokens read `2 bash_tool`, as before. With the feature on and an empty store, that group makes 0 `getUserSkills` calls.
    - Text, not markup: with the display name `A&amp;B "x"`, the summary span's `textContent` is exactly `Used skill: A&amp;B "x", bash_tool`.
  - **i18n.** `npm run i18n:parse` adds `Used skill: {{NAME}}`, `Reading skill: {{NAME}}...` and `Skill read failed: {{NAME}}` to every catalog. zh-CN gets:
    - `使用技能：{{NAME}}`
    - `正在读取技能：{{NAME}}…`
    - `读取技能失败：{{NAME}}`

    The `: ` in a key is safe because `src/lib/i18n/index.ts` sets `nsSeparator: false` and `keySeparator: false`. One Vitest assertion reads `src/lib/i18n/locales/zh-CN/translation.json` and checks the three strings exactly. It can live in `ocu-skill-call.test.ts` or the row test. It is the only proof of the reading and failed strings, because the browser case shows only the done one.

  - **Browser case**, added to `e2e/ocu-skill-display-name.e2e.ts` as a separate `test(...)`:
    - **Setup.** `collectErrors(page, DISPLAY_NAME_PATH)`, then `openInChinese`. Then, through the API: delete `invoice-builder` quietly, upload it (the first upload grants every user read), and set the display name `发票生成`.
    - **Seed** one chat through `POST /api/v1/chats/new`, with `history.messages` holding two assistant messages in one chain. Each has `done: true`, `content: ''` and an `output` array of Responses-style items, as `structuredOutput.ts` `buildOutputDisplayItems` reads them.
      - **Message A** `output`, in order:
        1. `{type:'function_call', id:'fc-skill', call_id:'call-skill', name:'view', arguments:'{"description":"读取技能说明","path":"/mnt/skills/user/invoice-builder/SKILL.md"}', status:'completed'}`
        2. `{type:'function_call_output', call_id:'call-skill', output:[{type:'input_text', text:'# invoice-builder'}], status:'completed'}`
        3. `{type:'function_call', id:'fc-bash', call_id:'call-bash', name:'bash_tool', arguments:'{"command":"ls"}', status:'completed'}`
        4. `{type:'function_call_output', call_id:'call-bash', output:[{type:'input_text', text:'ok'}], status:'completed'}`
        5. `{type:'message', role:'assistant', content:[{type:'output_text', text:'技能已读取'}]}`
      - **Message B** `output` holds a single `view` call on `/mnt/skills/public/docx/SKILL.md` with its output. A single call renders ungrouped as `detail_single`.
      - **Tree:** each message carries `id`, `role:'assistant'`, `timestamp`, `done: true` and `content: ''`. A has `parentId: null` and `childrenIds: [B.id]`; B has `parentId: A.id` and `childrenIds: []`; `currentId` is B. A parent without `models` renders an assistant→assistant chain as two response messages (`Message.svelte:88`). If the renderer needs a different item shape to show these rows, the implementer reports it as a deviation instead of changing the components.
    - **Open** `/c/{chatId}` in Chinese. Within message A:
      - the collapsed group's toggle (`[aria-label="展开/收起详情"][aria-expanded="false"]`, scoped to `#message-{A.id}`) is visible, and its text contains `已分析` and `使用技能：发票生成, bash_tool`;
      - the closed group renders no row label `使用技能：发票生成` outside the summary.
    - **Expand:** click the toggle, then `aria-expanded="true"`.
      - The skill row is the ToolCallDisplay root whose `id` ends with `-0-tool-call` inside message A. Its visible full label (the `@md:inline` span) has text `使用技能：发票生成`.
      - The `bash_tool` row's visible label is `查看来自 bash_tool 的结果`.
    - **Message B:** its row's visible label is `查看来自 view 的结果`.
    - **Evidence:** screenshot `.run/ui-evidence/ocu-skill-display-name-tool-call.png` (`fullPage: true`, `animations: 'disabled'`), taken with the group expanded.
    - **Teardown** in `finally`, with `Promise.allSettled`: delete the chat, delete `invoice-builder`. Then `checkErrors(0)`.
  - **Docs.** Extend the decision record of task 1.1 with Decisions 6 and 9. Add the two upstream branches, the rejected token rename, the load-once/`console.warn` choice and the consequence that the approval row's short label shows only the display name next to Allow/Deny, and add `DankerMu/open-webui#793` to `references:`.
  - **Must preserve:**
    - **consumer surfaces**, all unchanged and reaching the new branches only through the two components:
      - the ToolCallDisplay and ConsecutiveDetailsGroup call sites in `MarkdownTokens.svelte` (legacy `<details>` content path);
      - `StructuredOutputRenderer.svelte` (group and single);
      - `src/lib/components/channel/Messages/Message.svelte`, which also uses StructuredOutputRenderer;
      - the shared view `src/routes/s/[id]/+page.svelte`. Its config may lack `enable_ocu_workspace`, so it requests nothing and shows the English name: the feature-off cases above cover it;
    - every existing case in `ConsecutiveDetailsGroup.test.ts`, `ImageGenerationPlaceholder.test.ts`, `SlashCommands.test.ts` and `ocu-skill-display-name.e2e.ts` passes unmodified;
    - the image placeholder branches in both components are untouched.
  - **Commands:**
    - `make test-frontend`;
    - `make typecheck` (no new errors);
    - `make lint-scoped`. `ConsecutiveDetailsGroup.svelte` is review-only here, because lint-scoped reports "eslint crashed" for it and exits 0. The PR says so;
    - `make anti-drift`;
    - `make coverage-gate PART=frontend` (`ocu-skill-call.ts` is fork-added: per-file 80%);
    - `make decisions-verify`;
    - `make verify-ui-ocu` (screenshot; zero unexpected console errors);
    - `make verify-ui-ocu-repeat SPEC=ocu-skill-display-name.e2e.ts REPEAT=3`.
  - **Diff size.** Expected above 400 lines, mostly tests (helper and row tests are new files). The PR carries label `diff-limit-exempt`. The justification in the PR body: the slice is atomic (task 5.1 slice line), and the tests are most of the diff.

Suggested fixture level: expanded - branches inside two upstream rendering components used by every tool call.
Minimal mergeable slice: atomic - the matcher and store have no other callers, and both branches must agree; a row reading 「使用技能」 under a summary reading `view` is the defect this task fixes. Depends on 2.1 (API type and e2e spec) and 4.1 (the slash menu that also writes the store).

## 6. User guide

- [ ] 6.1 Update `docs/uploaded-skills.md`.
  - Administrators set the display name in the 「工作区 Skills」 tab.
  - The rules: optional, at most 32 characters, no `<`, `>`, line breaks or invisible characters, not unique, kept on replace.
  - Where users see it: the slash menu, the chip, the sent message, the personal tab, the tool-call rows and the collapsed tool group summary.
  - The English name stays what the model and the sandbox use.
  - Replace the now-stale line (`:76`) that says the sent message shows `$ocu--invoice-builder`.

  Verify with `make doc-gate`.

Suggested fixture level: none - documentation only.
Minimal mergeable slice: atomic - one page. Depends on 2.1, 3.1, 4.1 and 5.1, so the guide describes shipped behavior.
