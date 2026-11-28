# Spec Delta

## Purpose

The report preset of the sandbox video kit. It turns a user's report material (message text and an optional CSV or Excel table) into a report video in which every figure traces to that material or to a kit computation. Explainer videos stay unchanged.

## ADDED Requirements

### Requirement: A preset key selects the report script

`script.json` SHALL accept an optional top-level `preset`.

A script without `preset` SHALL be validated by exactly the explainer schema. It SHALL produce the same `timeline.json`, voice stems and probe output as at OCU `e3be359`. A script with `preset: "report"` SHALL be validated by the report schema. Any other value SHALL fail, naming the allowed values.

`node /opt/remotion-template/bin/kit.mjs new <name> --preset report` SHALL create the project with a report example `script.json` that passes the report schema unchanged. Without `--preset`, `new` SHALL behave as before.

#### Scenario: Explainer script unchanged

- **WHEN** every explainer fixture script and the explainer example are validated, timed and probed after this change
- **THEN** each validates, and its `timeline.json`, voice stems and probe output equal those at `e3be359`

#### Scenario: Literal braces in an explainer

- **WHEN** an explainer narration block contains the text `{x}`
- **THEN** it is not expanded and its voice stem is unchanged

#### Scenario: Unknown preset

- **WHEN** a script sets `preset: "course"`
- **THEN** validation fails at `preset`, naming `report` as the only allowed value

#### Scenario: Report example

- **WHEN** the model runs `new q3-report --preset report`
- **THEN** the project's `script.json` has `preset: "report"` and passes validation unchanged

### Requirement: The report skeleton

A report script SHALL hold:

- a title;
- a music choice;
- `data`;
- a `hook` slot holding one `cover` scene;
- two to five sections in `chapters`, each with a name of at most 6 characters and one to four scenes;
- one `summary` scene;
- one `end-card` scene last.

The narration rules, the image rule and the 60–180 s length SHALL be those of the explainer. Music ducking SHALL work as for explainers.

The body kinds of a report SHALL be the approved subset of these candidates:

- new: `kpi-grid`, `target-progress`, `share`, `trend`, `ranking`, `table`;
- reused from the explainer: `key-number`, `chart`, `comparison`, `concept-card`, `process-steps`, `timeline`, `image-callouts`.

A report SHALL NOT hold a `custom` scene.

#### Scenario: Too few sections

- **WHEN** a report script has one section
- **THEN** validation fails at `chapters`, naming the limit 2 to 5

#### Scenario: Explainer-only kind in a report

- **WHEN** a report section holds a `question` scene
- **THEN** validation fails at that scene's `kind`, listing the report body kinds

#### Scenario: Custom scene in a report

- **WHEN** a report section holds a `custom` scene
- **THEN** validation fails at that scene, stating that reports allow no custom scene

### Requirement: Every figure comes from a data item

A report script SHALL list its figures in `data`.

Each item has:

- an `id` matching `^[a-z][a-z0-9_]{0,31}$`, unique in the script;
- a `label`;
- a `unit`, possibly empty;
- exactly one source, described below.

Values are in the units shown: a `%` value of `"93"` means 93%, and a `个百分点` value counts points.

The sources:

- **`value` with `quote`.** `value` is a decimal string: an optional `-`, digits, and an optional `.` followed by digits. `quote` is a string of the user's words. After thousands separators are removed from `quote`, it SHALL contain the value immediately followed by the unit. The one word form accepted is 一半, for a `%` item whose value is `50`.
- **`from: {table, row, column}`.** It names a table imported by `kit data`, a row label and a column header. It SHALL resolve to one numeric cell. The item takes that cell's value and display text. The cell's unit, if it has one (`%`), SHALL equal the item's unit.
- **`derive: {op, of}`.** `op` is one of:
  - `sum`: two or more items of one unit, which is not `%` or `个百分点`;
  - `diff`: two items of one unit, which is not `%` or `个百分点`;
  - `product`: an item and a `%` item, giving item × percent ÷ 100 in the first item's unit;
  - `ratio`: part and whole of one unit, giving part ÷ whole × 100 in `%`;
  - `growth`: current and base of one unit, giving (current − base) ÷ base × 100 in `%`;
  - `pp-diff`: two `%` items, giving their difference in `个百分点`.

The kit SHALL compute every derivation. Derivations MAY reference derivations.

Each of the following SHALL fail, naming the items involved:

- a cycle;
- a missing id;
- an unknown table, row or column;
- a cell that is empty or not a number;
- a unit mismatch;
- `sum` or `diff` on percentages;
- a zero divisor.

