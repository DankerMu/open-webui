# ocu-workspace-hint Specification

## Purpose

Notify the originating workspace of completed tool attempts without transferring revision authority or changing tool execution results.

## Requirements

### Requirement: Completion-only workspace hint

After an invoked MCP client attempt returns success, an error-valued result or an ordinary caught execution exception, the shared completion hook SHALL attempt exactly one ocu:workspace_changed event through the supplied server emitter. Its data SHALL contain exactly the validated chat_id and reason tool_completed, never revision or tool content. A returned internal health/auth rejection SHALL also count as a completed client attempt; the hint does not assert remote execution or file mutation. Existing outcomes and status events SHALL be preserved.

#### Scenario: Successful and failed completion

- **WHEN** an invoked MCP client attempt completes successfully, returns an error value or raises an ordinary caught exception
- **THEN** one workspace hint follows completion and the original return/error behavior remains unchanged

#### Scenario: Rejection and cancellation

- **WHEN** outer chat/config validation or header construction rejects before the MCP client call, or that call is cancelled
- **THEN** no workspace hint is emitted and cancellation still propagates

#### Scenario: Internal client preflight rejection

- **WHEN** an invoked MCP client returns a configuration error from its health/auth checks without remotely executing a tool
- **THEN** one hint is emitted and the configuration-error result and status remain unchanged

### Requirement: Optional best-effort notification

A missing emitter SHALL produce no notification and no additional failure. An ordinary exception from the hint emitter SHALL not change the completed tool outcome or cause another emission attempt. The hook SHALL reuse the injected server event path without choosing rooms or broadcasting directly.

#### Scenario: No emitter or broken emitter

- **WHEN** the emitter is None or throws while receiving the workspace hint
- **THEN** the same execution result is returned, no revision is invented and no notification retry occurs
