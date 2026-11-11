---
id: 2026-11-11-ocu-skill-display-name
title: An uploaded skill's display name is a nullable column on its ocu_skill row
kind: architecture
status: implemented
date: 2026-11-11
supersedes: none
references: docs/plans/2026-11-11-knowledge-copy-and-skill-display-names.md, ocu-skill-display-name, DankerMu/open-webui#783, DankerMu/open-webui#788, 2026-11-07-ocu-uploaded-skills
---

# An uploaded skill's display name is a nullable column on its ocu_skill row

## Problem

An uploaded skill's `name` must be an English slug, because it is the primary key, the sandbox mount directory and the name the model uses. The owner wants users to see a Chinese name instead in the `/` menu, the mention chip, both Skills tabs and the tool-call row. The choices were where the name is stored, how an administrator writes it, which rule it must pass, which responses carry it and where the frontend reads it. The source plan is [知识库文档拷入沙箱 · 上传 skill 的中文显示名](../../../plans/2026-11-11-knowledge-copy-and-skill-display-names.md) (part B); the OpenSpec change is `ocu-skill-display-name` (design Decisions 1-5). This amends the data model of [2026-11-07-ocu-uploaded-skills](2026-11-07-ocu-uploaded-skills.md).

## Decision

- **Storage.** One additive migration, `2a539b1fba23_add_ocu_skill_display_name` (down_revision `f7a8b9c0d1e2`), adds the nullable `ocu_skill.display_name` (Text) only when the column is absent; its downgrade drops only that column through `op.batch_alter_table`. Existing rows read `NULL`, which shows the English name. A hard delete removes the name with the row. A ZIP replace keeps it, because the replace UPDATE lists its columns explicitly and `display_name` is not among them. `name` stays the only identifier, and display names need not be unique.
- **Write route.** `POST /api/v1/ocu/skills/{name}/display-name` is the only writer, for administrators only. The upload and access routes are unchanged. The body is a Pydantic model whose `display_name: StrictStr | None` field is required, so `{}`, numbers and booleans get 422 instead of clearing the name. Success returns the administrator item; an unknown name is 404, a rule violation 400 with the reason as its detail, a non-administrator or no session 401, and a disabled workspace 404 through the existing mount gate.
- **Rule.** The router strips surrounding whitespace; an empty result or `null` stores `NULL`. Otherwise the name is at most 32 characters and holds no `<`, no `>` and no Unicode `Cc` character. `|` is allowed, because the OCU filter takes everything after the first `|` as the label. The rule applies on write only; listings return the stored value as is.
- **Listings.** `GET /admin`, `POST /{name}/access`, `GET /` and `POST /{name}/toggle` carry `display_name` (string or `null`). `OcuSkillModel`, `OcuSkillReadableModel`, `OcuSkillAdminItem` and `OcuSkillUserItem` declare it without a default, so a missing column or select fails loudly instead of reading `null`. `readable_skills` selects the column explicitly. The internal `user-config` body keeps exactly `{email, enabled_skills: [{name, description, category, zip_sha256}]}`, and a test pins those keys.
- **Frontend source.** The user list `GET /` is the one display-name source, held in one page-scoped store in the fork module `src/lib/components/chat/ocu-skill-call.ts`. The store maps every readable skill, disabled ones included, to its display name. The slash menu refreshes it on each load. A matching tool-call row loads the list once, and only when `features.enable_ocu_workspace` is true. A failed load keeps the English name and is logged once. A pure matcher in the same module accepts a `view` call whose decoded `path` is exactly `/mnt/skills/user/{name}/SKILL.md`, with `{name}` in the upload-name grammar.

## Alternatives considered

- **A `Config` JSON map of name to display name** — a hard delete would need a second write, and the map and the rows could diverge.
- **Accept the display name in the upload route** — that route reads the raw ZIP stream, and the owner chose editing from the list.
- **Extend the access route** — it keeps one purpose: replacing the read grants.
- **`str | None` with a default of `None` on the write body** — `{}` would silently clear the name; `StrictStr` matches the router's `StrictBool` toggle form.
- **Carry the display name in the internal registry contract** — OCU is out of scope, and the model and the sandbox keep using the English `name`.
- **Read display names per row from a second endpoint** — two sources would disagree after an edit; one list keeps the menu and the rows on one value.

## Consequences

- Task 1.1 (#788) ships the column, its migration and the listing fields; every value is `null` until the write route lands in task 1.2 (#789). The frontend store, matcher and labels follow in later tasks of the change.
- Rolling back the image without the downgrade is safe: the previous image never selects the column.
- A display name is visible only to viewers who can read the skill; a shared-chat viewer without read access sees the English name.
- A page opened before an administrator edit shows the old name in tool-call rows until the slash menu reloads the list.
