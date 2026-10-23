## ADDED Requirements

### Requirement: Verify refuses non-canonical workspace keys

Recovery-set verification SHALL refuse a workspace entry whose key is not already the canonical form of its chat id, before any restore step creates a volume from that key.

#### Scenario: Uppercase workspace key

- **WHEN** a recovery set lists its workspace archive under the key `CHAT-ID` while the record is bound to `chat-id`
- **THEN** verify fails with a recovery error naming the key as not canonical, and restore of the same set fails before creating any workspace volume
