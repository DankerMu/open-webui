# Design

## Context

For the motivation, see proposal.md (Why). The source plan, `docs/plans/2026-11-27-ocu-video-report-kit.md`, holds What Already Exists and the Decision Ledger. The constraints that shape the approach are below.

- **The kit as it is** (OCU `remotion-template`, at OCU `e3be359`):
  - `bin/script-schema.mjs` is the only validator. It uses zod 4.5.4, strict objects and `version: z.literal(1)`. `LIMITS` and `BODY_KINDS` encode the explainer skeleton.
  - `validateScript(text)` takes text only. It is imported both by the CLI and, inside the Remotion bundle, by the renderer (`src/kit/render/Explainer.tsx:20,92`), so it may not import `node:` built-ins.
  - The playback order (`hook`, `chapters[].scenes[]`, `summary`, `endCard`) is written out in three places: `bin/explainer-scenes.mjs:36`, `bin/voice-stem.mjs:17` and `bin/scene-timing.mjs:99`.
    - `check-rules.mjs`, `render.mjs`, `project-hash.mjs` and `Explainer.tsx` use `explainer-scenes.mjs`.
    - The timeline and the voice commands use `blockStems` (`voice-stem.mjs`).
  - A voice stem is a position prefix `s{n}-{i}-{b}` plus a hash of the block text, the voice id and the instructions (`voice-stem.mjs:21`).
  - The passing-check hash covers `script.json`, `timeline.json`, `src/`, the `public/` files the check read and the music file (`bin/project-hash.mjs:4-9`).
  - The approval gate:
    - `gallery/approvals.json` holds entries `{id, decision, reviewer, date, export, export_sha256}`, with the theme pick as the entry `id: "theme"`.
    - `tests/registry-approvals.test.mjs` requires the registry, the catalog, the schema kinds and the committed JSON Schema to equal the approved set.
    - `tests/theme.test.mjs` requires exactly one theme, `light`.
    - `tests/scenes.test.mjs:178` requires exactly thirteen catalog kinds.
  - `src/kit/text.ts:233` `formatCount` rescales to 万/亿. `KeyNumber` (which counts up from 0) and `Chart` draw through it.
  - The checklist is printed by `kit status` (`bin/checklist.mjs`, `bin/status.mjs`).
  - The kit CLI checks a fixed argument count per command (`bin/kit.mjs:230-252`).
- **The sandbox:**
  - no network, 2 CPUs, 4 GB;
  - Node 22 and the template's locked `node_modules`, which holds no zip or xlsx reader;
  - `python3` with `openpyxl` 3.1.5 (`requirements.txt:7`, checked at `Dockerfile:401`).
  - Tool calls die after 120 s.
  - The model is `qwen3.8-27b`.
- **CI:**
  - `.github/workflows/template-tests.yml` runs `npm ci`, then `node --test remotion-template/tests/*.test.mjs`. It has no Python setup.
  - The workflow that ran `tests/deploy` (`build.yml`) is disabled, so the evaluation driver's tests (`tests/deploy/test_eval_driver.py`) run locally.
