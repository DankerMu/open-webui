# Spec Delta

## Purpose

Expose uploaded skills in three places: an administrator management tab, a personal preferences tab and a `/` menu group that names a skill in the outgoing message.

## ADDED Requirements

### Requirement: Administrator tab

When OCU workspace is enabled, Admin Settings SHALL show a 「工作区 Skills」 tab to administrators. The tab SHALL support:
- uploading a ZIP, showing the server's rejection reason on failure;
- listing every uploaded skill;
- editing each skill's access with the existing access-control component;
- deleting a skill only after a confirmation dialog.

The tab SHALL state that revocation and deletion reach running sandboxes only after they are rebuilt.

#### Scenario: Upload and list
- **WHEN** an administrator uploads a valid ZIP from the tab
- **THEN** the skill appears in the tab's list without a page reload

#### Scenario: Delete needs confirmation
- **WHEN** an administrator clicks delete and then cancels the dialog
- **THEN** no delete request is sent and the skill remains listed

### Requirement: Personal preferences tab

When OCU workspace is enabled, personal Settings SHALL show a 「工作区 Skills」 tab. The tab SHALL list the user's granted uploaded skills, each with a switch reflecting its enabled state. Changing a switch SHALL persist it, so the state survives a reload.

#### Scenario: Switch persists
- **WHEN** a user turns off `invoice-builder` and reloads the page
- **THEN** the switch is still off

### Requirement: Slash menu group

When OCU workspace is enabled, typing `/` in the chat input SHALL show a 「工作区 Skills」 group listing the user's enabled uploaded skills, whether or not the chat has a sandbox and whatever filters the selected model has. Built-in OCU skills SHALL NOT appear in the group. Selecting an entry SHALL insert a mention that the sent message serializes as `</ocu--{name}|{name}>`.

#### Scenario: Disabled skill absent
- **WHEN** a user has disabled `invoice-builder` and types `/`
- **THEN** `invoice-builder` is not in the 「工作区 Skills」 group

#### Scenario: Marker serialized
- **WHEN** a user selects `invoice-builder` from the group and sends the message
- **THEN** the request's user message content contains `</ocu--invoice-builder|invoice-builder>`

### Requirement: Hidden without workspace

When OCU workspace is disabled, none of the three entry points SHALL render, and the frontend SHALL NOT call any uploaded-skill endpoint.

#### Scenario: Disabled workspace
- **WHEN** `features.enable_ocu_workspace` is false and an administrator opens Admin Settings, personal Settings and the `/` menu
- **THEN** no 「工作区 Skills」 tab or group is shown and no request to `/api/v1/ocu/skills` is made
