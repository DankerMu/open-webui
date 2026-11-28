# Tasks

## 1. Evaluation driver, request set and before run (OCU `deploy/eval`)

- [x] 1.1 Request selection by `set` (design Decision 11):
  - `--phase` accepts `report-before` and `report-after`;
  - with no `--request`, report phases run `set: "report"` and the other phases run entries without `set`;
  - a named `set` entry is refused in `baseline`, `after` and `smoke`;
  - a named entry without `set` is refused in report phases;
  - `report-unclear` runs only when named, in a report phase.

  Verify with `python -m pytest tests/deploy/test_eval_driver.py`, run locally because `build.yml` is disabled: plan contents for each phase, each refusal text, and no attempt created outside the phase directory (recovery completes interrupted attempts of any phase in place).

  **Task 1.1 required evidence** (issue #951; authoritative where it is more specific than the bullets above):
  - Triage: feature. Fixture level expanded, as the group declares: the driver partitions a shared host's run store and decides which requests a run sends.
  - Governing invariant: a run creates attempts only under `runs/<phase>/` and sends only the requests its phase owns; recovery alone completes an interrupted attempt of any phase in place. Explainer phases own the entries without `set`; report phases own the entries with `set`.
  - Risk packs:
    - Legacy compatibility — selected: `baseline`, `after` and `smoke` behave exactly as at `e3be359` when no entry carries `set`, which is true of today's `requests.json`. That includes recovery, which still scans every phase. Every existing test in `tests/deploy/test_eval_driver.py` passes unchanged. Downstream readers keep their formats: the manifest (`phase` is still derived from the attempt's path), the chat ledger `chats.txt` read by `cleanup.sh`, and the `runs/<phase>/<request>/r<n>-a<m>/` layout.
    - Data / state partitioning — selected: a run creates attempts only under `runs/<its phase>/`. The rerun budget (`trailing_infra`) already reads only the run's own phase. Recovery stays as at `e3be359`: it completes an interrupted attempt of any phase in place, with that attempt's phase in its manifest, and creates no attempt. The evaluation spec states this exception.
    - Failure handling — selected: every refusal happens before the lock, the sign-in or any POST, and prints `eval: refused: <text>`. The unknown-`set` refusal happens when `requests.json` is loaded (`Driver.__init__`); the selection refusals happen in `plan()`.
    - Documentation — selected: `deploy/eval/README.md` names the five phases and the selection rules, and the `--request` help text no longer says "default: all".
    - Not selected: auth (unchanged sign-in); concurrency (`eval.lock` and where it is taken are unchanged, and every refusal comes before `take_lock`, so the exclusion with `cleanup.sh` is untouched); attachments (task 1.2); manifest fields (task 1.3); request content (task 1.4).
  - Shape (OCU repository):
    - `--phase` choices become `baseline`, `after`, `smoke`, `report-before`, `report-after`. `run.sh`'s usage comment names all five.
    - A request entry may carry `set`, whose value is `report` or `report-smoke`. Loading `requests.json` refuses any other value with `request <id> has unknown set <value>`.
    - Selection in `plan()`:
      - no `--request`, report phase: the entries with `set: "report"`, each repetition, in file order;
      - no `--request`, other phase: the entries without `set`, each repetition, in file order;
      - an empty selection is refused: `no request in requests.json belongs to phase <phase>`;
      - named entry with `set`, in `baseline`, `after` or `smoke`: refused with `request <id> has set <set>; set entries run only in report phases`;
      - named entry without `set`, in a report phase: refused with `request <id> has no set; report phases run only set entries`;
      - a named `set: "report-smoke"` entry runs in a report phase; it is never selected without `--request`.
    - `--repetition` keeps its rules for any named entry.
    - Tests point the driver at a temporary `requests.json` through one module-level path constant. They do not edit the committed file.
  - Required tests (red first against `e3be359`, then green):
    - with a temporary request file holding two entries without `set`, one `set: "report"` entry with 2 repetitions and one `set: "report-smoke"` entry, the plan for each of the five phases with no `--request` lists exactly the expected (id, repetition) pairs;
    - each refusal above, asserting its text on stderr, exit 1, no POST to the fake WebUI and no new directory under `runs/`;
    - a `report-before` run of the `set: "report"` entry writes attempt directories only under `runs/report-before/`, each manifest has `phase` `report-before`, and the trees under the other four phase directories are byte-identical before and after (none holds an interrupted attempt);
    - a named `report-smoke` entry runs in `report-after` and is refused in `smoke`;
    - an interrupted attempt directory under `runs/baseline/` (a `pending.json`, no manifest) is completed in place by a `report-before` run: its manifest has `phase` `baseline` and `failure_reason` `driver interrupted`, and no attempt directory is added under `runs/baseline/`;
    - an unknown `set` value in the file is refused at load with its text, exit 1, no POST and no new directory under `runs/`.
  - Verification: `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/deploy/test_eval_driver.py -q --import-mode=importlib`, and `./tests/test-project-structure.sh`.

