## ADDED Requirements

### Requirement: Computer Use tool is attached at the harness level

For every chat completion request that carries a saved-chat id, the OCU global filter SHALL add the Computer Use tool to the request's tool ids exactly once, independent of the selected model, keeping any tools the user selected. The injection SHALL NOT depend on the system-prompt valve. Requests without a chat id, and requests whose chat id is a channel, temporary or local id, SHALL NOT receive the tool.

#### Scenario: Raw provider model chat

- **WHEN** a user chats with a provider model that has no tool configuration
- **THEN** the request reaches the provider with the Computer Use tool, and the model can write a file that appears in the chat's workspace

#### Scenario: User-selected tools kept

- **WHEN** a chat request already names other tools, or already names the Computer Use tool
- **THEN** the other tools remain and the Computer Use tool appears exactly once

#### Scenario: No saved chat

- **WHEN** a completion request carries no chat id, or a channel, temporary or local chat id
- **THEN** the filter leaves the request's tools unchanged

### Requirement: No wrapper workspace model

Deployment bootstrap SHALL NOT create a model that exists to carry the Computer Use tool. A one-off operator step SHALL remove such a model from an existing deployment idempotently.

#### Scenario: Fresh bootstrap

- **WHEN** a production-like deployment is bootstrapped
- **THEN** no model has the Computer Use tool in its configured tool ids and no model is named with the "(Computer Use)" suffix

#### Scenario: Existing deployment cleanup

- **WHEN** the operator runs the removal step twice on a deployment that has the wrapper model
- **THEN** the first run removes it and the second run reports nothing to remove

#### Scenario: Upgraded deployment

- **WHEN** an already-initialized deployment is upgraded through the documented procedure
- **THEN** the stored filter injects the tool, the removal step refuses to run before that refresh, and afterwards chats on a raw model and chats that used the wrapper model both get the Computer Use tool

### Requirement: Provider models visible to all users

In the production-like deployment, every provider model SHALL be visible to and usable by ordinary users without per-model access rows.

#### Scenario: Non-admin model choice

- **WHEN** a non-admin user opens the model selector after a fresh bootstrap
- **THEN** the provider models are listed and a chat with one of them succeeds with the Computer Use tool
