## ADDED Requirements

### Requirement: Restore canonicalizes restored chat ids before reading host state

Before the restore cursor check reads a chat's host index, it SHALL canonicalize the chat id taken from the restored database with the same rule the broker listing uses. A chat id that is not canonical SHALL fail the restore with a recovery error before any host path derived from that id is opened.

#### Scenario: Tampered chat id in the restored database

- **WHEN** the restored database lists a live chat `../x` that also has a chat-state row with id `../x`
- **THEN** the restore fails with a recovery error and no path derived from that id is opened
