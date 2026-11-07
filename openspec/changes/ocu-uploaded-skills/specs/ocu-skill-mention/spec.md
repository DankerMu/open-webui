# Spec Delta

## Purpose

Turn the `/` skill marker into a readable message plus an explicit instruction to the model to read the named skill, without changing OCU's server or native mention handling.

## ADDED Requirements

### Requirement: Marker rewrite and instruction

The OCU filter inlet SHALL recognise the marker `<$ocu--{name}|{label}>`, matching on the `<$ocu--` prefix, and SHALL handle each marker in the last user message as follows:

- replace the marker with `{label}` in both string content and text parts;
- append to the system message, once per distinct `{name}`, the sentence 「用户通过 / 指定使用 skill `{name}`，先阅读 `<available_skills>` 中它的 `SKILL.md` 再动手」.

Messages without a marker SHALL be left byte-identical. Markers in earlier messages SHALL be replaced with their label and SHALL NOT add a sentence.

#### Scenario: Single marker

- **WHEN** the last user message is `请用 <$ocu--invoice-builder|invoice-builder> 生成发票`
- **THEN** the forwarded message is `请用 invoice-builder 生成发票` and the system message ends with the instruction naming `invoice-builder`

#### Scenario: Repeated marker

- **WHEN** the same marker appears twice in the last user message
- **THEN** both are replaced and the instruction appears once

#### Scenario: No marker

- **WHEN** no message contains a marker
- **THEN** the body equals the body produced before this change

### Requirement: Fallback without the filter

When no OCU filter runs, the marker SHALL still be removed from the forwarded text by Open WebUI's native mention stripping, which leaves `{label}`. This relies on `SKILL_MENTION_STRIP_RE` (`middleware.py:2293`) matching the `$` form, and on the unknown id `ocu--{name}` being skipped as a native skill (`:2775-2780`).

#### Scenario: Model without OCU filter

- **WHEN** a message with `<$ocu--invoice-builder|invoice-builder>` is sent to a model that has no OCU filter
- **THEN** the content forwarded to the model contains `invoice-builder` and not the raw marker
