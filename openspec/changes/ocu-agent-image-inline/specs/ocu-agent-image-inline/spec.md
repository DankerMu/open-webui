## ADDED Requirements

### Requirement: Images the agent writes during an OCU tool call render after that call

After an OCU `bash_tool`, `str_replace`, `create_file` or `sub_agent` call, the tool wrapper SHALL append a `New image: /mnt/user-data/files/<path>` line for each image file in the chat's outputs that the call created or changed, and WebUI SHALL render each such image in the reply right after that call, unless a message in the same reply already embeds it. A listing failure SHALL leave the tool result unchanged.

#### Scenario: A chart written by a command is shown after it

- **WHEN** a `bash_tool` call writes `chart.png` into `/mnt/user-data/files/`
- **THEN** its result ends with `New image: /mnt/user-data/files/chart.png`, and the reply renders that image right after the call

#### Scenario: An embedded chart is shown once

- **WHEN** the model also embeds `chart.png` with markdown in the same reply
- **THEN** the image renders once, from the markdown

#### Scenario: A listing failure changes nothing

- **WHEN** the outputs listing fails
- **THEN** the tool result is the command output alone
