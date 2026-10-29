## ADDED Requirements

### Requirement: A resumed sub-agent receives the caller's task

When `sub_agent` resumes a Claude Code session, the prompt SHALL begin with fixed text, followed by the caller's `task` and a pointer to the plan file, so caller text never begins the prompt. An empty or whitespace-only `task` SHALL resume with the fixed continue prompt. The plan file SHALL keep the original task.

#### Scenario: Follow-up instructions on resume

- **WHEN** a model calls `sub_agent` with `resume_session_id` and a follow-up task on the Claude Code runtime, including a task that starts with `-`
- **THEN** Claude Code is resumed with a prompt that starts with fixed text and contains that task, and the plan file still holds the original task
