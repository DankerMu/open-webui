## ADDED Requirements

### Requirement: Backup refuses an uncapturable tree before it stops the stack

Before backup stops any service, it SHALL scan, read-only and with the link policy of each tree's recovery component, every tree it will capture: the chat data directory, the skills cache, the WebUI data volume and each workspace volume of the selected deployment. If the scan finds a member that capture would refuse (an unsupported member type such as a socket or FIFO, a symlink the policy refuses, a second name inside the tree for the same symlink, too many members or too many bytes), or the WebUI initializer marker is missing, backup SHALL fail with that refusal while every service keeps its state, without stopping a container, sending the DocumentServer shutdown command, or allocating a recovery-set stage. An entry that disappears while the running tree is scanned SHALL be skipped. The capture after quiesce SHALL keep all of its own checks.

#### Scenario: Escaping link in a deployment-owned tree

- **WHEN** the skills cache contains a symlink to `/etc/passwd` and an operator starts a backup
- **THEN** backup fails naming the link, and no container was stopped

#### Scenario: FIFO in a workspace volume

- **WHEN** a workspace volume of the deployment contains a FIFO
- **THEN** backup fails naming the unsupported member, and no container was stopped
