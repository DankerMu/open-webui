# Tasks

All tasks are in this repository. Each production change ships with its test in the same task, and each new test is red before the implementation (AGENTS.md § TDD). No task may implement an item from design.md Non-Goals. Each task is sized for one PR of at most 400 diff lines, tests and docs included, excluding regenerated i18n catalogs.

## 1. Column, listings and administrator route

- [ ] 1.1 Add the migration and the column, and carry the field through every listing.
  - **Migration.** Add `backend/open_webui/migrations/versions/<rev>_add_ocu_skill_display_name.py` with `down_revision = 'f7a8b9c0d1e2'`. It adds nullable `ocu_skill.display_name` (Text); its downgrade drops the column.
  - **Model.** In `backend/open_webui/models/ocu_skills.py`, add `display_name: str | None` to `OcuSkillModel` and `OcuSkillReadableModel`, and add the column to the explicit select of `readable_skills` (`:91`).
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
      - `OcuSkillModel`, `OcuSkillReadableModel` and the explicit select in `readable_skills`;
      - router models `OcuSkillAdminItem` (used by `GET /admin` and `POST /{name}/access` via `_admin_item`) and `OcuSkillUserItem` (`GET /`, `POST /{name}/toggle` via `_user_item`);
      - `OcuInternalUserConfig` / `OcuInternalSkill`, which stay unchanged;
      - `OcuSkillUploaded`, the upload response, which is out of this task;
      - `upsert` replace columns at `models/ocu_skills.py:173`, which must not list `display_name`;
      - frontend types, which are out of this task (#790).
  - **Migration `<rev>_add_ocu_skill_display_name.py`.**
    - `revision` is a fresh 12-hex id, and `down_revision = 'f7a8b9c0d1e2'`.
    - Upgrade adds `display_name` `sa.Text()` nullable only when the column is absent (inspect guard, as the parent migration does).
    - Downgrade drops it with `op.batch_alter_table` (SQLite).
    - Model test, red first: on a fresh SQLite file, running `upgrade` of both migrations, then `upgrade` again, leaves `display_name` in the `ocu_skill` columns. `downgrade` of the new one removes it and keeps every other column and row.
    - `make db-verify` passes.
  - **Table test module `backend/open_webui/test/models/test_ocu_skill_tables.py`.**
    - The module fixture also applies the new migration after `f7a8b9c0d1e2`.
    - `test_registry_schema_matches_the_data_model` adds `display_name` to the column set.
    - The existing test that list-all never loads `data` stays green.
  - **Router tests in the new module `backend/open_webui/test/routers/test_ocu_skill_display_name.py`, red first.**
    - For a seeded skill `a` without a display name, each of these carries `display_name: null`: `GET /admin` items, the `POST /a/access` response, `GET /` items and the `POST /a/toggle` response.
    - After `UPDATE ocu_skill SET display_name='发票生成' WHERE name='a'` through the test DB, `GET /` and the toggle response carry `display_name: "发票生成"`.
    - `GET /api/internal/user-config/{email}` with the key returns items whose key set is exactly `{name, description, category, zip_sha256}`.
  - **Existing shape assertions updated, not loosened.**
    - The `POST /{name}/access` comparison in `test_ocu_skills.py` adds `'display_name': None`.
    - The `_user_item` helper in `test_ocu_skill_user_routes.py` adds `'display_name': None`.
    - Every other assertion is unchanged.
  - **Decision record** `docs/decisions/implemented/architecture/2026-11-11-ocu-skill-display-name.md`. It records design Decisions 1-5, links the source plan and this change, and passes `make decisions-verify`.
  - **Commands:**
    - backend pytest for `test_ocu_skill_tables.py`, `test_ocu_skill_display_name.py`, `test_ocu_skills.py`, `test_ocu_skill_user_routes.py` and `test_ocu_skill_internal_routes.py`;
    - `make db-verify`, `make smoke`, `make lint-scoped`, `make coverage-gate`, `make decisions-verify`, `make doc-gate`.

- [ ] 1.2 Add the table method that sets `display_name`, and the administrator route `POST /{name}/display-name` with the body model and validation of design.md Decisions 2-3. In `test_ocu_skill_display_name.py`, cover one case per scenario of spec requirement "Administrator display name" in `ocu-uploaded-skills`:
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

Suggested fixture level: expanded - schema migration plus a new administrator route on a Critical Path (`routers/ocu_skills.py`).
Minimal mergeable slice: task 1.1 - the column and the listing field are green alone (every value is `null`), and the slice carries the decision record. Task 1.2 depends on 1.1.

## 2. Administrator tab editing

- [ ] 2.1 Add the client function and the per-row editor.
  - **Client.** In `src/lib/apis/ocu/skills.ts`, add `display_name` to the types and add `updateSkillDisplayName(token, name, displayName)`, with cases in `skills.test.ts`.
  - **Tab.** In `src/lib/components/admin/Settings/OcuSkills.svelte`, add the per-row field and save action of design.md Decision 8, with cases in the existing `OcuSkills.test.ts`: save updates the row from the response; a rejection shows the server's reason and keeps the typed text.
  - **i18n.** Run `npm run i18n:parse` and add the zh-CN strings.
  - **Browser spec.** Create `e2e/ocu-skill-display-name.e2e.ts`. Add its bare filename to `REQUIRED_SPECS` in `scripts/verify-ui-ocu.py`, and add the matching assertion to `scripts/test_verify_ui_ocu_repeat.py`. Its first case: save `发票生成`, reload, and see it; save a 33-character name, and see the reason and the kept text. Take a screenshot; expect zero console errors.

  Verify with `make test-frontend`, `make typecheck`, `make lint-scoped`, `make test-verify-ui-ocu-repeat` and `make verify-ui-ocu`.

Suggested fixture level: compact - one component and one client function over a route already proven by task 1.2.
Minimal mergeable slice: atomic - the client function's only caller is this tab, and the e2e spec is created with its first case. Depends on 1.2.

## 3. Personal tab

- [ ] 3.1 In `src/lib/components/chat/Settings/OcuSkillPreferences.svelte`, show the shown name first and the English name as secondary text (spec requirement "Display name in the personal tab"), with cases in the existing `OcuSkillPreferences.test.ts` for both scenarios. Add a Playwright case to `e2e/ocu-skill-display-name.e2e.ts`: a skill whose display name was set through the API shows both names. Take a screenshot; expect zero console errors. Verify with `make test-frontend`, `make typecheck`, `make lint-scoped` and `make verify-ui-ocu`.

Suggested fixture level: compact - a display-only change in one fork component.
Minimal mergeable slice: atomic - one component's label. Depends on 2.1 (the API type and the e2e spec).

## 4. Slash menu and sent bubble

- [ ] 4.1 Change the menu, the inserted mention and the bubble.
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

Suggested fixture level: expanded - it touches the shared chat-input entrypoint (upstream command menu) and the upstream message renderer.
Minimal mergeable slice: atomic - the menu's label, the inserted mention and the bubble must agree; shipping one without the others shows the user two names for one choice. Depends on 2.1.

## 5. Tool-call row and group summary

- [ ] 5.1 Add the helper module and the two row branches.
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

Suggested fixture level: expanded - branches inside two upstream rendering components used by every tool call.
Minimal mergeable slice: atomic - the matcher and store have no other callers, and both branches must agree; a row reading 「使用技能」 under a summary reading `view` is the defect this task fixes. Depends on 2.1 (API type and e2e spec) and 4.1 (the slash menu that also writes the store).

## 6. User guide

- [ ] 6.1 Update `docs/uploaded-skills.md`.
  - Administrators set the display name in the 「工作区 Skills」 tab.
  - The rules: optional, at most 32 characters, no `<`, `>` or line breaks, not unique, kept on replace.
  - Where users see it: the slash menu, the chip, the sent message, the personal tab, the tool-call rows and the collapsed tool group summary.
  - The English name stays what the model and the sandbox use.
  - Replace the now-stale line (`:76`) that says the sent message shows `$ocu--invoice-builder`.

  Verify with `make doc-gate`.

Suggested fixture level: none - documentation only.
Minimal mergeable slice: atomic - one page. Depends on 2.1, 3.1, 4.1 and 5.1, so the guide describes shipped behavior.
