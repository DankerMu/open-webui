## ADDED Requirements

### Requirement: Preflight requires the Messages ingress

The deployment preflight SHALL treat the sandbox Messages ingress as a required service, and SHALL refuse a resolved stack in which it is missing or is not attached to the sandbox network, naming the service.

#### Scenario: Ingress missing or off the sandbox network

- **WHEN** the resolved stack has no Messages ingress service, or has one that does not join the sandbox network
- **THEN** the check exits nonzero naming the Messages ingress, and no service starts
