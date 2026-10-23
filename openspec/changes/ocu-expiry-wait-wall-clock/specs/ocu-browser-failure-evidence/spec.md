## ADDED Requirements

### Requirement: Expiry waits cross the server's wall-clock deadline

A browser case that waits for a signed expiry before probing SHALL proceed only after the wall clock has passed the deadline. When its timer fires and the wall clock has not yet passed the deadline, for example after a backward clock step, it SHALL keep waiting, up to a bounded time past the deadline, and then fail with a message that names a wall-clock regression.

#### Scenario: Clock steps backwards during the wait

- **WHEN** the wall clock steps back by 200 ms while the case waits for a signed expiry
- **THEN** the case keeps waiting until the wall clock has passed the expiry and then sends the expiry probe

#### Scenario: Wall clock never crosses within the bound

- **WHEN** the wall clock stays at or before the signed expiry while the case has spent its whole extra waiting budget
- **THEN** the case fails with a message that names a wall-clock regression and sends no expiry probe
