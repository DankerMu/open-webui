## ADDED Requirements

### Requirement: Unsigned thinking is not replayed to Chat Completions

When an Anthropic Messages request is converted to Chat Completions, the converter SHALL drop `thinking` blocks that carry no signature, SHALL keep signed `thinking` blocks and `redacted_thinking` blocks as content parts, and SHALL keep an assistant turn whose blocks convert to nothing as an assistant message with empty content.

#### Scenario: Claude Code tool loop with an OpenAI-compatible reasoning model

- **GIVEN** a request with a user turn, an assistant turn `[thinking without signature, tool_use]`, and a user turn `[tool_result]`
- **WHEN** it is converted to Chat Completions
- **THEN** the messages are the user message, an assistant message with empty content and the tool call, and a tool message, in that order
- **AND** no message contains a content part of type `thinking`

#### Scenario: Signed and redacted thinking survive

- **GIVEN** an assistant turn with a signed `thinking` block or a `redacted_thinking` block
- **WHEN** it is converted
- **THEN** the block is kept unchanged as a content part, including `cache_control`

#### Scenario: Thinking-only assistant turn keeps its place

- **GIVEN** an assistant turn containing only an unsigned `thinking` block between two user turns
- **WHEN** it is converted
- **THEN** an assistant message with empty content stays between the two user messages
- **AND** a user turn whose blocks convert to nothing is still omitted
