## MODIFIED Requirements

### Requirement: Slash menu group

When OCU workspace is enabled, typing `/` in the chat input SHALL show a 「工作区 Skills」 group. The group SHALL list the user's enabled set of uploaded skills (design.md Decision 6 of change `ocu-uploaded-skills`), whether or not the chat has a sandbox and whatever filters the selected model has. Built-in OCU skills SHALL NOT appear in the group.

Display and matching:

- Each entry SHALL show its shown name: the display name when one is set, the English name otherwise.
- An entry with a display name SHALL also show its English name as secondary text.
- A query SHALL match either name, case-insensitively.
- Entries SHALL sort by shown name.

Selection:

- Selecting an entry SHALL insert a mention with id `ocu--{name}|{shown name}` and label `{shown name}`, as the native skill branch does (`CommandSuggestionList.svelte:144-148`).
- The mention SHALL use `mentionSuggestionChar: '/'`, because the chat input's `/` command sets no trigger char.
- The existing editor serializes only the id, with `/` written as `$` (`RichTextInput.svelte:117-125`, unchanged). The sent message therefore carries `<$ocu--{name}|{shown name}>`.

#### Scenario: Disabled skill absent

- **WHEN** a user has disabled `invoice-builder` and types `/`
- **THEN** `invoice-builder` is not in the 「工作区 Skills」 group

#### Scenario: Marker serialized

- **WHEN** `invoice-builder` has no display name and a user selects it from the group and sends the message
- **THEN** the request's user message content contains `<$ocu--invoice-builder|invoice-builder>`

#### Scenario: Display name shown and sent

- **WHEN** `invoice-builder` has display name `发票生成`, and a user types `/发票`, selects the entry and sends the message
- **THEN** all of the following hold:
  - the entry shows `发票生成` with `invoice-builder` as secondary text;
  - the inserted chip reads `发票生成`;
  - the request's user message content contains `<$ocu--invoice-builder|发票生成>`.

#### Scenario: English query still matches

- **WHEN** `invoice-builder` has display name `发票生成` and a user types `/invoice`
- **THEN** the entry is listed

## ADDED Requirements

### Requirement: Display name editing in the administrator tab

The administrator 「工作区 Skills」 tab SHALL show, for each listed skill, a display-name field holding the stored value and a save action. Saving SHALL update the row from the server response. A rejection SHALL show the server's reason and keep what the administrator typed in the field.

#### Scenario: Save a display name

- **WHEN** an administrator types `发票生成` into the field of `invoice-builder` and saves
- **THEN** the field shows `发票生成` after a page reload

#### Scenario: Rejected value

- **WHEN** an administrator saves a 33-character name
- **THEN** the server's reason is shown, the field keeps the typed text, and the stored name is unchanged

### Requirement: Display name in the personal tab

The personal 「工作区 Skills」 tab SHALL show each skill's shown name first and, when a display name is set, its English name as secondary text.

#### Scenario: Personal list with a display name

- **WHEN** `invoice-builder` has display name `发票生成` and a user opens the personal tab
- **THEN** its row shows `发票生成` and `invoice-builder`

#### Scenario: Personal list without a display name

- **WHEN** `pdf-tools` has no display name
- **THEN** its row shows `pdf-tools` once, with no secondary text

### Requirement: Sent message shows the mention label

In a sent or received chat message, a `$` mention whose serialized form carries a label (`<$id|label>`) SHALL render the label after the trigger char. A `$` mention without a label SHALL render its id. This applies to uploaded-skill mentions and to native skill mentions.

#### Scenario: Uploaded skill bubble

- **WHEN** a sent message contains `<$ocu--invoice-builder|发票生成>`
- **THEN** the message shows `$发票生成`

#### Scenario: Mention without label

- **WHEN** a message contains `<$invoice-builder>`
- **THEN** the message shows `$invoice-builder`

### Requirement: Uploaded skill call row label

