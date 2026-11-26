## 1. Number rule in the guidance (#926)

- [ ] 1.1 State the 4.7 number rule in `explainer-kit.md` and in the `scriptSchema` description, regenerate `script.schema.json`, and pin both. Verify that the new pins fail on OCU `main` at `bce4aef` and pass after.

  **Task 1.1 required evidence** (issue #926):
  - **Fixture level:** compact. Only model-facing text and a schema description change. No rule, message or rendered frame changes.
  - **Risk packs:**
    - **Documentation / migration notes:** selected. This is the skill text the model reads.
    - **Schema / columns / units / field names:** selected. It covers the description string only; the `properties` of `script.schema.json` must stay byte-identical.
    - **Release / packaging:** not selected. `Dockerfile:361` (`COPY ./skills /mnt/skills/`) is unchanged, and the text reaches the model at the next image build.
    - **Legacy compatibility / examples:** not selected. `script.json` and `gallery/**` stay byte-identical.
    - **Public API / CLI:** not selected. `NUMBER_LIMIT` and every `kit` message stay unchanged.
  - **Shape.**
    - **`skills/public/remotion/explainer-kit.md`.** The first bullet under "Numbers and callouts" is replaced.
      - It still names `formatCount` and still contains "at most 8 code points".
      - It states both bounds: below 10000 in size, at most 8 characters as written, sign and point included (`1234.5678` → `1234.6`); from 10000 in size, below 1e12 with at most 2 decimals (`12345.678` → `12345.68`; the decimals do not show, since the value draws as `1.2万`).
      - It keeps that `kit check` refuses other values with a message stating the bounds.
      - No other line changes.
    - **`remotion-template/bin/script-schema.mjs`.** The `.describe(...)` string of `scriptSchema` gains one sentence: every `key-number` value and chart point must draw in 8 characters (below 10000 in size, at most 8 characters as written; from 10000 in size, below 1e12 with at most 2 decimals), which JSON Schema cannot express either, and `validateScript` enforces it. No other line changes.
    - **`remotion-template/script.schema.json`.** It is regenerated with the command in `tests/script-schema.test.mjs`'s equality test. `git diff` shows only the top-level `description` line.
    - **`tests/test_remotion_image.py`.** `test_kit_reference_states_the_facts_the_kit_enforces` gains the needles `below 1e12` and `at most 2 decimals`.
    - **`remotion-template/tests/script-schema.test.mjs`.**
      - Next to the existing assertion that the description names the custom rule (`:494`), add assertions that it names the number rule, matching `/below 1e12/` and `/at most 2 decimals/`.
      - Add the skill text's examples to the rule's value lists (`:832-833`): `12345.68` and `1234.6` accepted, `12345.678` and `1234.5678` rejected. They describe current behavior and pass on `bce4aef`; they tie the examples to the rule. The comment above the lists (`:826-827`) is extended to name the skill text as their source.
    - **Other readers, which stay green:** `test_skill_names_every_kit_command_and_no_other` (code spans may name only real `kit` commands), `test_skill_md_is_ours_and_mit` and `gallery.test.mjs:189` (scene schemas only).
  - **Required evidence.**
    1. **Red first.** On OCU `main` at `bce4aef`:
       - pytest fails with `AssertionError: below 1e12`; the needle loop stops at the first missing needle;
       - the node test fails on `assert.match` for `/below 1e12/`.

       That the second needle is absent too: `git grep -c "at most 2 decimals" bce4aef -- skills/public/remotion/explainer-kit.md remotion-template/script.schema.json` prints nothing and exits 1. (`script-schema.mjs` already holds the phrase in its comment and `NUMBER_LIMIT`; the node assertion reads the committed `script.schema.json`.)

    2. **Green.**
       - Pure template tests from both roots, under Node 22.23.2.
       - From the OCU root: `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/test_remotion_image.py -q --import-mode=importlib`. No PR workflow runs this file, so its evidence is local only, and the PR says so.
       - `tests/registry-approvals.test.mjs`, which reads `explainer-kit.md`'s kind table, passes unchanged.
    3. **Byte-identical:** `src/**`, `drawableNumber` and every other line of `script-schema.mjs`, `script.json`, `gallery/**`, and the `properties` of `script.schema.json`.

  - **Non-goals:**
    - changing the rule itself;
    - other skill sections;
    - #924.

Suggested fixture level: compact - one skill bullet, one description string, its regenerated file, two pins.
Minimal mergeable slice: atomic.
