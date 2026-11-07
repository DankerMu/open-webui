# Spec Delta

## Purpose

Give each user a list of the uploaded skills they are granted and a persistent per-user switch, which together define the user's enabled set used everywhere else.

## ADDED Requirements

### Requirement: Granted list with enabled state

An authenticated user SHALL receive every uploaded skill they can read under design.md Decision 6, each with its name, description and an `enabled` flag that is true exactly when the skill is in the user's enabled set (Decision 6), that is, false only when that user has disabled it. Skills the user cannot read SHALL NOT appear. The response SHALL NOT load or carry the ZIP bytes. When `ENABLE_OCU_WORKSPACE` is not `true` the endpoint SHALL return 404; without a session it SHALL return 401.

#### Scenario: Group-narrowed skill hidden

- **WHEN** `invoice-builder` is granted only to group A and a non-member requests the list
- **THEN** `invoice-builder` is not in the response

#### Scenario: Default-open skill listed enabled

- **WHEN** a freshly uploaded skill holds the `user:*` grant and any user requests the list
- **THEN** the skill is listed with `enabled: true`

### Requirement: Persistent per-user toggle

A user SHALL be able to disable and re-enable a skill they hold read access to. The state SHALL persist across sessions and SHALL affect only that user. Toggling a skill the user cannot read, or an unknown skill, SHALL return 404 and change nothing.

#### Scenario: Disable affects only the caller

- **WHEN** user U disables `invoice-builder` and user V does not
- **THEN** U's list shows `enabled: false`, V's list shows `enabled: true`, and the internal user-config for U omits the skill while V's includes it

#### Scenario: Ungranted toggle refused

- **WHEN** a user without read access toggles `invoice-builder`
- **THEN** the response is 404 and no disable state is stored
