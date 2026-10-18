# Spec Delta

## ADDED Requirements

### Requirement: Output fixture prefix selection overrides inherited configuration

The output-endpoint app fixture SHALL interpret `prefix=None` as an unset public-prefix variable before application import, independently of the parent environment. Explicit empty-string root mode, explicit `/ocu` mode and the existing default SHALL retain their behavior. Real static requests and generated output URLs SHALL reflect the selected mode. Normal and exceptional fixture exit SHALL restore the complete prior environment and selected prior module objects by identity.

#### Scenario: Inherited prefix does not survive an unset selection

- **WHEN** the parent supplies `/ocu` and the output fixture selects `None`
- **THEN** a real root static request succeeds and seeded output URLs use the root rather than `/ocu`
- **AND** the public-prefix variable is absent during that fixture lifetime

#### Scenario: Explicit root and prefixed modes remain distinct

- **WHEN** the fixture selects an explicit empty string, explicit `/ocu`, or its existing default
- **THEN** static mounts and generated output URLs retain the corresponding root or prefixed behavior
- **AND** explicit empty configuration remains distinguishable from an unset variable

#### Scenario: Parent state survives normal and failing requests

- **WHEN** actual static/output requests finish normally or the test raises an intentional assertion after them
- **THEN** the client closes and the complete original environment and selected original module object identities are restored
- **AND** the intentional assertion remains observable
