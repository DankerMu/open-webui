## Why

Task 4.7 (OCU PR 272, (#893)) added a number rule to `validateScript`. A `key-number` value or a chart point `v` is accepted in two cases:

- `|v| < 10000` and `String(v)` has at most 8 code points;
- `10000 ≤ |v| < 1e12` and `v` has at most 2 decimals.

The text the model reads is looser than that rule:

- **The skill text.** OCU `skills/public/remotion/explainer-kit.md:80` says to round "so its formatted form is at most 8 code points". `12345.678` (shown as `1.2万`), `123456789.123` (`1.2亿`) and `1.5e12` (`15000亿`) all pass that test, yet the rule refuses them.
- **The JSON Schema.** `explainer-kit.md:15` names `script.schema.json` as the authority. Its description names only the one-custom rule as beyond JSON Schema, and both number fields there are plain `{"type":"number"}`.

**Cost.** The model pays one extra `kit check` round trip, because the refusal message states both bounds. This change closes (#926).

## What Changes

- **`explainer-kit.md`, the first bullet of "Numbers and callouts".** It states the rule as `kit check` enforces it:
  - below 10000 in size, at most 8 characters as written, sign and point included;
  - from 10000 in size, below 1e12 with at most 2 decimals;
  - one example per case.

  It keeps the facts `tests/test_remotion_image.py` pins (`` `formatCount` ``, "at most 8 code points").

- **The `scriptSchema` description** in `bin/script-schema.mjs` also names the number rule as beyond JSON Schema and enforced by `validateScript`. `script.schema.json` is regenerated with the command its test names.
- **Pins.** `tests/test_remotion_image.py` pins the two bounds in the skill text. `tests/script-schema.test.mjs` asserts that the description names the number rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-video-explainer-kit`: the model's guidance states the number rule that `kit check` enforces.

## Impact

- **OCU files changed:**
  - `skills/public/remotion/explainer-kit.md`, one bullet;
  - `remotion-template/bin/script-schema.mjs`, the description string only;
  - `remotion-template/script.schema.json`, regenerated, so only its top-level `description` changes;
  - `tests/test_remotion_image.py`;
  - `remotion-template/tests/script-schema.test.mjs`.
- **No rule changes.** `drawableNumber`, every message and every `src/` file stay byte-identical.

## Triage

```text
Issue type: bugfix (model-facing guidance lags the rule)
Fixture level: compact (the schema/file-format trigger does not apply: only the description string changes, and the properties stay byte-identical)
Upstream suggested level: absent (issue says Size S)
Blast radius: the model rounds numbers against the wrong rule and wastes kit check rounds
Selected risk packs: Documentation / migration notes; Schema (description text only)
Evidence floor: pins red then green; pure template tests; test_remotion_image.py
```

No `design.md`: this is a compact fixture.
