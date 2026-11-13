# ocu-uploaded-skill-preferences Specification

## Purpose

Give each user a list of the uploaded skills they are granted and a persistent per-user switch, which together define the user's enabled set used everywhere else.

## Requirements

### Requirement: Granted list with enabled state

An authenticated user SHALL receive every uploaded skill they can read under design.md Decision 6 of change `ocu-uploaded-skills`. Each entry SHALL carry:

- its name and description;
- its `display_name`, or `null` when none is set;
- an `enabled` flag that is true exactly when the skill is in the user's enabled set, that is, false only when that user has disabled it.

Skills the user cannot read SHALL NOT appear, and the response SHALL NOT load or carry the ZIP bytes. The toggle response SHALL carry the same fields for the toggled skill. When `ENABLE_OCU_WORKSPACE` is not `true` the endpoint SHALL return 404; without a session it SHALL return 401.

#### Scenario: Group-narrowed skill hidden

- **WHEN** `invoice-builder` is granted only to group A and a non-member requests the list
- **THEN** `invoice-builder` is not in the response

#### Scenario: Default-open skill listed enabled

- **WHEN** a freshly uploaded skill holds the `user:*` grant and any user requests the list
- **THEN** the skill is listed with `enabled: true`

#### Scenario: Display name listed

- **WHEN** `invoice-builder` has display name `发票生成`, `pdf-tools` has none, and a granted user requests the list
- **THEN** `invoice-builder` has `display_name: "发票生成"` and `pdf-tools` has `display_name: null`

#### Scenario: Toggle response carries the display name

- **WHEN** a user toggles `invoice-builder`, which has display name `发票生成`
- **THEN** the response carries `display_name: "发票生成"`

### Requirement: Persistent per-user toggle

A user SHALL be able to disable and re-enable a skill they hold read access to. The state SHALL persist across sessions and SHALL affect only that user. Toggling a skill the user cannot read, or an unknown skill, SHALL return 404 and change nothing.

#### Scenario: Disable affects only the caller

- **WHEN** user U disables `invoice-builder` and user V does not
- **THEN** U's list shows `enabled: false`, V's list shows `enabled: true`, and the internal user-config for U omits the skill while V's includes it

#### Scenario: Ungranted toggle refused

- **WHEN** a user without read access toggles `invoice-builder`
- **THEN** the response is 404 and no disable state is stored