`kit status` SHALL list every derived item with its operation and its operands' display text after a passing check.

#### Scenario: Quote does not contain the value and unit

- **WHEN** an item has `value: "1260"`, `unit: "亿元"` and `quote: "季度销售额1260万元"`
- **THEN** validation fails at that item, stating that `1260亿元` does not occur in its quote

#### Scenario: Thousands separators in the quote

- **WHEN** an item has `value: "1260"`, `unit: "万元"` and `quote: "销售额1,260万元"`
- **THEN** the item validates

#### Scenario: Half as a percent

- **WHEN** `east_share` has `value: "50"`, `unit: "%"`, `quote: "其中华东区占一半"`, and `east_clients` is `derive: {op: "product", of: ["clients", "east_share"]}` over `clients` of 42 家
- **THEN** both validate, and `east_clients` displays `21家`

#### Scenario: Growth computed by the kit

- **WHEN** `sales` is 1260 万元, `sales_ly` is 1068 万元, and `sales_growth` is `derive: {op: "growth", of: ["sales", "sales_ly"]}`
- **THEN** the kit computes (1260 − 1068) ÷ 1068 × 100 and `sales_growth` displays `18%`

#### Scenario: Percentage difference uses pp-diff

- **WHEN** an item is `derive: {op: "diff", of: ["collection", "collection_last"]}` over two `%` items
- **THEN** validation fails at that item, pointing to `pp-diff`
- **AND** with `op: "pp-diff"` over 93% and 88%, the item displays `5个百分点`

#### Scenario: Derivation cycle

- **WHEN** item `a` derives from `b` and `b` derives from `a`
- **THEN** validation fails naming both items as a cycle

#### Scenario: Table cell resolves

- **WHEN** an item has `from: {table: "q3-销售", row: "华东", column: "销售额"}`, and that cell holds 630 with text `630`
- **THEN** the item's value is 630, read from the table file, and it displays `630` plus its unit

#### Scenario: Unknown table column

- **WHEN** an item names column `回款` and the table has no such header
- **THEN** validation fails at that item, listing the table's columns

### Requirement: Figures display as supplied

In a report:

- A `value` SHALL display exactly as its string.
- A table cell SHALL display as its stored display text.
- Neither SHALL be rescaled to 万/亿 or shown with thousands separators.
- A derived `%` or `个百分点` value SHALL round half away from zero to at most one decimal, without a trailing `.0`.
- Other derived values SHALL round half away from zero to the largest decimal count among their operands.
- A negative value shows `-`.
- A figure displays its number text followed by its unit.
- Report figures SHALL appear at their final value, without counting up.
- A displayed figure longer than 12 code points SHALL fail `kit check`, telling the model to ask the user for a larger unit.

Explainer scripts SHALL keep their existing number formatting and count-up.

#### Scenario: Large value is not rescaled

- **WHEN** a report item is `"12345"` with unit `元`
- **THEN** every scene and caption that shows it reads `12345元`, not `1.2万`

#### Scenario: Trailing zero kept

- **WHEN** a report item is `"3.50"` with unit `亿元`
- **THEN** it displays `3.50亿元`

#### Scenario: Percentage rounding

- **WHEN** ratios resolve to 84, 84.37 and 84.25 percent
- **THEN** they display `84%`, `84.4%` and `84.3%`

#### Scenario: Derived count rounding

- **WHEN** `product` of 43 家 and 50% gives 21.5
- **THEN** it displays `22家`

#### Scenario: No count-up

- **WHEN** a report `key-number` shows `1260万元`
- **THEN** every frame after its entrance starts shows `1260`, never an intermediate value

### Requirement: Narration and on-screen text carry figures only by placeholder

In a report, narration blocks and on-screen string fields SHALL reference figures as `{<id>}`.

The kit SHALL expand every placeholder to the item's display text. The expanded text is what is:

- captioned;
- spoken;
- hashed into voice stems;
- timed;
- probed;
- measured against the 16-character block limit and every on-screen field limit.

An Arabic digit SHALL fail unless it is part of one of these:

- a placeholder;
- a period token: `\d{4}年`, `\d{4}年度`, `\d{1,2}月`, `\d{1,2}月份`, `Q[1-4]`, `H[12]` or `第[1-4]季度`;
- a label shown verbatim from an imported table's header or first column.

A placeholder naming an unknown id SHALL fail. The failure names the field. For a bare figure, it also names the data ids whose display text equals it.

#### Scenario: Bare figure in narration

