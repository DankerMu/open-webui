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

The tab SHALL state both effect timings:

- revocation and deletion reach running sandboxes only after they are rebuilt;
- a replaced ZIP reaches running sandboxes that already mount the skill within minutes (the next system-prompt render for any granted user re-downloads it, roughly 60–420 s), while new sandboxes read the cache.

The tab content SHALL live in a new component; `SettingsModal.svelte` SHALL only register the tab and render it.

#### Scenario: Upload and list

- **WHEN** an administrator uploads a valid ZIP from the tab
- **THEN** the skill appears in the tab's list without a page reload

#### Scenario: Timing notice shown

- **WHEN** an administrator opens the tab
- **THEN** the tab shows the revocation notice and the replacement notice

#### Scenario: Delete needs confirmation

- **WHEN** an administrator clicks delete and then cancels the dialog
- **THEN** no delete request is sent and the skill remains listed

### Requirement: Personal preferences tab

When OCU workspace is enabled, personal Settings SHALL show a 「工作区 Skills」 tab. The tab SHALL list the uploaded skills the user can read (design.md Decision 6), each with a switch reflecting whether the skill is in the user's enabled set. The tab content SHALL live in a new component. Changing a switch SHALL persist it, so the state survives a reload.

#### Scenario: Switch persists

- **WHEN** a user turns off `invoice-builder` and reloads the page
- **THEN** the switch is still off

### Requirement: Slash menu group

When OCU workspace is enabled, typing `/` in the chat input SHALL show a 「工作区 Skills」 group listing the user's enabled set of uploaded skills (design.md Decision 6), whether or not the chat has a sandbox and whatever filters the selected model has. Built-in OCU skills SHALL NOT appear in the group. Selecting an entry SHALL insert a mention with id `ocu--{name}|{name}` and label `{name}`, as the native skill branch does (`CommandSuggestionList.svelte:136-139`), with `mentionSuggestionChar: '/'` because the chat input's `/` command sets no trigger char. The existing editor serializes only the id, with `/` written as `$` (`RichTextInput.svelte:117-125`, unchanged), so the sent message carries `<$ocu--{name}|{name}>`.

#### Scenario: Disabled skill absent

- **WHEN** a user has disabled `invoice-builder` and types `/`
- **THEN** `invoice-builder` is not in the 「工作区 Skills」 group

#### Scenario: Marker serialized

- **WHEN** a user selects `invoice-builder` from the group and sends the message
- **THEN** the request's user message content contains `<$ocu--invoice-builder|invoice-builder>`

### Requirement: Hidden without workspace

When OCU workspace is disabled, none of the three entry points SHALL render, and the frontend SHALL NOT call any uploaded-skill endpoint. Each entry point SHALL be checked separately with `/api/config` intercepted to set `features.enable_ocu_workspace=false`.

#### Scenario: Admin tab hidden

- **WHEN** `features.enable_ocu_workspace` is false and an administrator opens Admin Settings
- **THEN** no 「工作区 Skills」 tab is shown and zero requests to `/api/v1/ocu/skills` are made

#### Scenario: Personal tab hidden

- **WHEN** `features.enable_ocu_workspace` is false and a user opens personal Settings
- **THEN** no 「工作区 Skills」 tab is shown and zero requests to `/api/v1/ocu/skills` are made

#### Scenario: Slash group hidden

- **WHEN** `features.enable_ocu_workspace` is false and a user types `/` in the chat input
- **THEN** no 「工作区 Skills」 group is shown and zero requests to `/api/v1/ocu/skills` are made
