## ADDED Requirements

### Requirement: A resumed sub-agent receives the caller's task

When `sub_agent` resumes a Claude Code session, the prompt SHALL be the caller's `task` followed by a pointer to the plan file, and the plan file SHALL keep the original task.

#### Scenario: Follow-up instructions on resume

- **WHEN** a model calls `sub_agent` with `resume_session_id` and a follow-up task on the Claude Code runtime
- **THEN** Claude Code is resumed with that task as its prompt, and the plan file still holds the original task