- [ ] 1.2 Attachments:
  - every listed file under `deploy/eval/fixtures/` is checked when the plan is built, and a missing one refuses the run before any chat;
  - each attachment is uploaded through `POST /api/v1/files/`, and its id is sent in the message `files`;
  - the manifest records each attachment's name and sha256.

  Verify with driver tests: the upload request shape, the message `files`, the manifest fields, and the refusal at plan time.

- [ ] 1.3 Report manifest fields:
  - `asked_user` is true when no MP4 was published and the final assistant message contains `？` or `?`;
  - `<name>.figures.json` files beside a published MP4 are collected into the run directory.

  Verify with driver tests on two fixture chats, one that asked and one that published an MP4 with a figures file.

- [ ] 1.4 Request set:
  - draft four new `report-*` requests, two attaching `deploy/eval/fixtures/<name>.csv` and `<name>.xlsx`;
  - draft `report-unclear` (`set: "report-smoke"`), which lacks the period and the units;
  - get the user's confirmation of the texts and fixtures, then commit them;
  - give `report-sales-q3` `set: "report"` and `repetitions: 2`.

  Verify with a test that holds the sha256 of every entry without `set` as committed constants taken from `e3be359`, and checks that `report-sales-q3` differs only by `repetitions` and `set`. Link the confirmation in the PR.

- [ ] 1.5 Run `report-before` on 27:
  - images from package `ocu-e3be359-webui-71b4f18`, with the eval `src` checkout at the merged driver commit;
  - ten judged attempts;
  - `report-unclear` once.

  Verify that each judged attempt has a manifest, and that each attachment request's first tool result shows the attachment synced into `/mnt/user-data/files/`. Summarize the manifests in this change.

- [ ] 1.6 Hand material check of the ten before videos, from key frames and audio. Record every figure with whether it matches the request, and every statement as backed, unbacked or slogan. Also record `report-unclear`'s `asked_user`. Verify that the records are written into this change.
- [ ] 1.7 Record two thresholds in this change: the render-success threshold, set from 1.5, and the a-priori check-pass threshold, using the metric definitions in the evaluation spec. Get the user's confirmation before any `report-after` run. Verify that the change holds both values and a dated link to the confirmation.

Suggested fixture level: expanded - it changes how a shared-host evaluation driver selects requests, uploads files through a live API, and partitions its run store.
Minimal mergeable slice: task 1.1, the selection rules with their tests. No entry carries `set` yet, so every existing run plan is unchanged.

## 2. Data foundations (OCU `remotion-template/bin`)

