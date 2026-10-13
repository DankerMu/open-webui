# Spec Delta

## ADDED Requirements

### Requirement: Configured Office lifecycle scenarios serve renderable versions

When a valid DOCX fixture is configured, the `office_unpublished` and `office_stale` scenarios SHALL preserve that file as their workspace version and provide a distinct renderable autosave version. Version and listing SHA-256 and size metadata SHALL describe the actual bytes. The browser evidence SHALL show recognizable read-only document content rather than an invalid-document preview error. The existing unconfigured route-only and intentionally corrupt-document behavior SHALL remain unchanged.

#### Scenario: Both configured versions contain readable document content

- **WHEN** either specialized scenario is initialized with the browser harness's valid DOCX input
- **THEN** its workspace bytes match that input and its autosave bytes are distinct valid DOCX content
- **AND** independent byte hashes and lengths match version metadata and the published listing
- **AND** identical fixture inputs produce deterministic version bytes

#### Scenario: Restore publishes the captured autosave without rewriting history

- **WHEN** the unpublished scenario restores its captured version2
- **THEN** the selected autosave bytes become the served workspace bytes and version3 is a published restore copy
- **AND** versions1 and2, their parent/source/published fields and file identity remain unchanged while workspace revision advances
- **AND** subsequent session creation succeeds

#### Scenario: Stale refusal preserves current content and permits the existing retry

- **WHEN** the stale scenario receives its first session-create request
- **THEN** it returns409 with unpublished_version, retires the old session and leaves version history and current workspace bytes unchanged
- **AND** the next create succeeds with a new session identity without restoring or publishing the autosave

#### Scenario: Browser prompts retain ordering with recognizable previews

- **WHEN** the browser walks the unpublished restore and stale start-current choices
- **THEN** read-only workspace previews display recognizable configured document content before evidence capture
- **AND** the restored autosave can be rendered read-only with its distinct content
- **AND** existing prompt, request-order, history and diagnostic assertions remain satisfied without implying real DocumentServer behavior

#### Scenario: Route-only and corrupt fixtures retain their contracts

- **WHEN** no DOCX input is configured, or the intentional corrupt-document scenario is selected
- **THEN** existing synthetic scenario bytes and lifecycle behavior, or the intentional preview failure respectively, remain unchanged
