## ADDED Requirements

### Requirement: Messages ingress in quiescence and restore identity; one-line OS-error refusals

Backup SHALL stop the sandbox Messages ingress together with the proxy, before preparing DocumentServer for shutdown and before stopping the other writers, and SHALL verify it stopped before capture. When the ingress container exists, backup SHALL refuse before stopping anything if its image, Compose project or service does not match the selected release and deployment. A deployment without an ingress container SHALL be backed up as before. Restore SHALL treat an existing ingress container on the target as a colliding resource. The backup, verify, restore and activate commands SHALL report an operating-system error as a one-line refusal without a traceback, and their successful output SHALL be unchanged.

#### Scenario: Backup closes both admission paths first

- **WHEN** an operator backs up a deployment whose proxy and Messages ingress are running
- **THEN** the proxy and then the ingress are stopped before DocumentServer is prepared for shutdown and before the other writers stop, and both are verified stopped before capture

#### Scenario: A foreign ingress is refused

- **WHEN** the ingress container runs an image the selected release does not accept for the proxy role, or belongs to another Compose project or service
- **THEN** backup refuses naming the container before stopping anything

#### Scenario: A deployment without an ingress container

- **WHEN** the deployment has no Messages ingress container
- **THEN** backup proceeds as before

#### Scenario: Restore refuses a target that already has an ingress

- **WHEN** the restore target already has a container with the ingress's fixed name
- **THEN** restore lists it among the colliding resources and refuses before writing anything

#### Scenario: An operating-system error is refused in one line

- **WHEN** backup, verify, restore or activate meets a permission or disk error
- **THEN** the command exits nonzero with a one-line refusal naming the error, prints no traceback, and writes nothing to standard output
