# Design

## Context

See proposal.md for motivation and the source plan (`docs/plans/2026-11-11-knowledge-copy-and-skill-display-names.md`, part B) for the code survey. Constraints that shape the approach:

- `ocu_skill` is the single row per uploaded skill (`OcuSkill` in `backend/open_webui/models/ocu_skills.py`). Replace updates only `data`, `zip_sha256`, `size`, `description` and `updated_at` (the `upsert` `replace` tuple), and delete removes the row with its grants and disables.
- The latest migration is `f7a8b9c0d1e2_add_ocu_skill.py`; AGENTS.md allows a migration only when a plan names it, and the source plan names `add_ocu_skill_display_name`.
- The OCU filter rewrites `<$ocu--{name}|{label}>` to `{label}`, with label class `[^<>]*`, and names `{name}` in its system sentence. A Chinese label therefore needs no OCU change.
- The tool-call row is upstream `src/lib/components/common/ToolCallDisplay.svelte`. Its arguments are decoded only while the row is open (`:148-151`). The fork already adds one label-time helper there (`runningImageCall`) as a minimal branch.
- Adjacent tool calls and reasoning blocks are collapsed into one group, closed by default. The summary is built from raw `attributes.name` (`src/lib/components/chat/Messages/Markdown/ConsecutiveDetailsGroup.svelte:47,154-183`), and rows render only when the group is open. Reading a `SKILL.md` is almost always followed by another call, so the summary is what users see by default. The fork already branches there for the image placeholder (`:16-18,123-126`).
- A sent message renders `$` mentions with upstream `MentionToken.svelte`. Its `$` branch looks for `|` in `token.id`, but the mention tokenizer (`src/lib/utils/marked/mention-extension.ts:43-63`) already split the label into `token.label`. A label is therefore never shown: today the bubble reads `$ocu--invoice-builder`.

## Goals / Non-Goals

**Goals:**

- An administrator can give each uploaded skill an optional Chinese display name and change it at any time.
- Users see the display name in the `/` menu, the mention chip, the sent text, the personal tab and the tool-call row. Wherever no display name is set, they see the English name.

**Non-Goals:**

- Display names for built-in skills; any built-in name table.
- Entering a display name at upload time, or reading one from `SKILL.md` frontmatter.
- Putting the display name into the system prompt, OCU's `<available_skills>` or the internal registry contract. The user message text does carry the display name through the `/` mention label (Decision 7); that is intended, not a Non-Goal.
- Unique display names.
- Any change to the OCU repository.

## Decisions

1. **A nullable column on `ocu_skill`, not a config map.**
   - The name belongs to the skill row: it disappears with a hard delete, and replace leaves it alone because the replace update lists its columns explicitly.
   - A `Config` JSON map was rejected: deleting a skill would need a second write, and the two could diverge.
   - The migration is additive (`ADD COLUMN display_name TEXT NULL`) with `down_revision = 'f7a8b9c0d1e2'`. Downgrade drops the column.
2. **A dedicated administrator route `POST /{name}/display-name`.**
   - The upload route stays unchanged: it reads the raw ZIP stream, and the owner chose editing from the list.
   - The access route keeps one purpose.
   - Body: a Pydantic model with a required field `display_name: StrictStr | None` (no default), so `{}`, numbers and booleans get 422 instead of silently clearing the name. This matches the router's `StrictBool` toggle form.
   - Responses: the updated administrator item on success; 404 for an unknown name; 400 for a rule violation, with the reason as the detail string; 401 for a non-administrator or no session; 404 for every route when the workspace is disabled (the existing mount gate).
3. **Validation in the router, on the trimmed value.**
   - Strip surrounding whitespace. An empty result or `null` stores `NULL`.
   - Otherwise require at most 32 characters (Python string length), no `<`, no `>`, and no character in Unicode category `Cc` (this covers line breaks and tabs).
   - `|` is allowed, because the filter takes everything after the first `|` as the label.
   - The rule is enforced only on write. The listings return the stored value as is.
4. **Listings carry `display_name`.**
   - `GET /admin`, `POST /{name}/access`, `GET /` and `POST /{name}/toggle` add the field. `POST /{name}/access` shares `OcuSkillAdminItem`.
   - `readable_skills` selects explicit columns (`models/ocu_skills.py`), so it gains `display_name` there.
   - The internal `user-config` response does not change, because OCU is out of scope. It builds its own model from `readable_skills`, so a test pins its keys.
5. **One display-name source on the frontend: the user list `GET /`, held in one page-scoped store.**
   - A fork module, `src/lib/components/chat/ocu-skill-call.ts`, owns two things.
   - **The store.** A writable map of every readable skill's `name` to its `display_name`. Disabled skills are included, because `GET /` returns them with `enabled: false`.
     - The slash menu keeps loading `GET /` each time it opens, as it does today, and writes the result into the store. So the menu and the rows share one source.
     - A tool-call row that matches loads the list once if the store was never filled. It does so only when `features.enable_ocu_workspace` is true; otherwise nothing is requested.
     - A failed load leaves the store as it was, and rows show the English name. The failure is logged once, because the label is cosmetic and must not block the message.
   - **A pure matcher.** It returns the skill name when the tool name is `view` and the `path` argument is exactly `/mnt/skills/user/{name}/SKILL.md`, with `{name}` in the upload-name grammar `^[a-z0-9][a-z0-9-]{0,63}$`.
     - It decodes `attributes.arguments` itself, with the same `decode` the row uses, and then parses JSON. Rows keep `args` empty while closed, and the old details path stores entity-encoded arguments.
     - Malformed arguments return no match.
