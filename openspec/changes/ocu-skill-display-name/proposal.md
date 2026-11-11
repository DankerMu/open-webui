## Why

An uploaded skill's `name` must be an English slug (`^[a-z0-9][a-z0-9-]{0,63}$`), because it is the sandbox mount directory and the name the model and Claude Code use. Users see that slug in the `/` menu, in the chat input's mention label and in the message's tool-call row. The owner wants them to see a Chinese name instead. Built-in skills stay as they are. Source plan: `docs/plans/2026-11-11-knowledge-copy-and-skill-display-names.md` (part B, Decision Ledger confirmed by the user on 2026-11-11).

Triage:

```text
Issue type: feature
Fixture level: expanded
Upstream suggested level: absent
Blast radius: one additive column on ocu_skill, one administrator route, and display-only changes in the slash menu, both Skills tabs and the upstream tool-call row
Selected risk packs: Schema, Public API, Auth / secrets (admin route matrix), Documentation
Evidence floor: backend pytest (router + model), make db-verify, make smoke, make test-frontend, make verify-ui-ocu
```

## What Changes

- **Data.** `ocu_skill` gains a nullable `display_name` column, added by one additive Alembic migration named in the source plan.
- **Rules.** The display name is optional, at most 32 characters after trimming, and contains no `<`, `>` or control character. It need not be unique. An empty value clears it. It survives a ZIP replace and is removed with the skill.
- **Administrator route.** `POST /api/v1/ocu/skills/{name}/display-name` sets or clears the name. A malformed body gets 422; a rule violation gets 400. The administrator listing, the access response, the user listing and the toggle response carry `display_name`.
- **Administrator tab.** Each listed skill gets a display-name field with a save button.
- **Personal tab.** Each listed skill shows its display name first and its English name second.
- **Slash menu.**
  - Entries show the display name first and the English name second, and match a query on either.
  - Selecting an entry inserts the mention `ocu--{name}|{display name}`, so the chip and the sent text show the Chinese name.
  - The OCU filter still gives the model an instruction that names the English `name`.
- **Sent message.** The message bubble shows the mention label (`$发票生成`), through a one-line fix in upstream `MentionToken.svelte`. Native skill mentions then also show their label.
- **Tool-call row.** When the model views `/mnt/skills/user/{name}/SKILL.md`, the row reads 「使用技能：{display name}」 when done, 「读取技能失败：{display name}」 when the read failed, and 「正在读取技能：{display name}…」 while running. The collapsed group summary shows 「使用技能：{display name}」 instead of `view`. Built-in skill rows and other tools are unchanged.
- Everywhere, a skill without a display name shows its English name.
- **Unchanged:** the OCU repository, the internal registry contract and the model prompt.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-uploaded-skills`: the administrator listing requirement gains `display_name`, and a new requirement covers the display name (rules, administrator route, kept on replace, removed on delete).
- `ocu-uploaded-skill-preferences`: the granted-list requirement gains `display_name`.
- `ocu-uploaded-skill-ui`: the slash-menu requirement changes its display and mention label. New requirements cover both tabs, the sent-message label, the tool-call row label and the collapsed group summary.

## Impact

- WebUI backend:
  - `backend/open_webui/models/ocu_skills.py`;
  - `backend/open_webui/routers/ocu_skills.py`;
  - one migration under `backend/open_webui/migrations/versions/`;
  - tests under `backend/open_webui/test/`;
  - `smoke/ocu-skills.hurl`.
- WebUI frontend:
  - `src/lib/apis/ocu/skills.ts`;
  - `admin/Settings/OcuSkills.svelte`, `chat/Settings/OcuSkillPreferences.svelte`;
  - `Commands/SlashCommands.svelte`, `CommandSuggestionList.svelte`;
  - a new label helper and minimal branches in upstream `common/ToolCallDisplay.svelte`, `Messages/Markdown/ConsecutiveDetailsGroup.svelte` and `MarkdownInlineTokens/MentionToken.svelte`;
  - i18n (regenerated), a new Playwright spec `e2e/ocu-skill-display-name.e2e.ts` in `REQUIRED_SPECS`.
- Docs:
  - a decision record;
  - `docs/uploaded-skills.md`;
  - the AGENTS.md Critical Paths row already covers `routers/ocu_skills.py`.
- OCU: none. Deployment: the open-webui image is rebuilt, and the migration runs at startup.
