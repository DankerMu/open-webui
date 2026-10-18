# ocu-crash-cut-markers Specification

## Purpose
Ensure transactional crash-test workers announce a cut only when its complete name is readable, without changing the operation boundary being tested or weakening recovery evidence.

## Requirements

### Requirement: Final cut-marker visibility implies complete readiness

Publication, copy, retirement and resolution crash workers SHALL expose the final readiness marker only after its complete expected cut text is available. Incomplete staging SHALL remain private to the fixture and SHALL NOT satisfy the parent's existence barrier. Successful publication SHALL leave no staging pathname. Marker bookkeeping SHALL NOT invoke armed production fault hooks or move execution past the selected crash cut.

#### Scenario: Writer pauses before completing marker text

- **WHEN** an in-scope worker has created staging storage but has not finished writing its cut name
- **THEN** the parent cannot observe the final marker path
- **AND** after publication the final marker contains exactly the requested cut name

#### Scenario: Production replacement and sync hooks are armed

- **WHEN** the worker announces its selected cut while production filesystem fault hooks are active
- **THEN** readiness publication bypasses those hooks
- **AND** the announcement cannot add a production operation or select a different crash boundary

### Requirement: Atomic readiness preserves crash-recovery oracles

The affected workers and parents SHALL retain every existing cut, exact marker-text assertion, child SIGKILL/exit-status check and subsequent recovery/refusal, inode, revision and content-conservation assertion. Resolution readiness SHALL retain its private-file and synchronization guarantees. No sleep, retry, skip or relaxed assertion SHALL substitute for complete marker publication.

#### Scenario: Parent kills at a published cut

- **WHEN** any of the four worker families publishes its complete selected cut marker
- **THEN** the parent validates the unchanged exact cut text and kills the child at that cut
- **AND** the original recovery/refusal and resource/content invariants remain active in the fresh-worker continuation
