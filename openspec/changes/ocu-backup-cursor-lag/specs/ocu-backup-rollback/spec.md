## ADDED Requirements

### Requirement: Backup refuses a cursor that leads its broker counter, before stopping anything

Before stopping any service, backup SHALL compare each live chat's `ocu_chat_state` cursor with the counter in that chat's broker index, read without running the broker, and SHALL refuse when a cursor exceeds its counter or a positive cursor has no index. The refusal SHALL name every such chat, its cursor and counter, and the remedies: delete the chat in Open WebUI and back up again, or reset that chat's cursor to the counter with the stack stopped. Chats whose cursor does not exceed the counter, and chat-state rows of chats that no longer exist, SHALL NOT be refused. Restore SHALL keep refusing the same condition, and its refusal SHALL name the same remedies.

#### Scenario: A live chat's cursor leads its counter

- **WHEN** backup runs on a deployment where a live chat's cursor is greater than its broker counter, or is positive with no broker index
- **THEN** backup refuses naming the chat, the cursor, the counter and the remedies, and no service is stopped and nothing is captured

#### Scenario: Healthy and orphan chats

- **WHEN** every live chat's cursor is at or below its counter, possibly with chat-state rows of deleted chats
- **THEN** backup proceeds as before

#### Scenario: Restore names the remedy

- **WHEN** restore meets a live chat whose cursor leads its recovered counter
- **THEN** it refuses as before and the message also names the remedies
