# chat-skill-mention-parsing Specification

## Purpose

How WebUI recognises and strips skill mention markers in chat messages, so that parsing stays linear in the message length and slash-menu picks produce the same marker as `$` picks.

## Requirements

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

### Requirement: Slash-menu skill mentions use the dollar form

A skill selected from the chat input's `/` menu SHALL be sent in the message text as `<${id}|{name}>`, so the backend extracts its id, injects its full content, and strips the marker before the model sees the text.

#### Scenario: Native skill selected from the slash menu

- **WHEN** a user types `/harness`, selects the native skill `Harness native skill` (id `harness-native-skill`), and sends the message
- **THEN** the request's user message content contains `<$harness-native-skill|Harness native skill>` and no `<@`, and the model's system message carries `<skill name="Harness native skill">`

### Requirement: Restored chat input keeps skill mention labels

When serialized chat text is put back into the chat input (draft restore, editing a queued message, or any other caller that sets the input's text), every skill mention SHALL serialize again to the same marker it was restored from: `<$id|label>` stays `<$id|label>`, `<$id>` stays `<$id>`, `</id|label>` becomes `<$id|label>`, and `<$id|>` becomes `<$id>`. A label containing `"` SHALL come back whole. The chip shown in the input SHALL read `$label`, or `$id` when there is no label.

#### Scenario: Uploaded skill survives a draft restore

- **WHEN** the input text `<$ocu--invoice-builder|发票生成> 做发票` is restored into the chat input and the message is sent
- **THEN** the request's user message content contains `<$ocu--invoice-builder|发票生成>` and the input showed the chip `$发票生成`

#### Scenario: Label with a double quote

- **WHEN** the input text `<$ocu--invoice-builder|发票"生成>` is restored and serialized again
- **THEN** the serialized text is `<$ocu--invoice-builder|发票"生成>`

#### Scenario: Native and unlabelled mentions unchanged

- **WHEN** the input text `<$native-skill|Native skill> and <$plain-id>` is restored and serialized again
- **THEN** the serialized text is `<$native-skill|Native skill> and <$plain-id>`
