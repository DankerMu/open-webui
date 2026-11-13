## ADDED Requirements

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
