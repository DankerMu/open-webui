# Proposal

Source plan: `docs/plans/2026-11-27-ocu-video-report-kit.md`. Its Decision Ledger holds the user's rulings of 2026-11-27, and the user confirmed the shared understanding on the same day.

## Why

Report videos (工作汇报) still go through `free-form.md`: the model writes the whole Remotion composition itself. The layout of the two existing report runs on 27 is acceptable. The problem is that their content cannot be trusted:

- The model computed figures in its head that the request never gave: 去年同期 1068万, 上季度回款率 88%, 华东 21 家.
- It invented statements that are not in the request: 重点客户板块表现突出, 现金流状况持续向好.

A single wrong figure voids a report. The science-explainer kit already proves the approach of the model filling a validated `script.json` and tested scenes rendering it. This change extends that kit to reports, and makes faithfulness to the user's material the primary goal.

## What Changes

- **Report preset in the existing kit (OCU `remotion-template`).**
  - `script.json` gains an optional top-level `preset`. A script without it is a science explainer and validates and renders exactly as today.
  - `preset: "report"` selects the report skeleton: a cover, 2–5 sections of 1–4 scenes, a summary and an end card, 60–180 s.
  - Every figure lives in a top-level `data` list, and scenes and narration only reference it. A data item has one of three sources:
    - user text, as a decimal string with a `quote` that must contain the value followed by its unit;
    - a cell of an imported table;
    - a derivation (`sum`, `diff`, `product`, `ratio`, `growth`, `pp-diff`) that the kit computes in code.
  - Percent values are in percent units. Figures display as supplied, with no 万/亿 rescaling and no count-up. Derived percentages show at most one decimal.
  - Narration writes figures only as `{<id>}` placeholders, which the kit expands before speech. A bare digit in narration or on-screen text fails, except in period tokens (`2026年`, `Q3`) and labels taken verbatim from an imported table.
  - Reports allow no `custom` scene.
- **`kit data` (OCU).** It imports one `.csv` or `.xlsx` file, the first or a named sheet, from `/mnt/user-data/files/` into the project's `data/<table>.json`. A header row is required, the limit is 50 rows by 12 columns, and values and their display text are read by python (`openpyxl`, `csv`). A malformed file, merged range or unsupported number format is refused, naming the row and column. Imported tables are covered by the passing-check hash.
- **Report scenes and theme (OCU).**
  - New candidate kinds: `cover`, `kpi-grid`, `target-progress`, `share`, `trend`, `ranking`, `table`.
  - The explainer kinds that carry figures take data references in a report.
  - A light and a dark report theme.
  - Every kind, including each reused explainer kind, and the theme enter the kit only after the user approves them in the gallery under `report:` ids, batch by batch. The approval gate and the theme selection become per preset.
- **Report check rules (OCU).**
  - Data item structure and the quote rule.
  - Derivations: valid operands, no division by zero, and matching units.
  - No bare figures.
  - Bar axes start at 0, and the shares of a `share` scene do not exceed the whole.
  - Every table reference resolves.
  - Report questions and a list of every derivation, printed by `kit status`.
- **Figure sources (OCU).** A report render publishes `<name>.figures.json` beside the MP4. It lists every figure with its source and the expanded narration, for the user to audit and for the evaluation's material check.
- **Faithfulness to the user's material (OCU skill).** Every qualitative statement must come from the user's message or attachments. When the material does not settle something the video needs, the model asks the user once before writing `script.json`. When the material is enough, it does not ask.
- **Report evaluation (OCU `deploy/eval`).**
  - Four new report requests, drafted by us and confirmed by the user. Two of them carry an attachment, one `.csv` and one `.xlsx`, under `deploy/eval/fixtures/`. Together with `report-sales-q3`, whose repetitions go from 1 to 2, each runs twice.
  - One `report-unclear` smoke request lacks the period and the units. It shows whether the model asks, and it is not judged.
  - The driver uploads attachments through the WebUI files API, as production does. It collects the figures file and records whether the model asked the user.
  - New phases `report-before` and `report-after` keep these runs apart from the explainer's `baseline` and `after`. Report entries carry `set`, which selects them.
  - The after run uses a release candidate built from OCU `main` plus the held routing branch.
  - Acceptance:
    - the user blind-judges ten pairs, and the new version wins at least 8;
    - a material check of every after video (a script over its figures file, plus a hand review of key frames and statements) finds zero figures that do not trace to the request, the attachment or a kit derivation, and zero unbacked statements;
    - the render-success and check-pass thresholds are met.
- **Skill routing (OCU).** `SKILL.md` routes reports to the kit through a new `report-kit.md` reference. The routing merges only after acceptance passes. The kit slices before it have no entry point.
- **WebUI.** The `constraints.yaml` OCU pin moves to the merged OCU commit after acceptance.
- **Not changed:** the science-explainer script format and its output, `generate_speech`, the image-generation code, the video switch and skill gating.

## Capabilities

### New Capabilities

- `ocu-video-report-kit`: the report preset of the sandbox kit, which covers:
  - the `preset` switch and the report skeleton;
  - `data` items, derivations and placeholders;
  - number display;
  - `kit data`;
  - report scenes and theme behind the gallery gate;
  - report check rules;
  - the rule that content follows the user's material, asking when it is unclear.

### Modified Capabilities

- `ocu-video-explainer-kit`: the kit may use the image's `python3` and `openpyxl`; 万/亿 formatting is scoped to explainers; the check covers report rules and imported tables; the approval gate and theme pick become per preset; and the routing sends reports to the kit. The routing merges only after report acceptance.
- `ocu-video-evaluation`: the shared-image rule and the explainer acceptance are scoped to their own comparison; the requirement adds the report request set with attachments, `set`-based selection, the `report-before` and `report-after` phases, the `report-unclear` record, and report acceptance (blind pairs plus the material check).

## Impact

- OCU repository:
  - `remotion-template/`: `bin/script-schema.mjs`, `bin/kit.mjs`, a new `bin/` module for `kit data`, the check modules, `src/kit/` for the theme, number display and new scenes, `gallery/approvals.json`, and `tests/`. No new npm dependency and no `package.json` scripts.
  - `skills/public/remotion/`: `SKILL.md` and a new `report-kit.md`.
  - `.github/workflows/template-tests.yml`: Python with `openpyxl` for the `kit data` tests (a flagged CI change).
  - `deploy/eval/`: `requests.json`, where non-report entries stay byte-identical; `driver.py` and `run.sh` for attachments, selection and phases; a material check script; and the new `fixtures/`.
- WebUI repository: this change, the source plan, a decision record, and the OCU pin after acceptance.
- Deployment: the workspace image is rebuilt, because the template lives in it. No database change.
- Shared host 210.77.77.27: report runs on the existing `ocu-eval` stack, written under `runs/report-before/` and `runs/report-after/`.
