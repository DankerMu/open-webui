## ADDED Requirements

### Requirement: Skill mention labels stop at angle brackets

The backend SHALL recognise a skill mention as `<$id>`, `<$id|label>` or `</id|label>`, where `id` matches `[a-z0-9_-]+` and `label` contains neither `<` nor `>`. `extract_skill_ids_from_messages` SHALL return the id of every recognised mention in the text parts of the messages. `strip_skill_mentions` SHALL replace every recognised mention with its label, or with the empty string when it has none. The time either function takes on one text SHALL grow linearly with the text length.

#### Scenario: Unclosed starts scan in linear time

- **WHEN** a message's content is `"<$ocu--a|"` repeated 10000 times (90 KB)
- **THEN** `extract_skill_ids_from_messages` and `strip_skill_mentions` each return in under 0.25 s, and the content is unchanged

#### Scenario: Existing mention forms unchanged

- **WHEN** a message's content is `a <$x|X> b </y|Y> c`
- **THEN** the extracted ids are `{'x', 'y'}` and the stripped content is `a X b Y c`

#### Scenario: Label with an angle bracket not recognised

- **WHEN** a message's content is `<$b|c<d>`
- **THEN** no id is extracted and the content is unchanged
