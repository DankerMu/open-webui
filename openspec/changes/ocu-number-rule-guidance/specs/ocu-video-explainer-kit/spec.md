## ADDED Requirements

### Requirement: The model's guidance states the number rule

The explainer kit's skill reference (`skills/public/remotion/explainer-kit.md`) SHALL state the number rule that `validateScript` enforces for `key-number` values and chart points:

- below 10000 in size, at most 8 characters as written;
- from 10000 in size, below 1e12 with at most 2 decimals.

The JSON Schema description in `script.schema.json` SHALL name the rule as one that JSON Schema cannot express and `validateScript` enforces.

#### Scenario: The model follows the skill text

- **WHEN** the model rounds a value as the skill reference says, for example `12345.678` to `12345.68`
- **THEN** `kit check` accepts it without a number-rule reason
