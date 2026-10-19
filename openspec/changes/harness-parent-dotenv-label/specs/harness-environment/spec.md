## ADDED Requirements

### Requirement: Harness environment reports the overridden parent flag state

Each time it is sourced, before applying its dotenv-disabling policy, the shared harness environment SHALL report the inherited `PYTHON_DOTENV_DISABLED` state of the sourcing command on stderr as one allowlisted label: `unset`, `false`, `1`, or `other` for any other value. The label describes the command whose environment is being constructed, not a previously started process. It SHALL NOT output a non-allowlisted raw value. The child environment SHALL still receive the disabling policy, so the reported parent label and the child flag remain distinct facts. The isolated UI verification runner SHALL relay that label from its environment staging step to its own stderr.

#### Scenario: Parent state is labelled before the override

- **WHEN** the shared harness environment is sourced once with the parent flag unset, `false`, `1`, or another value
- **THEN** stderr carries exactly one line labelling the parent state as `unset`, `false`, `1`, or `other` respectively
- **AND** the other value itself does not appear in the output
- **AND** the child still receives the disabling policy and loads no dotenv content

#### Scenario: UI verification receipt carries the label

- **WHEN** the isolated UI verification runner stages its environment
- **THEN** its own stderr carries the staging step's parent-state label line and no other relayed staging output