- **WHEN** a narration block reads `回款率达到93%` and item `collection` displays `93%`
- **THEN** validation fails at that block, suggesting `{collection}`

#### Scenario: Period on the cover

- **WHEN** a cover's period reads `2026年第三季度`
- **THEN** it validates

#### Scenario: Bare figure in a label

- **WHEN** a `kpi-grid` caption reads `去年同期1068万`
- **THEN** validation fails at that field, because `1068` is not a period token

#### Scenario: Expanded block too long

- **WHEN** a block `{sales}，同比增长{sales_growth}` expands to more than 16 characters
- **THEN** validation fails at that block, showing the expanded text and the limit

#### Scenario: Raw block over 16 that expands within 16

- **WHEN** a block reads `销售额{sales_total_q3}`, which is 20 characters raw and 9 when expanded
- **THEN** it validates

#### Scenario: Voice follows the expansion

- **WHEN** a data value changes and the narration text does not
- **THEN** the affected blocks get new voice stems, and `kit timeline` reports them as missing audio until speech is regenerated

### Requirement: Tables are imported by the kit

`node bin/kit.mjs data "<path>" [--sheet <name>]` SHALL accept a `.csv` or `.xlsx` file inside `/mnt/user-data/files/`.

The table name is the file stem, normalized as follows:

- lower case;
- whitespace runs become `-`;
- only `a-z`, `0-9`, `-` and CJK characters are kept;
- at most 40 characters.

An empty name SHALL be refused. The first row SHALL be the header. Each later row's first cell is its row label.

For CSV:

- the file SHALL be UTF-8, with or without a BOM;
- a cell is a number when it is a decimal, optionally with thousands commas or a trailing `%`;
- a `%` cell has unit `%`, and its value and display text are the number without the `%`;
- thousands commas are dropped from the display text.

For xlsx:

- it reads the named sheet or the first one, taking cached values for formula cells;
- a numeric cell's display text applies its number format, for the formats `General`, `0`, `0.0…`, `#,##0…` and `0%`/`0.0…%`;
- thousands separators are dropped, and percent formats give percent units with unit `%`;
- a float leftover rounds to the format's decimals.

It SHALL refuse each of the following, naming the row and column, the cell or the range where one applies:

- another encoding;
- another number format;
- a merged range;
- more than 50 data rows or 12 columns, or no data row;
- an empty or duplicate header;
- an empty or duplicate row label;
- an unknown sheet;
- a file outside that directory or of another type.

On success it SHALL write or replace `data/<table>.json` and print the table name, the column headers and the first five rows.

#### Scenario: Excel import

- **WHEN** the model runs `kit data "/mnt/user-data/files/q3 销售.xlsx"` on a sheet with a header row and 6 data rows
- **THEN** `data/q3-销售.json` holds the 6 rows, and the output lists the table name `q3-销售` and the headers

#### Scenario: Percent-formatted cell

- **WHEN** an xlsx cell holds 0.93 with format `0%`
- **THEN** its value is 93, its unit is `%`, and its text is `93`

#### Scenario: Float leftover

- **WHEN** a formula cell caches 1260.3000000000002 with format `0.0`
- **THEN** its text is `1260.3`

#### Scenario: CSV with separators and a BOM

- **WHEN** a UTF-8 CSV with a BOM has a header `地区` and a cell `1,260`
- **THEN** the first column header is `地区`, and the cell's value is 1260 with text `1260`

#### Scenario: Merged range refused

- **WHEN** the sheet has a merged range `A1:B1`
- **THEN** the command fails naming `A1:B1` and writes nothing

#### Scenario: Row limit

- **WHEN** a table has 50 data rows, and another has 51
- **THEN** the first imports, and the second fails naming the limit

### Requirement: Report scene contents

Each report kind SHALL hold these fields. A figure field is an item id, and a series is either `{table, column, rows?}` (rows default to all, in table order) or a list of item ids.

| Kind              | Fields                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `cover`           | `title` (≤16), `subject` (≤12), `period` (≤12)                                                       |
| `kpi-grid`        | `items`: 2–4 of `{figure, label (≤8), compare?}`, where `compare` is a `growth` or `pp-diff` item id |
| `target-progress` | `actual`, `target` (one unit), `label` (≤12). The kit shows actual ÷ target × 100 in `%`.            |
| `share`           | `whole`, and `parts`: 2–5 item ids of the whole's unit, with `title` (≤12)                           |
| `trend`           | `type` (`bar` or `line`), `series` of 2–8 points, `title` (≤12). The latest point is highlighted.    |
| `ranking`         | `series` of 3–8 points, `title` (≤12). Points are drawn in descending order.                         |
| `table`           | `table`, `columns`: 1–3 headers, `rows`: 1–5 row labels, `title` (≤12)                               |
| `key-number`      | `figure`, `label` (≤12)                                                                              |
| `chart`           | the explainer chart, with `points` as a series                                                       |