This requirement covers a message tool call whose tool is `view` and whose `path` argument is exactly `/mnt/skills/user/{name}/SKILL.md`, where `{name}` matches the upload-name grammar `^[a-z0-9][a-z0-9-]{0,63}$`. The `path` argument is read from the decoded call arguments, whether the message stores them as raw JSON or HTML-entity-encoded.

Shown name:

- The call SHALL be labelled with the skill's shown name for the viewing user: the display name from the user's granted list, enabled or disabled, else `{name}`.
- The shown name SHALL be `{name}` when the viewer cannot read the skill, when it no longer exists, and when loading the list failed.

Labels by state:

| State                                         | Full label                      |
| --------------------------------------------- | ------------------------------- |
| preparing or executing                        | 「正在读取技能：{shown name}…」 |
| done, succeeded                               | 「使用技能：{shown name}」      |
| done, with a failed status or an error result | 「读取技能失败：{shown name}」  |
| rejected, awaiting approval, awaiting input   | upstream text, unchanged        |

- The short label SHALL show the shown name.
- The status icon and the expanded input and output SHALL be unchanged.

Unaffected calls: built-in skills under `/mnt/skills/public/`, other paths, and other tools SHALL keep the upstream rendering.

Workspace disabled: the shown name SHALL be `{name}`, and the frontend SHALL NOT call any uploaded-skill endpoint.

#### Scenario: Done call with a display name

- **WHEN** a message holds a done, successful `view` call on `/mnt/skills/user/invoice-builder/SKILL.md`, and `invoice-builder` has display name `发票生成`
- **THEN** the row reads 「使用技能：发票生成」 and the short label reads `发票生成`

#### Scenario: Running call

- **WHEN** the same call is preparing or executing
- **THEN** the row reads 「正在读取技能：发票生成…」

#### Scenario: Failed call

- **WHEN** the same call is done with status `failed` or with an error result
- **THEN** the row reads 「读取技能失败：发票生成」 with the upstream error icon

#### Scenario: Approval state unchanged

- **WHEN** the same call awaits approval or was rejected
- **THEN** the row shows the upstream approval or denied text for `view`

#### Scenario: Built-in skill unchanged

- **WHEN** a message holds a done `view` call on `/mnt/skills/public/docx/SKILL.md`
- **THEN** the row shows the upstream `view` label

#### Scenario: Other paths unchanged

- **WHEN** a message holds a done `view` call on `/mnt/skills/user/invoice-builder/scripts/run.py`, on `/mnt/skills/user/../SKILL.md`, or with arguments that are not valid JSON
- **THEN** the row shows the upstream `view` label

#### Scenario: Disabled but readable skill

- **WHEN** the viewer disabled `invoice-builder`, which has display name `发票生成`
- **THEN** the done row still reads 「使用技能：发票生成」

#### Scenario: Unreadable, deleted or unloaded skill

- **WHEN** the viewer's granted list has no `invoice-builder`, or loading the list failed
- **THEN** the done row reads 「使用技能：invoice-builder」

#### Scenario: Workspace disabled

- **WHEN** `features.enable_ocu_workspace` is false and a message holds a done `view` call on `/mnt/skills/user/invoice-builder/SKILL.md`
- **THEN** the row reads 「使用技能：invoice-builder」 and zero requests to `/api/v1/ocu/skills` are made

### Requirement: Collapsed tool group summary

When adjacent tool calls or reasoning blocks are collapsed into one group, the group summary SHALL list a matching uploaded-skill `view` call (requirement "Uploaded skill call row label") as 「使用技能：{shown name}」, in place of `view`. Equal entries SHALL be counted as upstream counts equal tool names. Other calls in the summary SHALL be unchanged.

#### Scenario: Skill read followed by bash

- **WHEN** a message holds a done `view` call on `/mnt/skills/user/invoice-builder/SKILL.md` directly followed by a `bash_tool` call, and `invoice-builder` has display name `发票生成`
- **THEN** the collapsed group summary reads `Explored 使用技能：发票生成, bash_tool` in its localized form, without expanding the group