6. **Minimal branch in `ToolCallDisplay.svelte`.** When the matcher returns a name:
   - The short label shows the shown name.
   - The full label in the preparing and executing states reads 「正在读取技能：X…」.
   - In the done state it reads 「使用技能：X」. When `isError` is true (status `failed`, or an error result), it reads 「读取技能失败：X」 instead.
   - The rejected, approval and input states keep the upstream text.
   - The status icon, the expanded input and output, and every non-matching row are unchanged.
   - The texts are new i18n keys `Used skill: {{NAME}}`, `Reading skill: {{NAME}}...` and `Skill read failed: {{NAME}}`. They are called with `$i18n.t` inside the `.svelte` files, because `i18next-parser` scans `.svelte` but not this `.ts` helper. The keys are regenerated with `npm run i18n:parse`, and zh-CN translations are added.
   - The token-level rename that upstream uses for `delegate_task` (`structuredOutput.ts:198-210`) was rejected. Tokens are built synchronously from the stored message, while display names arrive asynchronously, and renaming the token would also change the approval and denied texts.
7. **Slash menu.**
   - Entries render the display name (or the English name) first and the English name second when a display name exists.
   - The query matches either, case-insensitively. Entries sort by the shown name.
   - Each load of the list also refreshes the Decision 5 store.
   - `selectOcuSkill` inserts the id `ocu--{name}|{shown name}` with label `{shown name}`. The serialized message therefore carries `<$ocu--{name}|{shown name}>`.
8. **Administrator tab editing.** Each row holds a text input initialized from `display_name` and a save button. On success, the row updates from the response. On failure, a toast shows the server's reason (the existing `requestSkills` error path) and the input keeps the typed text.
9. **Collapsed group summary.**
   - `ConsecutiveDetailsGroup.svelte`'s `summaryText` maps each tool-call token through the same matcher and store before it counts names. A match contributes 「使用技能：X」 through the same `Used skill: {{NAME}}` key. A failed read still counts as used in the summary: the summary has no per-call state, and the expanded row shows the failure.
   - This is a minimal branch next to the existing image-placeholder branch in that file.
10. **One-line fix in upstream `MentionToken.svelte`.**
    - In the `$` branch, when `token.id` holds no `|`, the label is `token.label ?? token.id` instead of the id. The tokenizer already strips the label off the id; the existing `|` branch is left unchanged to keep the diff to one assignment.
    - This also makes native skill mentions show their label, which is what the upstream comment intends.
    - Changing what `RichTextInput` serializes was rejected: it is upstream input code, and the marker format is a contract with the OCU filter.

## Sketch seams under test

- `TestClient` against `/api/v1/ocu/skills/*` (existing router tests): the route matrix, validation, listing fields and replace/delete behavior are all HTTP-visible here.
- `make db-verify` for the migration's upgrade and downgrade.
- The pure matcher and the store in `ocu-skill-call.ts` with Vitest. The path grammar and the fallback are the only logic behind the labels.
- `ToolCallDisplay.svelte` rendered in Vitest with given attributes, following `ImageGenerationPlaceholder.test.ts`. The state-to-label table is component logic that one browser case cannot cover row by row.
- A new Playwright spec `e2e/ocu-skill-display-name.e2e.ts`, added to `REQUIRED_SPECS` in `scripts/verify-ui-ocu.py` and run by `make verify-ui-ocu`, is the one browser seam. It covers the admin edit, the personal tab, the slash-menu chip, the sent marker and bubble, and the collapsed group summary over a chat seeded through `POST /api/v1/chats/new` with `message.output` items (`function_call` plus `function_call_output`), as production stores them (`e2e/ocu-fixtures.ts:204-214`).
  - It is a new file because `e2e/ocu-skills.e2e.ts` is already 491 lines, and four more cases would cross the 800-line limit of `make lint-scoped`.
  - The display-name router tests likewise go to a new module, `backend/open_webui/test/routers/test_ocu_skill_display_name.py`, because `test_ocu_skills.py` is already 682 lines.

## Risks / Trade-offs

- [Display name shown to a viewer without read access] → The store holds only the viewer's readable skills, so a shared-chat viewer sees the English name. This is accepted, and nothing private leaks.
- [Stale name after an administrator edit] → Rows read the store, which the slash menu refreshes each time it opens. Until then, a page opened before the edit shows the old name in rows. This is accepted because the label is cosmetic.
- [Upstream rebase friction in `ToolCallDisplay.svelte`, `ConsecutiveDetailsGroup.svelte` and `MentionToken.svelte`] → Each branch is a few lines that call into the fork module or change one assignment, next to existing fork branches where they exist.
- [Native skill bubbles change] → Native `$` mentions now show their label instead of their id. This is user-visible but matches the upstream intent, and only display changes.

## Migration Plan

1. Deploy the rebuilt open-webui image. The migration adds the column at startup, and existing skills get `NULL`, which shows the English name.
2. Rollback: run the downgrade to `f7a8b9c0d1e2` with the new image before switching to the previous one. The previous image cannot start against a DB stamped `2a539b1fba23`, because its startup `upgrade head` cannot locate that revision.

## Not yet specified

None.

## Open Questions

None.
