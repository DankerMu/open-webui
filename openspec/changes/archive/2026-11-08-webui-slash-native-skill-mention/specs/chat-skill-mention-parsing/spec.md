## ADDED Requirements

### Requirement: Slash-menu skill mentions use the dollar form

A skill selected from the chat input's `/` menu SHALL be sent in the message text as `<${id}|{name}>`, so the backend extracts its id, injects its full content, and strips the marker before the model sees the text.

#### Scenario: Native skill selected from the slash menu

- **WHEN** a user types `/harness`, selects the native skill `Harness native skill` (id `harness-native-skill`), and sends the message
- **THEN** the request's user message content contains `<$harness-native-skill|Harness native skill>` and no `<@`, and the model's system message carries `<skill name="Harness native skill">`