- [ ] 2.1 `kit data` for CSV, plus the shared option parser:
  - `kit.mjs` gets one small option parser for `--sheet`, and later `--preset`;
  - a reader script in `bin/` writes the pinned table format (design Decision 6): naming, UTF-8 with or without a BOM, number parsing with commas and `%`, the refusals, and replace on re-import.

  Verify with `node --test` cases on fixture CSVs: `q3 销售.csv` becomes `q3-销售`; a BOM header; `1,260`; `93%`; and every refusal. The written file must equal a committed fixture table that 2.3 also uses.

  **Task 2.1 required evidence** (issue #958; authoritative where it is more specific than the bullets above):
  - Triage: feature (new CLI subcommand and file format). Fixture level expanded, as the group declares.
  - Governing invariant: inside the kit, a table is read only from `data/<table>.json` (by the data module, the check and the renderer). Outside the kit, `bin/read_table.py` is the only reader of a source table file. The material check of task 7.1 calls it, and never parses tables itself.
  - Declared divergences from design Decision 6 and the spec:
    - cells carry a `unit` field (`%` or empty), which the spec's "a `%` cell has unit `%`" needs and Decision 6's JSON block lacks;
    - a CSV's `source.sheet` is `null`;
    - the table stores the first header cell as `label_header`, which Decision 5's verbatim header labels and the BOM scenario need;
    - "CJK characters" means characters of the Unicode Han script (`\p{Script=Han}`);
    - "40 characters" means 40 code points.
  - Risk packs:
    - Schema / file format — selected: the table format below is pinned, serialized by one writer, and written as one atomic file.
    - Input validation (untrusted file) — selected:
      - the file comes from the user;
      - the reader runs as `python3 -I <dir of kit.mjs>/read_table.py <real path>`, the project's own copy, and imports only the standard library;
      - the path must resolve inside the files root, as `image` checks.
    - Legacy compatibility — selected:
      - every existing subcommand keeps its argument handling, usage text, exit codes and stdout;
      - commands that declare no option keep today's exact positional-count check, so a positional starting with `-` (for example an `image` name) behaves as at `e3be359`;
      - every existing test passes unchanged, except the two declared updates: `notice-coverage.test.mjs` learns `.py` files, and `tests/test_remotion_image.py` counts 9 kit commands and exempts `data` from the skill-text check until task 6.2.
    - Failure handling — selected: every refusal exits 1 (usage errors exit 2), names the row and column, the cell or the limit where one applies, and writes nothing under `data/`. This includes failures of the reader process itself.
    - Documentation — not selected: the model learns `data` from `report-kit.md` in task 6.2 (#975), which also removes the skill-check exemption.
    - Not selected:
      - xlsx: task 2.2; a `.xlsx` path is refused as another type until then;
      - the data module: task 2.3;
      - the check hash: task 3.3; `project-hash.mjs` neither lists nor hashes `data/` yet;
      - CI: the CSV path needs only the runner's system `python3`; `template-tests.yml` runs on `ubuntu-24.04`, which has Python 3.12, as the workspace image does.
  - Consumers (verified, unchanged):
    - `new` copies `bin/read_table.py` into projects through `copyTree`, and the tree-equality test of `new` passes unchanged;
    - `tests/fixtures/data/` is neither copied into projects (`tests` is in `NOT_COPIED`) nor shipped in the image (`.dockerignore`);
    - the no-subcommand usage list gains a `data` line.
  - Shape (OCU repository):
    - **Option parsing.** One small parser in `kit.mjs`, used only by commands that declare options (only `data` now; `new --preset` later).
      - Tokens are read left to right:
        - `--sheet` takes the next token as its value;
        - `--` ends option parsing;
        - any other token starting with `--` is an unknown option;
        - every other token, including one starting with a single `-`, is a positional.
      - A missing value, a repeated option, an unknown option or a wrong positional count is a usage error. It exits 2, and stderr is exactly `kit data: usage: node bin/kit.mjs data "<path>" [--sheet <name>]\n`, in the existing usage style.
      - Commands without options keep `args.length !== command.args`.
    - **`data` command.** Usage `node bin/kit.mjs data "<path>" [--sheet <name>]`. It takes one positional and the option `--sheet`, and runs only inside a project; at the template root it gives the existing project hint. `--sheet` with a `.csv` is refused (exit 1): `--sheet applies only to .xlsx files`.
    - **Path.** A relative path resolves against the files root (`ctx.filesRoot`). The real path must lie inside it and be a regular file. The extension, case-insensitive, must be `.csv`. Refusals, as `image` words them:
      - `<path>: not found`;
      - `<path>: is outside <filesRoot>`;
      - `<path>: is not a regular file`;
      - `<path>: is not a .csv file`.
    - **Table name.** Computed in `kit.mjs` from the file stem:
      - lower case;
      - each whitespace run becomes `-`;
      - keep only `a-z`, `0-9`, `-` and `\p{Script=Han}`;
      - cut to 40 code points.

      An empty result is refused: `<path>: the file name gives an empty table name`.

    - **Reader protocol.** `bin/read_table.py` is standard library only for CSV, needs Python 3.10+, and starts with `# SPDX-License-Identifier: FSL-1.1-Apache-2.0` and the repository's copyright line.
      - On success it prints the table object as JSON on stdout and exits 0.
      - On a refusal it prints one line `refusal: <text>` on stderr and exits 1; `kit.mjs` writes `kit data: <text>` to stderr and exits 1.
      - Any other outcome — a traceback, an exit code other than 0 or 1, a refusal line missing, stdout that is not one JSON table object, or `python3` not found — gives `kit data: the table reader failed: <reason>` and exit 1. The reason is the last stderr line, the exit code, `bad output`, or `python3 not found`.
      - Nothing is written in any failure case.
    - **CSV parsing.**
      - The bytes decode as UTF-8, with an optional BOM. Undecodable bytes are refused: `<file>: is not UTF-8; save it as CSV UTF-8`.
      - It uses the Python `csv` default dialect.
      - Each cell is stripped of surrounding whitespace, and an empty cell is `null`.
      - A fully empty row is skipped.
    - **Numbers.**
      - A cell is a number when it fully matches `^-?(0|[1-9][0-9]{0,2}(,[0-9]{3})+|[1-9][0-9]*)(\.[0-9]+)?%?$`. The digits are ASCII only, so leading zeros such as `007` stay text, and so do `1,26` and `12.`.
      - Its `text` is the cell without thousands commas and without the `%`, keeping trailing zeros: `93.0%` gives `93.0`.
      - Its `unit` is `%` when the cell ends in `%`, else `""`.
      - Its `value` is the JSON number of `text` (`-0` gives `0`).
      - A number with more than 15 significant digits is refused, naming the cell: `row 3, column 销售额: more than 15 significant digits`.
      - `text` is the exact decimal that task 2.3 computes from; `value` is for display and sorting only.
    - **Text cells.** Any other non-empty cell is text: `value` `null`, `text` the cell, `unit` `""`.
    - **Table format** (`version` 1).
      - `kit.mjs` parses the reader's JSON, checks its shape and writes `<project>/data/<table>.json` through `writeAtomic`.
      - The bytes are `JSON.stringify(table, null, 2)` plus a final newline, with keys in the order shown and non-ASCII characters written as UTF-8.
      - The `data/` directory is created when absent. A symlink or non-directory there is refused, as `publicDir` words it: `kit data: <project>/data: is a symlink` or `kit data: <project>/data: is not a directory`.

      ```json
      {"version": 1,
       "source": {"file": "<basename>", "sheet": null, "sha256": "<hex of the file bytes>"},
       "label_header": "<header 1>",
       "columns": ["<header 2>", …],
       "rows": [{"label": "<first cell>", "cells": [{"value": 1260, "text": "1260", "unit": ""} | null, …]}]}
      ```

      `columns` holds the header cells after the first. Each row's `cells` has one entry per column.

    - **Limits and refusals.** Every stderr line below is prefixed with `kit data: `. `<file>` is the source file's basename, as in `source.file`. Rows are 1-based file rows, so a skipped empty row still counts. Columns are named by their header, or by their 1-based number when the header is empty.
      - `<file>: has no header row`;
      - `<file>: the header needs a label column and at least one data column`;
      - `<file>: has 13 columns; the limit is 12` (the label column counts);
      - `<file>: column 3 has an empty header`;
      - `<file>: duplicate header 销售额 in columns 2 and 3`;
      - `<file>: has no data row`;
      - `<file>: has 51 data rows; the limit is 50`;
      - `<file>: row 4 has 4 cells; the header has 3`. A shorter row pads with `null`;
      - `<file>: row 5 has an empty label`;
      - `<file>: row 5: duplicate label 华东, first in row 2`.
    - **Output on success.**
      - stdout line 1 is the table name.
      - Line 2 is all headers joined by tab, label header first.
      - Then come up to five rows. Each is the label and each cell's `text` followed by its `unit` (empty for `null`), joined by tab.
      - stderr says `kit data: wrote data/<table>.json` or `kit data: replaced data/<table>.json`.
    - **Repository tests outside the template.**
      - `notice-coverage.test.mjs` accepts `.py` files in `bin/` and checks their `# SPDX-License-Identifier:` line within the first 3 lines.
      - `tests/test_remotion_image.py` expects 9 commands. Its skill-text check exempts exactly `data`, with a comment that names task 6.2 (#975) as the exit.
    - **Committed fixtures.** `remotion-template/tests/fixtures/data/q3 销售.csv` is UTF-8 with a BOM. It has the header `地区,销售额,完成率,备注` and 6 data rows, including `1,260`, `93%`, a text cell, an empty cell, a cell with surrounding spaces, and one short row. A fully empty line sits between two data rows. The committed JSON therefore pins the `null` entries, the stripping and the skip. Its expected output is `remotion-template/tests/fixtures/data/q3-销售.json`. Task 2.3 uses this table.

  - Required tests (`remotion-template/tests/kit-data.test.mjs`, directly under `tests/` so the CI glob runs it; red first against `0e432c5`, then green):
    - **Committed fixture.** It imports to bytes equal to the committed JSON. `label_header` is `地区` with no U+FEFF. stdout line 2 starts with `地区`.
    - **Naming.**
      - `q3 销售.csv` gives `q3-销售`;
      - `Sales  Q3!.csv` gives `sales-q3`;
      - a 45-code-point stem is cut to 40;
      - `!!!.csv` is refused with its full stderr line.
    - **Numbers.**
      - `1,260` gives 1260 and `1260`;
      - `93%` gives 93, `93` and `%`;
      - `-5.50%` gives -5.5, `-5.50` and `%`;
      - `0.5` gives 0.5;
      - `1,26`, `12.`, `007` and full-width `１２` are text;
      - a 16-significant-digit number is refused.
    - **Refusals.** Each refusal above gives its exact text and exit code and leaves nothing under `data/`. Also covered:
      - a Latin-1 file;
      - a path outside the files root;
      - a symlink escaping it;
      - an `.xlsx` path;
      - `--sheet` on a CSV;
      - `data/` as a symlink;
      - `data/` as a file.
    - **Isolation.** A planted `csv.py` in the working directory and next to the input file, and a `PYTHONPATH` pointing at a planted module, are all ignored, and the import still succeeds.
    - **Reader failures.** A stub reader (a test-only copy of `bin/` whose `read_table.py` misbehaves) that raises, exits 3, or prints non-JSON gives `the table reader failed: …`. A `PATH` without `python3` gives `python3 not found`. In each case nothing is written.
    - **Limits.** 50 data rows import and 51 are refused. 12 columns import and 13 are refused. A duplicate label in the row after a skipped empty line is refused with the file row number, which counts the empty line.
    - **Re-import.** It replaces the file, and stderr says `replaced`.
    - **Option parsing.**
      - `data` with no path, with two paths, with `--bogus`, with `--sheet` and no value, or with `--sheet` twice is a usage error with the exact stderr;
      - `data -- "-x.csv"` and `data "-x.csv"` both treat `-x.csv` as the path;
      - `voice --sheet x` keeps its existing usage error;
      - `image` with a name starting with `-` behaves as at `e3be359`;
      - every existing usage line is unchanged.
    - **Template root.** `data` there is refused with the project hint.
  - Verification:
    - `node --test "remotion-template/tests/*.test.mjs"` from the repository root;
    - `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/test_remotion_image.py -q --import-mode=importlib`, run locally because no workflow runs it;
    - `./tests/test-project-structure.sh`.

- [ ] 2.2 `kit data` for xlsx with `openpyxl` (`data_only`):
  - the listed number formats, percent formats and float-leftover rounding;
  - merged ranges and other formats refused, naming the cell or range;
  - `--sheet`, and an unknown sheet refused.

  `template-tests.yml` adds `actions/setup-python` and `pip install openpyxl==3.1.5`, then checks `python3 -I -c 'import openpyxl'`. The PR flags this as a CI change. Verify with `node --test` cases on fixture xlsx files for each format, a formula cell, a merged range, an unknown sheet and the 50/51-row boundary.

- [ ] 2.3 The data module (design Decisions 2–4), a plain `.mjs` with no `node:` import, taking a script's `data` and a table map:
  - value strings and the quote rule: separators, unit adjacency, 一半;
  - `from` resolution and its failures;
  - the six operations with the percent convention, unit rules, cycles and zero divisors;
  - display text and rounding, and the 12-code-point limit;
  - the derived-item listing text.

  Verify with unit tests for every scenario of "Every figure comes from a data item", and for the display-text scenarios of "Figures display as supplied" ("Trailing zero kept", "Percentage rounding", "Derived count rounding"), using the committed fixture table. The rendering scenarios "Large value is not rescaled" and "No count-up" belong to task 4.1.

- [ ] 2.4 Placeholder expansion and the bare-digit rule in the data module:
  - expansion of `{<id>}`;
  - unknown ids;
  - the bare-digit failure with suggested ids;
  - period tokens and verbatim table labels allowed;
  - expanded-length measurement.

  Verify with unit tests for each scenario of "Narration and on-screen text carry figures only by placeholder" that needs no schema.

Suggested fixture level: expanded - it adds a CLI subcommand, a table file format and a CI dependency, and the module that decides every figure.
Minimal mergeable slice: task 2.1. The CSV path, the parser and the table format merge with no caller beyond `kit data`.

## 3. Preset plumbing (OCU `remotion-template`)

- [ ] 3.1 Per-preset gate (design Decision 8), with no report kind and no report theme yet:
  - approvals accept `report:<kind>` and `report:theme` ids;
  - the gallery renders each preset's candidates in that preset's theme candidates, and its export records one theme pick per preset;
  - `Root.tsx` and `check-rules.mjs` select the theme by `script.preset`;
  - `registry-approvals`, `theme`, `scenes` and `gallery` tests become per preset.

  Verify that the per-preset tests pass with today's approvals unchanged, plus `gallery-approvals.test.mjs` cases for a second preset's theme pick.

- [ ] 3.2 Schema union:
  - the explainer object unchanged;
  - a report object (design Decision 1) with `data`, the skeleton, the content shapes of "Report scene contents" for every candidate kind, the placeholder rules through the data module, and no `custom`;
  - the schema is built from a kind set: production passes the approved report kinds, which are none yet, and tests pass the full candidate set;
  - `validateScript(text, tables)`;
  - the JSON Schema regenerated per preset.

  Verify with schema tests for every scenario of "A preset key selects the report script", "The report skeleton" and "Report scene contents", and for "Period on the cover" and "Bare figure in a label", using the candidate kind set. Also verify the explainer non-regression test: the fixtures' validation, `timeline.json`, voice stems and probe output equal `e3be359`.

- [ ] 3.3 Wiring:
  - expansion at the three playback places (`explainer-scenes.mjs`, `voice-stem.mjs`, `scene-timing.mjs`), for reports only;
  - the CLI reads the `data/<table>.json` of every table the script references (by a `from` item, or by a scene's `table` or `series`) for check, timeline, voice and render;
  - `kit render` passes the tables as input props, and `Explainer.tsx` validates with them;
  - the passing-check hash covers the referenced tables.

  Verify with tests using the candidate kind set: a changed value changes only the affected stems; replacing a table after a passing check makes `kit render` refuse, including for a table used only by a `trend` scene; an explainer with literal `{x}` keeps its stems.

Suggested fixture level: expanded - it changes `script.json`, the kit's central file format, the approval gate and the text that voice binding hashes.
Minimal mergeable slice: task 3.1. It makes the gate per preset with no report entries, so every explainer test and approval stays as it is.

## 4. Report scenes, themes and gallery batches (OCU `remotion-template`)

Each batch task (4.2–4.6) lands in one PR with:

- its candidates and their gallery samples, in both report theme candidates for batch A and in the picked report theme afterwards;
- the user's review;
- the `report:` approval entries;
- registration of the approved kinds;
- the report example updated to use every approved image-free report kind.

This follows the explainer change's batches.

- [ ] 4.1 Component props: `KeyNumber` and `Chart` accept display text and value props. Report props skip `formatCount` and count-up, and bar axes start at 0. Verify with component render tests: report props show `12345元` with no count-up frame and a 0-based axis; explainer props still show `1.2万`, and explainer sample frames are unchanged.
- [ ] 4.2 Batch A:
  - theme candidates `report-light` and `report-dark`;
  - `cover` and the report `key-number`, the one body kind that makes a valid report possible;
  - the report `summary` and `end-card`;
  - the user's theme pick, with the other theme deleted;
  - the report example and `new --preset report`.

  Verify that the per-preset gate tests are green with the batch's approvals, that a report renders and probes in the picked report theme, and that `new --preset report` yields an example that passes validation unchanged and uses every approved image-free report kind.

- [ ] 4.3 Batch B: `kpi-grid`, `target-progress` and `share`. Verify that the gate tests are green with the batch's approvals, and run the render tests of the three kinds.
- [ ] 4.4 Batch C: `trend`, `ranking` and the report `chart`. Verify that the gate tests are green, and run render tests that include the trend-from-a-table-column scenario.
- [ ] 4.5 Batch D: `table`. Verify that the gate tests are green, and run the render test at 5 rows by 3 columns.
- [ ] 4.6 Batch E: the reused text kinds in the report theme (`comparison`, `concept-card`, `process-steps`, `timeline`, `image-callouts`), under the placeholder rule. Verify that the gate tests are green, and that a report holding an unapproved reused kind fails while explainers still accept it.

Suggested fixture level: expanded - it adds the components the report kinds bind to, and a user approval gate.
Minimal mergeable slice: task 4.1 alone. It changes only component props, with explainer output unchanged and no report kind registered.

## 5. Report check and figure sources (OCU `remotion-template`)

- [ ] 5.1 `kit check` report rules:
  - share parts exceed the whole;
  - a series mixes units;
  - `target-progress` units differ;
  - a figure longer than 12 code points.

  A rule applies only to approved kinds. Verify with check tests in which each rule fails a fixture and names the scene.

- [ ] 5.2 `kit status` after a passing report check prints the three report questions and the derived-item listing. Verify with a `status` output test on a passing report fixture.
- [ ] 5.3 `kit render` publishes `<name>.figures.json` (design Decision 10) for reports only, and only when the MP4 is published. Verify with render-job tests: a report publishes both files, and the figures file lists every data item's source, the table cells shown by `table` and series scenes, and the expanded narration; a failed render publishes neither; an explainer publishes no figures file.

Suggested fixture level: expanded - it adds a check gate and a published file format that the evaluation reads.
Minimal mergeable slice: task 5.1 alone. The rules fail only report scripts, and none run in production.

## 6. Image test and skill text (OCU)

- [ ] 6.1 `tests/test-docker-image.sh` runs an offline report fixture in the built image:
  1. `new --preset report`;
  2. `data` on a fixture `.xlsx`;
  3. `voice-import` with fixture audio;
  4. `timeline`;
  5. `check`;
  6. `render`.

  It asserts that the MP4 and the figures file exist. Verify by running it on the release build host for the PR's commit, and record the output in the PR.

- [ ] 6.2 `skills/public/remotion/report-kit.md` covers:
  - step 0, the material checklist with one question when it is incomplete;
  - `--preset report`;
  - `kit data`;
  - data items, the percent convention and placeholders;
  - the approved report kinds;
  - the remaining steps.

  `SKILL.md` is not changed. Verify with the static skill test: the kind list equals the approved report kinds, the material step comes first, and `custom` is not offered.

- [ ] 6.3 `SKILL.md` routes work reports to `report-kit.md`, updates its frontmatter description, and stays at most 80 lines. Open the PR and hold it until task 8.3 accepts. Verify with the static skill test for the routes and line count.

Suggested fixture level: compact - a new image test and skill text pinned by static tests. The runtime behavior is covered by groups 2–5.
Minimal mergeable slice: tasks 6.1 and 6.2 each merge on their own. Task 6.3 merges only after task 8.3 passes.

## 7. Material check script (OCU `deploy/eval`)

- [ ] 7.1 A material check script reads a run's figures file, the request text and the attachments. Attachment cells are read through the kit's table reader script, so there is one reader. The script:
  - matches every figure (number text plus unit) to a request figure, an attachment cell or a listed derivation;
  - flags Chinese-numeral quantities in labels and narration for hand review;
  - reports every unmatched figure with its scene.

  Verify with `python -m pytest` on fixtures: a passing run; `1068万` with no source; `1260亿元` against a request saying `1260万元`; and `近两成` flagged.

Suggested fixture level: expanded - it parses run output and is the acceptance oracle.
Minimal mergeable slice: atomic - one script and its fixtures. A partial matcher would report false passes.

## 8. After run and acceptance

- [ ] 8.1 Build the release candidate from OCU `main` plus the held 6.3 branch, recording both SHAs. Deploy it on 27 per `/home/nwm/ocu-eval/UPGRADE.md`, with the WebUI image of 1.5 and the `report-before` package kept. Run `report-after` (ten judged attempts) and `report-unclear` once. Verify that:
  - each judged attempt has a manifest;
  - its transcript shows a `--preset report` project, or the attempt is recorded as a `kit` failure;
  - each attachment synced;
  - each judged attempt that published an MP4 has its figures file collected;
  - the deployment is logged under `snap/`.
- [ ] 8.2 Run the material check (task 7.1) on every judged after video, and review statements and key frames by hand. Verify that the results are written into this change, run by run.
- [ ] 8.3 Generate the blind judging page with a sealed key. Have the user vote on the ten pairs, then open the key. Compute acceptance:
  - wins, with void pairs counted as losses;
  - the material check results;
  - both thresholds;
  - the `report-unclear` before and after record.

  Verify that the change holds the votes, the results and the decision.

- [ ] 8.4 On acceptance, merge 6.3, move the WebUI `constraints.yaml` OCU pin to the merged OCU commit, and add a decision record. Verify that the pin equals the merged commit and that `make decisions-verify` passes. On rejection, close 6.3 and record the outcome in this change.

Suggested fixture level: compact - evaluation execution, a pin bump and a decision record.
Minimal mergeable slice: atomic - the pin bump is the only code change, and it lands only after acceptance.