Reused text kinds keep their explainer fields under the placeholder rule.

#### Scenario: Too many KPIs

- **WHEN** a `kpi-grid` holds 5 items
- **THEN** validation fails at its `items`, naming the limit 2 to 4

#### Scenario: Trend from a table column

- **WHEN** a `trend` has `series: {table: "monthly", column: "销售额"}` and the table has row labels `7月`, `8月` and `9月`
- **THEN** it validates, and the chart shows three points labelled `7月`, `8月`, `9月`, with `9月` highlighted

### Requirement: Report scenes keep figures honest

`kit check` SHALL fail, naming the scene, when:

- a `share` scene's parts exceed its whole;
- a `trend` or `ranking` series mixes units;
- a `target-progress` actual and target differ in unit.

Bar charts in reports SHALL start their axis at 0. No script field can change that, and render tests SHALL prove it.

#### Scenario: Parts exceed the whole

- **WHEN** a `share` scene's parts sum to 120 of a whole of 100
- **THEN** `kit check` fails at that scene, stating the sum and the whole

#### Scenario: Mixed units in a series

- **WHEN** a `ranking` lists items in `万元` and `家`
- **THEN** `kit check` fails at that scene, naming both units

### Requirement: Report figures are published with their sources

After a report renders, `kit render` SHALL publish `/mnt/user-data/files/<name>.figures.json` beside the MP4, and only when the MP4 is published. It lists:

- every data item with its label, display text and source (the quote, the table and cell, or the operation and its operands' display text);
- every table cell a `table` scene or a table series shows, with its table, row, column and display text;
- the expanded narration of every scene.

An explainer render SHALL publish no such file.

#### Scenario: Figures file beside the video

- **WHEN** a report named `q3-report` renders successfully
- **THEN** `/mnt/user-data/files/q3-report.figures.json` exists, and it lists `sales_growth` as `growth` of `1260万元` and `1068万元`, displaying `18%`

### Requirement: Report scenes and theme pass the gallery gate

Every report scene kind and both report theme candidates (`report-light`, `report-dark`) SHALL have a gallery sample rendered in the report themes, and a recorded approval with id `report:<kind>` or `report:theme`, before they enter the kit. A kind reused from the explainer SHALL need its own `report:<kind>` approval. The rules of the explainer gallery gate apply.

After the pick, the kit SHALL keep the picked report theme and delete the other. Reports SHALL render and be probed with the picked report theme, and explainers with `light`.

#### Scenario: Unapproved report kind

- **WHEN** the approvals file marks `report:ranking` `drop`
- **THEN** `ranking` is absent from the report schema, the registry's report kinds, the JSON Schema's report branch, the report example and `report-kit.md`

#### Scenario: Reused kind without a report approval

- **WHEN** `comparison` is approved for explainers and has no `report:comparison` entry
- **THEN** a report holding a `comparison` scene fails validation, and explainers still accept `comparison`

### Requirement: Content follows the user's material

`report-kit.md` SHALL make its first step a material checklist. Before writing `script.json`, the model lists what the video needs and checks each item against the user's message and attachments:

- period;
- department or subject;
- each figure's unit and scope;
- the table columns to use;
- any causes the user asks to explain.

When an item is missing or ambiguous, the model SHALL ask the user once, in one message, and wait. When nothing is missing, it SHALL not ask.

Every qualitative statement in narration or on screen SHALL restate or summarize the user's material. Opening and closing slogans with no figure and no factual claim are allowed.

After a passing report check, `kit status` SHALL print these three report questions next to the image questions, to be answered against the material:

1. Does every figure carry its unit?
2. Do compared figures share their scope?
3. Is every statement backed by the material?

#### Scenario: Missing period

- **WHEN** a user asks only 「把我们的汇报做成视频」 and attaches a table without a period
- **THEN** the skill directs the model to ask for the period and subject before writing `script.json`

#### Scenario: Complete material

- **WHEN** the request states the department, the period and every figure with its unit
- **THEN** the skill directs the model to proceed without asking

#### Scenario: Report questions printed

- **WHEN** a report check passes and the model runs `kit status`
- **THEN** the output holds the image questions and the three report questions, and lists every derived item with its operation and operands
