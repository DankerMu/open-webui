## ADDED Requirements

### Requirement: Composer offers thinking strength next to the model selector

In the main chat view, the message composer SHALL show a thinking-strength selector directly right of the model selector whenever exactly one model is selected, offering strength levels only, no token budgets. Vocabularies SHALL be: DeepSeek V4 family (`deepseek-flash-guan` and ids containing `deepseek-v4`) Off, High, Max with default High; Qwen3.8 family (ids starting with `qwen3.8-`) Off, Low, Medium, High, XHigh with default Medium, except `qwen3.8-2.4t-a95b` without Off; every other model, including ids ending in `-cc`, Low, Medium, High, XHigh with no default. While several models are selected no selector SHALL render. The trigger SHALL show a decorative icon and the current level, or `Default` when none is set (icon only on narrow screens), with accessible name `Thinking strength: <label>`; levels SHALL be radio menu items in vocabulary order with the current one checked. The note-embedded composer is unchanged.

#### Scenario: Family, generic and multi-model selections

- **WHEN** the composer has `qwen3.8-27b` selected, then `qwen3.8-2.4t-a95b`, then an unmatched model, then two models together
- **THEN** the selector shows Off, Low, Medium, High, XHigh; then Low, Medium, High, XHigh; then Default with Low, Medium, High, XHigh; and is absent for two models

### Requirement: Choice maps to chat params

The selector SHALL read and write the chat's `params`, the same object the Controls Reasoning Effort field edits. Off SHALL set `reasoning_effort` to null and `thinking` to `{"type":"disabled"}`; a level SHALL set `reasoning_effort` to the level and `thinking` to null. The values SHALL reach the model request through the existing params path and persist per chat through the existing params save.

#### Scenario: Request carries the mapped keys

- **WHEN** a user chooses Off and sends, then chooses High and sends
- **THEN** the first request's params carry `thinking: {"type":"disabled"}` and a null `reasoning_effort`, the second carry `reasoning_effort: "high"` and a null `thinking`
- **AND** reopening the chat shows High

### Requirement: Model changes never send an unsupported choice

When the selected model changes within a chat and the vocabulary changes: switching to a family model SHALL keep a choice its vocabulary contains and otherwise write its default; switching to a generic model SHALL remove both keys, so nothing is sent until the user picks; switching to several models SHALL remove both keys. Switching between two generic models SHALL keep the user's pick. On opening or switching chats, a family model with no choice set SHALL receive its default and no saved value SHALL be removed. Free text typed into the Controls field, and any value while several models are selected, SHALL be left unchanged.

#### Scenario: New chat and switches

- **WHEN** a new chat selects `qwen3.8-27b`, switches to `deepseek-v4.1-flash-1017`, the user picks Max, the chat switches to `qwen3.8-27b`, then to an unmatched model, and sends
- **THEN** the params carry `reasoning_effort: "medium"`, then `"high"`, then `"max"`, then `"medium"`, and the request after the switch to the unmatched model carries neither `reasoning_effort` nor `thinking`

#### Scenario: Generic pick survives a generic switch

- **WHEN** a chat on an unmatched model picks XHigh and switches to another unmatched model
- **THEN** the params still carry `reasoning_effort: "xhigh"`
