# Proposal

## Why

Issue18 adds the missing tool-completion refresh hint while keeping authorized GET reconciliation as the only revision authority.

## What Changes

Emit one best-effort ocu:workspace_changed event from the existing shared tool completion hook after a completed MCP client attempt, including returned internal health/auth errors. None emitters, outer validation rejection and cancellation preserve existing semantics. No consumer or socket routing changes.

## Capabilities

### New Capabilities

- `ocu-workspace-hint`: completion-only, revision-free server event.

### Modified Capabilities

None.

## Impact

Expanded rather than suggested compact because \_run_tool is the shared entrypoint for all five public tools. Scope remains one hook, existing tests/test_tools.py and minimal existing docs/changelog; no dependency, deployment, WebUI handler or transport rewrite.
