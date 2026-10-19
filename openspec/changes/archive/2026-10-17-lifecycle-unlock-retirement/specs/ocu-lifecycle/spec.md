## ADDED Requirements

### Requirement: Lifecycle release retires its owner after unlock failure

An outermost lifecycle-lock release SHALL attempt to close its owned lock handle and clear retained owner state even if explicit unlock fails. It SHALL remove the completed outer depth and release the process-local lock. Unlock and close failures SHALL remain observable, including exception context when both fail; release SHALL NOT silently suppress them or retry an uncertain close. Nested release SHALL retain the outer lock until outermost release.

#### Scenario: Explicit unlock fails while close succeeds

- **WHEN** a deterministic fault raises only from the outer explicit unlock without releasing its real kernel flock
- **THEN** the original unlock error remains visible, the owned handle is closed and retired, and no completed outer depth remains
- **AND** the same chat can immediately acquire and release again without sleep or leaked thread ownership

#### Scenario: Cleanup itself reports failure

- **WHEN** the owned handle's close reports an error during outer release
- **THEN** close failure remains visible, retained owner state is cleared and the process-local lock is released
- **AND** any preceding unlock failure remains in the propagated exception context; no close retry is attempted

#### Scenario: Nested and independent process ownership

- **WHEN** normal nested calls enter and leave the same chat's lifecycle transaction
- **THEN** another process remains excluded while the outer transaction is held, including after the inner call exits
- **AND** after outer retirement, that process can acquire the same canonical lock and existing non-creating acquisition semantics remain intact