- **Evaluation:**
  - `deploy/eval/driver.py` sends `files: []` (`:639`) and collects only `.mp4` files from the chat outputs (`:698`).
  - `--phase` accepts `baseline|after|smoke`. With no `--request`, every entry runs.
  - Every attempt gets a fresh `runs/<phase>/<request>/r<n>-a<m>/`.
  - The stored transcript (WebUI's chat JSON) holds tool results but not tool-call arguments. Checked on 27 at `runs/after/explainer-bread-browning/r1-a1`: the only `create_file` text in it is the kit guide. So the transcript cannot supply a run's final `script.json`.

## Goals / Non-Goals

**Goals:**

- `qwen3.8-27b` can produce a report video in which every figure on screen and in speech traces to the user's text, an imported table cell, or a kit derivation of those.
- Explainer scripts and their videos are unchanged.
- Inputs fail loud. Every error names the slot, the scene, the field or data item, and the fix.
- The improvement is measured against a baseline taken before any change: blind pairs plus a material check.

**Non-Goals:**

- Course and promo presets.
- 9:16 output, 3D scenes and sound effects.
- A logo upload or a custom brand colour.
- Importing several sheets at once, pivoting, merged cells, or reading Excel chart objects.
- Formulas beyond the six named operations. There is no expression language.
- `custom` scenes in reports.
- Chinese ratio words other than 一半 as quote sources.
- Proving inside the kit that a `quote` is the user's real wording. The kit cannot see the chat; the evaluation proves it.
- Changing `generate_speech`, image generation, the video switch or skill gating.
- New npm dependencies, a second kit or template directory, or a script `version` 2.

## Decisions

1. **One kit, switched by `preset`.**
   - The script schema becomes a union of two strict objects:
     - the existing explainer object, which has no `preset` key and is the current schema unchanged;
     - a report object with `preset: "report"`.
   - The report reuses the slot keys `hook`, `chapters`, `summary` and `endCard`. Its `hook` holds a `cover` scene and its chapters are sections. The three places that spell the playback order (Context) keep one order for both presets.
   - The report branch's kinds are its approved kinds (Decision 8). Before the first report approvals, the branch exists but no report script validates, so the union changes nothing for explainers.
   - `kit new <name> --preset report` writes the report example. Option parsing for `--preset` and `--sheet` is one small parser in `kit.mjs`.
   - Alternative rejected: a separate `report.json` with its own commands. That duplicates every module, against Code Canonicality.
   - Alternative rejected: `version: 2`, which forces explainer scripts to migrate for no gain.

2. **One data module, given its tables explicitly.**
   - A plain `.mjs` module in `bin/`, with no `node:` imports, resolves `data` from a script and a map of tables. It reads cells, computes derivations, formats display text and expands `{<id>}` placeholders.
   - `validateScript(text, tables)` gains a second argument. The CLI reads the `data/<table>.json` files of the tables the script references (named by a `from` item or by a scene's `table` or `series`) and passes them in. `kit render` passes the same tables to the renderer as input props, and `Explainer.tsx` validates with them.
   - Expansion happens only for `preset: "report"`. It is applied at the three playback places, so captions, speech, voice stems, scene timing and probe text all see the expanded text. Explainer stems are unchanged, even for a narration that contains a literal `{x}`.
   - The passing-check hash adds the `data/<table>.json` of every table the script references, in the same sense. Re-importing a table after a passing check makes `kit render` refuse until the check runs again.
   - Alternative rejected: expanding inside each scene component. Speech and captions would then see different text from the picture.

3. **Data items and the percent convention.**
   - Each item has:
     - `id`, matching `[a-z][a-z0-9_]{0,31}`;
     - `label`;
     - `unit`, which may be empty;
     - exactly one source: `value` with `quote`, `from: {table, row, column}`, or `derive: {op, of}`.
   - `value` is a decimal string (`"1260"`, `"3.50"`, `"-5"`), so the user's digits, including trailing zeros, are kept as written.
   - Percent convention: a `%` value is in percent units (`"93"` means 93%), and a `个百分点` value counts points.
   - Quote rule:
     - after thousands separators are removed from the quote, the quote must contain the value immediately followed by its unit (`1260万元`, `93%`, `5个百分点`);
     - the one word form accepted is 一半 for a `%` item of value `50`.
   - The six operations are below. Derivations may reference derivations. A cycle, an unknown id, a unit mismatch or a zero divisor fails, naming the items.
     - `sum`: two or more items of one non-percent unit.
     - `diff`: two items of one non-percent unit.
     - `product`: an item times a `%` item divided by 100, in the first item's unit. For example, 42家 × 50% gives 21家.
     - `ratio`: part ÷ whole × 100, as `%`. Both must have one unit.
     - `growth`: (current − base) ÷ base × 100, as `%`.
     - `pp-diff`: the difference of two `%` items, as `个百分点`.
   - `sum` and `diff` on `%` or `个百分点` items fail and point to `pp-diff`.

4. **Number display for reports.**
   - A `value` displays exactly as its string. A table cell displays as its stored display text (Decision 6).
   - Derived `%` and `个百分点` values round half away from zero to at most one decimal, without a trailing `.0`. Other derived values round half away from zero to the largest decimal count among their operands. A negative value shows `-`.
   - A figure displays the number text followed by its unit.
   - A report figure up to 12 code points fits every figure-bearing scene, and `kit check` refuses a longer one, telling the model to ask the user for a larger unit.
   - Report figures appear at their final value: no count-up.
   - `formatCount` and count-up keep serving explainers unchanged.
   - Alternative rejected: reusing `formatCount`, which would show 12345 as `1.2万`.

5. **No bare figures, with period tokens and table labels allowed.**
   - In a report, an Arabic digit in narration or an on-screen string field fails unless it is in one of these:
     - a placeholder;
     - a period token: `\d{4}年(度)?`, `\d{1,2}月(份)?`, `Q[1-4]`, `H[12]`, `第[1-4]季度`;
     - a label taken verbatim from an imported table's header or first column.
   - Chinese numerals are allowed (第三季度, 一半). Quantities written that way are a stated gap, which the material check covers (Decision 10).
   - Field length limits apply to the expanded text, like the 16-character caption block limit.

6. **`kit data` runs Python, and the table file format is fixed here.**
   - `kit.mjs data "<path>" [--sheet <name>]` runs `python3 -I` on a reader script shipped in `bin/`.
   - Table name: the file stem in lower case, with whitespace runs turned into `-`, keeping only `a-z 0-9 -` and CJK characters, at most 40 characters. `q3 销售.xlsx` becomes `q3-销售`. An empty name is refused.
   - Output, `data/<table>.json`:

     ```json
     {"version": 1,
      "source": {"file": "…", "sheet": "…", "sha256": "…"},
      "columns": ["…", …],
      "rows": [{"label": "…", "cells": [{"value": 1260, "text": "1260"} | null, …]}]}
     ```

     `columns` holds the header cells after the first. Each row's `label` is its first cell. `text` is the cell's display text.

   - CSV is decoded as UTF-8, with or without a BOM. Other encodings are refused, with a message to save as UTF-8. A cell parses as a number when it is a decimal, optionally with thousands commas or a trailing `%`. A `%` cell's value and text are the number without the `%` (`93%` gives value 93 and text `93`), with unit `%`; thousands commas are dropped from the text. Other text stays text.
   - xlsx is read with `data_only=True`. A numeric cell's text applies its number format for the formats `General`, `0`, `0.0…`, `#,##0…` (commas dropped) and `0%`/`0.0…%` (shown in percent units, unit `%`). Any other format is refused, naming the cell. Float leftovers round to the format's decimals. Merged ranges are refused, naming the range.
   - It refuses:
     - more than 50 data rows or 12 columns, or no data rows;
     - an empty or duplicate header;
     - an empty or duplicate row label;
     - an unknown sheet;
     - a path outside `/mnt/user-data/files/` or of another type.
   - Re-importing the same table name replaces the file. The passing-check hash then no longer matches (Decision 2).
   - The CSV path uses only the standard library. The xlsx path needs `openpyxl`. `template-tests.yml` adds `actions/setup-python` with `pip install openpyxl==3.1.5`, and verifies with `python3 -I -c 'import openpyxl'`. The PR flags this as a CI change.
   - Alternative rejected: an xlsx reader in Node. No zip reader is installed, and new npm dependencies are excluded.

7. **Report scenes and their contents.**
   - The report spec's "Report scene contents" requirement fixes each kind's fields and limits. They live in `LIMITS.content`, under report-only kinds.
   - Series kinds (`trend`, `ranking`, `table`) reference a table range or a list of item ids. Single-figure fields reference one item id.
   - The reused explainer kinds that carry figures (`key-number`, `chart`) take item ids in the report branch, and they share their explainer components. Those components accept display text and value props: report props skip `formatCount` and count-up, and explainer props are unchanged.
   - A bar axis starting at 0 is a component invariant, proven by render tests. No script field can set the axis.

8. **Per-preset approvals and themes.**
   - Report approvals use ids `report:<kind>` and `report:theme`. Existing entries, which are the explainer's, stay unchanged. A reused kind enters reports only with its own `report:<kind>` approval of a sample rendered in the report themes.
   - The gallery renders each preset's candidates in that preset's theme candidates. The page records one theme pick per preset.
   - `src/kit/theme.ts` gains `report-light` and `report-dark` as candidates. After the pick, the other one is deleted.
   - `Root.tsx` and `check-rules.mjs` select the theme by `script.preset`.
   - The gate tests become per preset (`registry-approvals`, `theme`, `scenes` and `gallery`). Each batch of report kinds lands with its user review, approval entries and registration in one PR, as in the explainer change.

9. **Content follows the material.**
   - `report-kit.md` makes step 0 a checklist of what the video needs:
     - period;
     - department or subject;
     - each figure's unit and scope;
     - which table columns to use;
     - any causes the user asks to explain.
   - The model checks the list against the message and attachments, and asks the user once when an item is missing.
   - The kit cannot see the chat, so the evaluation checks this.
   - `kit status`, after a passing report check, prints three report questions next to the image questions, and the model answers them against the material:
     - every figure carries its unit;
     - compared figures share their scope;
     - every statement is backed by the material.

10. **Figure sources and the material check.**
    - For a report, `kit render` also publishes `/mnt/user-data/files/<name>.figures.json`. It lists every data item with its label, display text and source (the quote, the table cell, or the operation and its operands with their display text), and every table cell a scene shows directly (`table`, `series`), with its table, row, column and display text.
    - The same list prints from `kit status` after a passing check, so the model sees each derivation.
    - The file doubles as a figure-source list the user can audit.
    - The driver collects it with the MP4. This replaces reading the transcript, which does not hold the script (Context).
    - The material check script reads the figures list and the request and attachment text. It does the following:
      - matches each figure (number text plus unit) to a request figure, an attachment cell's display text or a listed derivation;
      - flags Chinese-numeral quantities found in the figures list's labels and in the expanded narration, for hand review;
      - reports every unmatched figure.

      The expanded narration is carried in the figures file.

    - By hand, against key frames and the narration, the reviewer checks every qualitative statement and records each as backed, unbacked, or slogan. A slogan is an opening or closing line with no figure and no factual claim.
    - `report-before` videos (free-form) have no figures file. They are checked by hand from frames and audio, for comparison only.

11. **Evaluation selection.**
    - New request entries carry `set`:
      - `"report"` for the four new judged requests;
      - `"report-smoke"` for `report-unclear`.
    - `report-sales-q3` gains `set: "report"` and `repetitions: 2`; its id, kind and prompt stay. Every other existing entry stays byte-identical.
    - With no `--request`:
      - report phases run `set: "report"`;
      - `baseline`, `after` and `smoke` run entries without `set`.
    - Explicit requests:
      - a `set` entry is refused in `baseline`, `after` and `smoke`;
      - an entry without `set` is refused in report phases;
      - `report-unclear` runs only when named with `--request`, in a report phase, so its before and after runs live in separate phase directories.
    - Attachments are checked when the plan is built. A missing file refuses the whole run before any chat.
    - The driver records `asked_user` (Decision 9): true when no MP4 was published and the final assistant message contains `？` or `?`.
    - The `report-before` package (`ocu-e3be359-webui-71b4f18`) and its WebUI image stay on 27 until acceptance ends, so `report-after` can use the same WebUI digest.
    - The release candidate for `report-after` is OCU `main` plus the held routing branch (task 6.3), and both SHAs are recorded.

## Risks / Trade-offs

- [The model invents a `quote`.] → The quote rule proves internal consistency only. The material check compares against the real request and gates acceptance. The skill tells the model to copy the quote verbatim.
- [Placeholders confuse `qwen3.8-27b`.] → The example script and `report-kit.md` show them. A bare figure fails and names the item ids that display it.
- [Period tokens let a bare 4-digit figure through as `2026年`.] → Only digits followed by `年` or `年度` pass as a year. The hand review checks periods against the request.
- [A report needs a computation outside the six operations.] → It fails loudly. The evaluation shows whether a seventh is needed; adding one is a later change, not a workaround.
- [A user's xlsx has merged cells, several header rows or an unusual number format.] → It is refused, naming the cell or range. The model asks the user for a simple table (Decision 9).
- [Publishing `<name>.figures.json` adds a file to the user's Files tab.] → It is a feature for report users (where each number came from), and only reports get it.
- [The eval runs on one shared host with a fixed dmxapi budget.] → The ten runs per phase reuse the existing stack, with no new services. A run with the wrong release candidate is caught early, because each attempt's transcript must show `--preset report`.

## Migration Plan

- Kit slices merge with no entry point. The schema accepts reports once kinds are approved, but `SKILL.md` still sends reports to `free-form.md`.
- The workspace image is rebuilt with each OCU release as usual. There is no database change.
- The `report-after` release candidate is built from OCU `main` plus the held routing branch, and deployed on 27 per `UPGRADE.md`.
- If acceptance passes, the routing PR merges and the WebUI pin moves.
- If acceptance fails, the routing PR is closed. The results are recorded in this change, which is not archived. The merged kit slices remain unreachable from the skill.
- Rollback is the previous release package. Explainer behavior is unchanged in every slice. A test enforces this: the explainer fixtures' validation, timeline, voice stems and probe output must equal `e3be359`.

## Open Questions

- The exact text of the four new requests, `report-unclear` and the two attachment fixtures. Task 1.4 drafts them and the user confirms them before the before run. The wording changes no spec or task.
- The render-success threshold, set from the before run, and the a-priori check-pass threshold. The user confirms both before the after run (task 1.7).

## Not yet specified

- Report checklist questions beyond the three in Decision 9. Which further questions help `qwen3.8-27b` depends on the gallery and the before-run failures, so the question set is not yet clear.

## Sibling surfaces

- `skills/public/remotion/free-form.md` stays the route for course and promo videos. It is untouched.
- `SKILL.md`'s frontmatter description, which names reports as free-form, changes with the routing in task 6.3.
- `ocu-video-music` ducking applies to report renders unchanged.

## Sketch seams under test

- **The kit command line in a project directory** (`node bin/kit.mjs …` on fixture scripts, tables and audio).
  - It is the highest seam the model touches. It covers the preset switch, data resolution, placeholders, `kit data`, the report check rules, the figures file and explainer non-regression.
  - It runs under `node --test` in `template-tests.yml`, with `openpyxl` installed.
- **The built workspace image** (`tests/test-docker-image.sh`): an offline report fixture going through `new --preset report` → `data` → `voice-import` → `timeline` → `check` → `render` in the real image. It runs on the release build host for the PR's commit, and the output is recorded in the PR.
- **The evaluation driver**:
  - `tests/deploy/test_eval_driver.py`, run locally, for selection, attachments and `asked_user`;
  - against the `ocu-eval` stack, a report request with an attachment, end to end through WebUI's chat and files APIs. It is the only seam that exercises the model and the upload path.
