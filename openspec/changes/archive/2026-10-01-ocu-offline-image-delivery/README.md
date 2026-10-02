# Offline image delivery fixture

Issue33, task18.1; expanded critical release-integrity fixture. Source lives in the OCU deploy overlay; planning and acceptance live here. User-selected archive/configuration-digest contract is recorded in the proposed architecture decision.

## Fixture review

OfflineFixtureCompatibility and OfflineFixtureIntegrity independently reviewed the fixture. Initial revisions required archive-internal reference checks before load and tracked initializer-content checks at unchanged HEAD. Both requirements and their negative controls are included in design/spec/tasks; both reviewers returned PASS on the revised fixture. Strict OpenSpec validation passes.

## Evidence boundary

Source/fake-boundary proof does not attest image build, load semantics or WAN-free startup. Task4.1 remains mandatory in issue36 after all source development. Keep issue33 open and this fixture active until that evidence exists. Preserve the prior complete release; issue34 owns backup/rollback orchestration.

## Closure

Archived on 2026-10-01 by user decision (Plan 2 Stage 1) with task 4.1 still open: clean-store import and WAN-free restart on a real engine was never run and is not claimed as tested. The sentences above that tie archiving to that evidence are superseded by the umbrella closure contract of 2026-10-01. The capability spec is published so that later changes can modify it.
