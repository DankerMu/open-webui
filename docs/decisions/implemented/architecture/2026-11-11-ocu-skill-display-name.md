---
id: 2026-11-11-ocu-skill-display-name
title: An uploaded skill's display name is a nullable column on its ocu_skill row
kind: architecture
status: implemented
date: 2026-11-11
supersedes: none
references: docs/plans/2026-11-11-knowledge-copy-and-skill-display-names.md, ocu-skill-display-name, DankerMu/open-webui#783, DankerMu/open-webui#788, 2026-11-07-ocu-uploaded-skills, DankerMu/open-webui#804, DankerMu/open-webui#792
---

# An uploaded skill's display name is a nullable column on its ocu_skill row

## Problem

An uploaded skill's `name` must be an English slug, because it is the primary key, the sandbox mount directory and the name the model uses. The owner wants users to see a Chinese name instead in the `/` menu, the mention chip, both Skills tabs and the tool-call row. The choices were where the name is stored, how an administrator writes it, which rule it must pass, which responses carry it and where the frontend reads it. The source plan is [知识库文档拷入沙箱 · 上传 skill 的中文显示名](../../../plans/2026-11-11-knowledge-copy-and-skill-display-names.md) (part B); the OpenSpec change is `ocu-skill-display-name` (design Decisions 1-5, 7 and 10). This amends the data model of [2026-11-07-ocu-uploaded-skills](2026-11-07-ocu-uploaded-skills.md).

## Decision

- **Storage.** One additive migration, `2a539b1fba23_add_ocu_skill_display_name` (down_revision `f7a8b9c0d1e2`), adds the nullable `ocu_skill.display_name` (Text) only when the column is absent; its downgrade drops only that column through `op.batch_alter_table`. Existing rows read `NULL`, which shows the English name. A hard delete removes the name with the row. A ZIP replace keeps it, because the replace UPDATE lists its columns explicitly and `display_name` is not among them. `name` stays the only identifier, and display names need not be unique.
- **Write route.** `POST /api/v1/ocu/skills/{name}/display-name` is the only writer, for administrators only. The upload and access routes are unchanged. The body is a Pydantic model whose `display_name: StrictStr | None` field is required, so `{}`, numbers and booleans get 422 instead of clearing the name. Success returns the administrator item; an unknown name is 404, a rule violation 400 with the reason as its detail, a non-administrator or no session 401, and a disabled workspace 404 through the existing mount gate.
- **Rule.** The router strips surrounding whitespace; an empty result or `null` stores `NULL`. Otherwise the name must pass six rules, checked in this order, and the first broken rule is the 400 detail: (1) at most 32 characters; (2) no `<` and no `>`; (3) no Unicode `Cc` character; (4) no `Cs` character, because a lone surrogate cannot be encoded as UTF-8 and the database write would fail with 500; (5) no `Cf` character, which covers the bidi controls and zero-width characters; (6) at least one character whose category class is `L`, `N`, `P` or `S`, so combining marks alone are rejected. Rules 4-6 were added by #804. `|` is allowed, because the OCU filter takes everything after the first `|` as the label. The rule applies on write only; listings return the stored value as is, so a name stored before #804 may still hold a `Cf` character.
- **Listings.** `GET /admin`, `POST /{name}/access`, `GET /` and `POST /{name}/toggle` carry `display_name` (string or `null`). `OcuSkillModel`, `OcuSkillReadableModel`, `OcuSkillAdminItem` and `OcuSkillUserItem` declare it without a default, so a missing column or select fails loudly instead of reading `null`. `readable_skills` selects the column explicitly. The internal `user-config` body keeps exactly `{email, enabled_skills: [{name, description, category, zip_sha256}]}`, and a test pins those keys.
- **Frontend source.** The user list `GET /` is the one display-name source, held in one page-scoped store in the fork module `src/lib/components/chat/ocu-skill-call.ts`. The store maps every readable skill, disabled ones included, to its display name. The slash menu refreshes it on each load. A matching tool-call row loads the list once, and only when `features.enable_ocu_workspace` is true. A failed load keeps the English name and is logged once. A pure matcher in the same module accepts a `view` call whose decoded `path` is exactly `/mnt/skills/user/{name}/SKILL.md`, with `{name}` in the upload-name grammar.
- **Slash menu** (#792). The 「工作区 Skills」 entries show the shown name (`display_name ?? name`) first and, when a display name is set, the English name as lighter secondary text. A query matches either name case-insensitively, and entries sort by the shown name. Selecting an entry inserts the mention id `ocu--{name}|{shown name}` with label `{shown name}`, so the sent message carries `<$ocu--{name}|{shown name}>`: the id part stays `ocu--{name}` for the OCU filter, and a skill without a display name still sends `<$ocu--{name}|{name}>`.
- **Sent bubble** (#792). One assignment changes in upstream `MentionToken.svelte`: in the `$` branch, an id without `|` takes the token's `label` instead of the id. The `$` tokenizer (`mention-extension.ts`, the only producer of mention tokens) already splits `<$id|label>` into id and label and sets the label to the id when none is given, so the bubble shows `$发票生成` instead of `$ocu--invoice-builder` and `<$invoice-builder>` still shows `$invoice-builder`. The id fallback stays in the tokenizer rather than as `?? token.id` in the component, because `init` is at the complexity limit of `make lint-scoped`; the read goes through `Tokens.Generic` because `Token` declares no `label`. The existing `|` arm is left as it is to keep the diff to one line. Native skill mentions now show their label too, which is what the upstream comment intends.

## Alternatives considered

- **A `Config` JSON map of name to display name** — a hard delete would need a second write, and the map and the rows could diverge.
- **Accept the display name in the upload route** — that route reads the raw ZIP stream, and the owner chose editing from the list.
- **Extend the access route** — it keeps one purpose: replacing the read grants.
- **`str | None` with a default of `None` on the write body** — `{}` would silently clear the name; `StrictStr` matches the router's `StrictBool` toggle form.
- **Keep the rule and isolate bidi on render (`<bdi>` / `unicode-bidi: isolate`)** — every consumer in #790–#794 would have to remember it, and it leaves zero-width-only names; rejecting all `Cf` on write closes both (#804).
- **Carry the display name in the internal registry contract** — OCU is out of scope, and the model and the sandbox keep using the English `name`.
- **Change what `RichTextInput` serializes** — it is upstream input code, and the `<$id|label>` marker is a contract with the OCU filter; inserting the shown name as the mention label needs neither change.
- **Read display names per row from a second endpoint** — two sources would disagree after an edit; one list keeps the menu and the rows on one value.

## Consequences

- Task 1.1 (#788) ships the column, its migration and the listing fields; every value is `null` until the write route lands in task 1.2 (#789). The frontend store, matcher and labels follow in later tasks of the change.
- Task 4.1 (#792) ships the slash menu, the inserted mention and the bubble; the menu starts writing into the store when task 5.1 adds it.
- Rollback needs the downgrade first: run it to `f7a8b9c0d1e2` with this image, then switch images. The previous image refuses to start against a DB stamped `2a539b1fba23`, because its startup `upgrade head` cannot locate that revision.
- A display name is visible only to viewers who can read the skill; a shared-chat viewer without read access sees the English name.
- A page opened before an administrator edit shows the old name in tool-call rows until the slash menu reloads the list.
