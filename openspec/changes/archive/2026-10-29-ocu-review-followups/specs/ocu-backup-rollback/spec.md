## ADDED Requirements

### Requirement: Restore broker-probe refusals name the chat

When restore's broker revision probe fails or returns malformed output for a chat, the refusal SHALL name that chat.

#### Scenario: The probe fails for a chat

- **WHEN** the selected release's broker probe fails or returns malformed output for a live chat
- **THEN** the refusal line for that chat starts with `chat <id>`
